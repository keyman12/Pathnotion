// Pulls events from connected Google Calendars into local calendar_events.
// Uses Google's syncToken for incremental syncs; falls back to a 60-day window if the token is missing/expired.

import { db } from '../db/client.js';
import { listEvents, type GoogleTokens } from './google-calendar.js';
import { decryptToken, encryptToken } from './token-vault.js';

interface SourceRow {
  id: number;
  user_key: string;
  email: string | null;
  provider: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expiry: number | null;
  scope: string | null;
  sync_token: string | null;
}

function sourceToTokens(row: SourceRow): GoogleTokens {
  return {
    access_token: decryptToken(row.access_token),
    refresh_token: decryptToken(row.refresh_token),
    expiry_date: row.token_expiry ?? null,
    scope: row.scope,
  };
}

/** Map an ISO datetime to our legacy `day_of_week` (0 = Mon .. 6 = Sun) and fractional hour. */
function extractDayAndHours(startIso: string, endIso: string): { day: number; start: number; end: number } {
  const start = new Date(startIso);
  const end = new Date(endIso);
  // JS: Sunday=0. We want Monday=0, Sunday=6.
  const jsDay = start.getDay();
  const day = (jsDay + 6) % 7;
  const startHour = start.getHours() + start.getMinutes() / 60;
  const endHour = end.getHours() + end.getMinutes() / 60;
  return { day, start: startHour, end: endHour };
}

/** Persist refreshed OAuth tokens back to the DB when googleapis rotates the access token. */
function persistRefreshedTokens(sourceId: number, tokens: GoogleTokens) {
  db.prepare(`
    UPDATE calendar_sources
    SET access_token = @accessToken,
        refresh_token = COALESCE(@refreshToken, refresh_token),
        token_expiry = @expiry,
        scope = COALESCE(@scope, scope)
    WHERE id = @id
  `).run({
    id: sourceId,
    accessToken: encryptToken(tokens.access_token),
    refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
    expiry: tokens.expiry_date,
    scope: tokens.scope,
  });
}

/**
 * Sync one connected source. Returns the number of events inserted/updated/deleted.
 * Errors are caught and logged; the calendar_source row is not removed on failure.
 */
export async function syncSource(source: SourceRow): Promise<{ ok: boolean; inserted: number; updated: number; deleted: number; error?: string }> {
  const tokens = sourceToTokens(source);
  if (!tokens.refresh_token && !tokens.access_token) {
    return { ok: false, inserted: 0, updated: 0, deleted: 0, error: 'No tokens stored for this source.' };
  }

  let syncToken = source.sync_token ?? null;
  let result;
  try {
    result = await listEvents(tokens, { syncToken });
  } catch (err: any) {
    if (err?.code === 'SYNC_TOKEN_EXPIRED') {
      // Retry without syncToken (full re-pull from scratch).
      syncToken = null;
      result = await listEvents(tokens, { syncToken: null });
    } else {
      return { ok: false, inserted: 0, updated: 0, deleted: 0, error: err?.message ?? 'Unknown error' };
    }
  }

  if (result.refreshedTokens) persistRefreshedTokens(source.id, result.refreshedTokens);

  const upsertStmt = db.prepare(`
    INSERT INTO calendar_events (
      title, day_of_week, start_hour, end_hour, who, kind, flag, source,
      source_id, start_iso, end_iso, all_day, location, description, attendees, etag, last_synced_at, external_id
    ) VALUES (
      @title, @day, @start, @end, @who, 'meet', NULL, 'google',
      @sourceId, @startIso, @endIso, @allDay, @location, @description, @attendees, @etag, datetime('now'), @externalId
    )
    ON CONFLICT(external_id) DO UPDATE SET
      title = excluded.title,
      day_of_week = excluded.day_of_week,
      start_hour = excluded.start_hour,
      end_hour = excluded.end_hour,
      start_iso = excluded.start_iso,
      end_iso = excluded.end_iso,
      all_day = excluded.all_day,
      location = excluded.location,
      description = excluded.description,
      attendees = excluded.attendees,
      etag = excluded.etag,
      last_synced_at = datetime('now')
  `);
  const deleteStmt = db.prepare('DELETE FROM calendar_events WHERE external_id = ? AND source_id = ?');

  let inserted = 0;
  let updated = 0;
  let deleted = 0;

  const run = db.transaction(() => {
    for (const e of result.events) {
      if (e.status === 'cancelled') {
        const r = deleteStmt.run(e.id, source.id);
        if (r.changes) deleted += r.changes;
        continue;
      }
      const { day, start, end } = extractDayAndHours(e.startIso, e.endIso);
      const info = upsertStmt.run({
        title: e.title,
        day,
        start,
        end,
        who: source.user_key,
        sourceId: source.id,
        startIso: e.startIso,
        endIso: e.endIso,
        allDay: e.allDay ? 1 : 0,
        location: e.location,
        description: e.description,
        attendees: JSON.stringify(e.attendees),
        etag: e.etag,
        externalId: e.id,
      });
      if (info.changes) {
        // lastInsertRowid is truthy for both insert and no-op updates; use changes to detect activity.
        // Better-sqlite3 does not directly distinguish, so we count optimistically as upserts.
        if (info.lastInsertRowid) inserted++;
        else updated++;
      }
    }
    db.prepare('UPDATE calendar_sources SET sync_token = ?, last_sync_at = datetime(\'now\') WHERE id = ?')
      .run(result.nextSyncToken ?? syncToken, source.id);
  });
  run();

  return { ok: true, inserted, updated, deleted };
}

/** Sync every connected calendar source. */
export async function syncAll(): Promise<{ sources: number; totalEvents: number; errors: string[] }> {
  const rows = db.prepare(
    "SELECT * FROM calendar_sources WHERE provider = 'google'",
  ).all() as SourceRow[];
  let totalEvents = 0;
  const errors: string[] = [];
  for (const source of rows) {
    try {
      const r = await syncSource(source);
      if (r.ok) totalEvents += r.inserted + r.updated;
      else errors.push(`${source.user_key}: ${r.error ?? 'unknown'}`);
    } catch (err) {
      errors.push(`${source.user_key}: ${(err as Error).message}`);
    }
  }
  return { sources: rows.length, totalEvents, errors };
}

/** Sync a single user. */
export async function syncUser(userKey: string): Promise<{ ok: boolean; inserted: number; updated: number; deleted: number; error?: string }> {
  const row = db.prepare(
    "SELECT * FROM calendar_sources WHERE user_key = ? AND provider = 'google' LIMIT 1",
  ).get(userKey) as SourceRow | undefined;
  if (!row) return { ok: false, inserted: 0, updated: 0, deleted: 0, error: 'Not connected' };
  return syncSource(row);
}

// ─── Scheduler ──────────────────────────────────────────────────────────────

let schedulerTimer: NodeJS.Timeout | null = null;

/** Runs `syncAll` every N minutes. Call once on server startup. */
export function startCalendarSyncScheduler(intervalMinutes = 5) {
  if (schedulerTimer) return;
  const period = Math.max(1, intervalMinutes) * 60_000;
  const tick = async () => {
    try {
      const { sources, totalEvents, errors } = await syncAll();
      if (sources) console.log(`[calendar-sync] synced ${sources} source(s) · ${totalEvents} event(s)` + (errors.length ? ` · errors: ${errors.join('; ')}` : ''));
    } catch (err) {
      console.error('[calendar-sync] scheduler tick failed:', err);
    }
  };
  // First tick after a short delay so startup isn't slowed.
  setTimeout(tick, 15_000);
  schedulerTimer = setInterval(tick, period);
}
