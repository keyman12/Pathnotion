import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '../db/client.js';
import { authUrl, exchangeCode, isGoogleConfigured, revokeTokens, testConnection, type GoogleTokens } from '../services/google-calendar.js';
import { decryptToken, encryptToken } from '../services/token-vault.js';
import { syncUser } from '../services/calendar-sync.js';

export const calendarRouter = Router();

// ─── Types + helpers for calendar_sources rows ──────────────────────────────

interface SourceRow {
  id: number;
  user_key: string;
  email: string | null;
  provider: string;
  endpoint: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expiry: number | null;
  scope: string | null;
  last_sync_at: string | null;
  connected_at: string | null;
  sync_token: string | null;
  mode: string;
}

function sourceToTokens(row: SourceRow): GoogleTokens {
  return {
    access_token: decryptToken(row.access_token),
    refresh_token: decryptToken(row.refresh_token),
    expiry_date: row.token_expiry ?? null,
    scope: row.scope,
  };
}

function requireUser(req: any): { key: string } {
  const key = req.session?.userKey;
  if (!key) throw Object.assign(new Error('Not authenticated'), { status: 401 });
  return { key };
}

// ─── Google OAuth connect / callback / disconnect / status ──────────────────

const STATE_STORE = new Map<string, { userKey: string; createdAt: number }>();
const STATE_TTL_MS = 10 * 60 * 1000;

function pruneStates() {
  const now = Date.now();
  for (const [k, v] of STATE_STORE) {
    if (now - v.createdAt > STATE_TTL_MS) STATE_STORE.delete(k);
  }
}

calendarRouter.get('/google/status', (req, res) => {
  try {
    const { key } = requireUser(req);
    if (!isGoogleConfigured()) return res.json({ configured: false, connected: false });
    const row = db.prepare(
      "SELECT id, email, connected_at, last_sync_at FROM calendar_sources WHERE user_key = ? AND provider = 'google' LIMIT 1",
    ).get(key) as { id: number; email: string | null; connected_at: string | null; last_sync_at: string | null } | undefined;
    res.json({
      configured: true,
      connected: !!row,
      email: row?.email ?? null,
      connectedAt: row?.connected_at ?? null,
      lastSyncAt: row?.last_sync_at ?? null,
    });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Server error' });
  }
});

calendarRouter.post('/google/connect', (req, res) => {
  try {
    const { key } = requireUser(req);
    if (!isGoogleConfigured()) return res.status(503).json({ error: 'Google OAuth not configured on the server.' });
    pruneStates();
    const state = crypto.randomBytes(18).toString('base64url');
    STATE_STORE.set(state, { userKey: key, createdAt: Date.now() });
    res.json({ url: authUrl(state) });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Server error' });
  }
});

calendarRouter.get('/google/callback', async (req, res) => {
  try {
    const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
    const code = String(req.query.code ?? '');
    const state = String(req.query.state ?? '');
    const errFromGoogle = req.query.error;
    if (errFromGoogle) {
      return res.redirect(`${webOrigin}/#calendar-connect-error=${encodeURIComponent(String(errFromGoogle))}`);
    }
    const mapped = STATE_STORE.get(state);
    STATE_STORE.delete(state);
    if (!code || !mapped) {
      return res.redirect(`${webOrigin}/#calendar-connect-error=invalid-state`);
    }

    const { tokens, email } = await exchangeCode(code);
    if (!tokens.access_token) {
      return res.redirect(`${webOrigin}/#calendar-connect-error=no-access-token`);
    }

    const existing = db.prepare(
      "SELECT id, refresh_token FROM calendar_sources WHERE user_key = ? AND provider = 'google' LIMIT 1",
    ).get(mapped.userKey) as { id: number; refresh_token: string | null } | undefined;

    // Google only issues refresh_token on first consent unless we pass prompt=consent — keep the
    // existing one around as a fallback in case Google declined to send a new one this round.
    const refreshToken = encryptToken(tokens.refresh_token) ?? existing?.refresh_token ?? null;

    if (existing) {
      db.prepare(`
        UPDATE calendar_sources
        SET email = @email,
            access_token = @accessToken,
            refresh_token = COALESCE(@refreshToken, refresh_token),
            token_expiry = @tokenExpiry,
            scope = @scope,
            connected_at = datetime('now')
        WHERE id = @id
      `).run({
        id: existing.id,
        email,
        accessToken: encryptToken(tokens.access_token),
        refreshToken,
        tokenExpiry: tokens.expiry_date,
        scope: tokens.scope,
      });
    } else {
      db.prepare(`
        INSERT INTO calendar_sources
          (user_key, email, mode, provider, endpoint, access_token, refresh_token, token_expiry, scope, connected_at)
        VALUES (@userKey, @email, 'oauth', 'google', NULL, @accessToken, @refreshToken, @tokenExpiry, @scope, datetime('now'))
      `).run({
        userKey: mapped.userKey,
        email,
        accessToken: encryptToken(tokens.access_token),
        refreshToken,
        tokenExpiry: tokens.expiry_date,
        scope: tokens.scope,
      });
    }

    // Close the popup / return the user to the Settings page.
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html><meta charset="utf-8"><title>Connected</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0f0f11;color:#e8e9eb;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}</style>
<div>
  <h1 style="font-size:20px">Google Calendar connected.</h1>
  <p style="color:#b5b6ba">You can close this tab and return to PathNotion.</p>
</div>
<script>
  try { if (window.opener) { window.opener.postMessage({ type:'pn:calendar-connected' }, '*'); window.close(); } } catch {}
  setTimeout(() => { location.href = ${JSON.stringify(webOrigin)}; }, 1500);
</script>`);
  } catch (err: any) {
    console.error('[calendar/google/callback]', err);
    res.status(500).send('OAuth callback failed: ' + (err.message ?? 'unknown'));
  }
});

calendarRouter.post('/google/disconnect', async (req, res) => {
  try {
    const { key } = requireUser(req);
    // Fetch tokens before we delete them so we can revoke at Google.
    const row = db.prepare(
      "SELECT access_token, refresh_token, token_expiry, scope FROM calendar_sources WHERE user_key = ? AND provider = 'google' LIMIT 1",
    ).get(key) as { access_token: string | null; refresh_token: string | null; token_expiry: number | null; scope: string | null } | undefined;
    if (row) {
      const tokens: GoogleTokens = {
        access_token: decryptToken(row.access_token),
        refresh_token: decryptToken(row.refresh_token),
        expiry_date: row.token_expiry ?? null,
        scope: row.scope,
      };
      await revokeTokens(tokens);
    }
    db.prepare("DELETE FROM calendar_sources WHERE user_key = ? AND provider = 'google'").run(key);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Server error' });
  }
});

calendarRouter.post('/google/test', async (req, res) => {
  try {
    const { key } = requireUser(req);
    const row = db.prepare(
      "SELECT * FROM calendar_sources WHERE user_key = ? AND provider = 'google' LIMIT 1",
    ).get(key) as SourceRow | undefined;
    if (!row) return res.status(404).json({ error: 'Not connected' });
    const result = await testConnection(sourceToTokens(row));
    res.json(result);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Server error' });
  }
});

// ─── Legacy seed-event endpoints (unchanged below) ──────────────────────────


const SELECT_EVENT = `
  SELECT id,
         title,
         day_of_week AS day,
         start_hour AS start,
         end_hour AS end,
         who,
         kind,
         flag,
         source,
         source_id AS sourceId,
         start_iso AS startIso,
         end_iso AS endIso,
         all_day AS allDay,
         location,
         description
  FROM calendar_events
`;

calendarRouter.get('/events', (_req, res) => {
  const rows = db.prepare(SELECT_EVENT + ' ORDER BY start_iso, day_of_week, start_hour').all();
  res.json(rows);
});

const createSchema = z.object({
  title: z.string().min(1),
  who: z.enum(['D', 'R', 'SHARED']),
  kind: z.enum(['shared', 'meet', 'deep', 'personal']).optional(),
  day: z.number().int().min(0).max(6),
  start: z.number(),
  end: z.number(),
  flag: z.string().nullish(),
  startIso: z.string().nullish(),
  endIso: z.string().nullish(),
  location: z.string().nullish(),
  description: z.string().nullish(),
});

calendarRouter.post('/events', (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const info = db.prepare(`
    INSERT INTO calendar_events (title, day_of_week, start_hour, end_hour, who, kind, flag, source, start_iso, end_iso, location, description)
    VALUES (@title, @day, @start, @end, @who, @kind, @flag, 'local', @startIso, @endIso, @location, @description)
  `).run({
    title: parsed.data.title,
    day: parsed.data.day,
    start: parsed.data.start,
    end: parsed.data.end,
    who: parsed.data.who,
    kind: parsed.data.kind ?? null,
    flag: parsed.data.flag ?? null,
    startIso: parsed.data.startIso ?? null,
    endIso: parsed.data.endIso ?? null,
    location: parsed.data.location ?? null,
    description: parsed.data.description ?? null,
  });
  const row = db.prepare(SELECT_EVENT + ' WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

const patchSchema = z.object({
  title: z.string().optional(),
  who: z.enum(['D', 'R', 'SHARED']).optional(),
  kind: z.enum(['shared', 'meet', 'deep', 'personal']).nullish(),
  day: z.number().int().min(0).max(6).optional(),
  start: z.number().optional(),
  end: z.number().optional(),
  flag: z.string().nullish(),
});

calendarRouter.patch('/events/:id', (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const sets: string[] = [];
  const params: Record<string, unknown> = { id: req.params.id };
  const map: Record<string, string> = {
    title: 'title = @title',
    who: 'who = @who',
    kind: 'kind = @kind',
    day: 'day_of_week = @day',
    start: 'start_hour = @start',
    end: 'end_hour = @end',
    flag: 'flag = @flag',
  };
  for (const [k, sql] of Object.entries(map)) {
    const v = (parsed.data as any)[k];
    if (v !== undefined) { sets.push(sql); params[k] = v; }
  }
  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
  const result = db.prepare(`UPDATE calendar_events SET ${sets.join(', ')} WHERE id = @id`).run(params);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  const row = db.prepare(SELECT_EVENT + ' WHERE id = ?').get(req.params.id);
  res.json(row);
});

calendarRouter.delete('/events/:id', (req, res) => {
  const result = db.prepare('DELETE FROM calendar_events WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

calendarRouter.post('/sync', async (req, res) => {
  try {
    const { key } = requireUser(req);
    const result = await syncUser(key);
    res.json(result);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Server error' });
  }
});
