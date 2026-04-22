// Thin wrapper around googleapis for the pieces PathNotion needs:
// - Build an OAuth client from env + (optional) stored tokens.
// - Exchange an OAuth code for tokens.
// - List events for a date window.
// - Create / update / delete events.

import { google, type Auth, type calendar_v3 } from 'googleapis';

// PathNotion uses a single Google OAuth connection per user, covering both Calendar and Drive.
// Adding a scope here forces a re-consent for existing connections (Google requires re-grant on scope changes).
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  // Drive: read everything the user can see (for browsing) + manage files we create.
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export interface GoogleTokens {
  access_token: string | null;
  refresh_token: string | null;
  expiry_date: number | null; // unix ms
  scope: string | null;
}

export function requireEnv(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI).');
  }
  return { clientId, clientSecret, redirectUri };
}

export function isGoogleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

export function makeOAuthClient(tokens?: Partial<GoogleTokens>): Auth.OAuth2Client {
  const { clientId, clientSecret, redirectUri } = requireEnv();
  const client = new google.auth.OAuth2({ clientId, clientSecret, redirectUri });
  if (tokens) client.setCredentials({
    access_token: tokens.access_token ?? undefined,
    refresh_token: tokens.refresh_token ?? undefined,
    expiry_date: tokens.expiry_date ?? undefined,
    scope: tokens.scope ?? undefined,
  });
  return client;
}

export function authUrl(state: string): string {
  const client = makeOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',        // we need a refresh_token
    prompt: 'consent',             // force refresh_token on every grant
    scope: GOOGLE_SCOPES,
    include_granted_scopes: true,
    state,
  });
}

export async function exchangeCode(code: string): Promise<{ tokens: GoogleTokens; email: string | null }> {
  const client = makeOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  // Fetch the user's email so we can label the connection in the UI.
  let email: string | null = null;
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const userInfo = await oauth2.userinfo.get();
    email = userInfo.data.email ?? null;
  } catch { /* non-fatal */ }
  return {
    tokens: {
      access_token: tokens.access_token ?? null,
      refresh_token: tokens.refresh_token ?? null,
      expiry_date: tokens.expiry_date ?? null,
      scope: tokens.scope ?? null,
    },
    email,
  };
}

export function calendarApi(tokens: GoogleTokens): calendar_v3.Calendar {
  const client = makeOAuthClient(tokens);
  return google.calendar({ version: 'v3', auth: client });
}

/** Revoke the stored tokens at Google so the next connect triggers a fresh consent. */
export async function revokeTokens(tokens: GoogleTokens): Promise<void> {
  // Prefer the refresh token if we have one — revoking it kills all derived access tokens too.
  const token = tokens.refresh_token ?? tokens.access_token;
  if (!token) return;
  try {
    const url = 'https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(token);
    await fetch(url, { method: 'POST' });
  } catch (err) {
    console.warn('[google] revoke failed (non-fatal):', (err as Error).message);
  }
}

/** Basic connection sanity-check — used by the Settings "Test connection" button. */
export async function testConnection(tokens: GoogleTokens): Promise<{ ok: true; primaryCalendar: string } | { ok: false; error: string }> {
  try {
    const cal = calendarApi(tokens);
    const res = await cal.calendars.get({ calendarId: 'primary' });
    return { ok: true, primaryCalendar: res.data.summary ?? 'primary' };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export interface FetchedEvent {
  id: string;              // Google event id
  etag: string | null;
  title: string;
  startIso: string;        // ISO 8601
  endIso: string;          // ISO 8601
  allDay: boolean;
  location: string | null;
  description: string | null;
  attendees: string[];     // list of attendee emails (if any)
  status: 'confirmed' | 'cancelled' | 'tentative';
}

export interface EventListResult {
  events: FetchedEvent[];
  nextSyncToken: string | null;
  /** Non-null only when Google issued fresh credentials (e.g. refreshed access token). */
  refreshedTokens: GoogleTokens | null;
}

/**
 * Fetch events from the user's primary calendar.
 * - If `syncToken` is provided, we do an incremental sync (fast; only delta since last call).
 * - Otherwise we do a windowed sync (timeMin → timeMin + 60 days) and get a fresh syncToken.
 */
export async function listEvents(
  tokens: GoogleTokens,
  opts: { syncToken?: string | null; timeMinIso?: string; timeMaxIso?: string } = {},
): Promise<EventListResult> {
  const client = makeOAuthClient(tokens);
  const cal = google.calendar({ version: 'v3', auth: client });

  // Track if googleapis refreshed the access token during the call.
  let refreshed: GoogleTokens | null = null;
  client.on('tokens', (t) => {
    refreshed = {
      access_token: t.access_token ?? tokens.access_token,
      refresh_token: t.refresh_token ?? tokens.refresh_token,
      expiry_date: t.expiry_date ?? tokens.expiry_date,
      scope: t.scope ?? tokens.scope,
    };
  });

  const events: FetchedEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;

  // Loop paginated results.
  for (;;) {
    const params: Record<string, unknown> = {
      calendarId: 'primary',
      singleEvents: true,                // expand recurrences into individual instances
      showDeleted: true,                 // so we can drop cancelled ones locally
      maxResults: 250,
      pageToken,
    };
    if (opts.syncToken) {
      params.syncToken = opts.syncToken;
    } else {
      params.timeMin = opts.timeMinIso ?? new Date().toISOString();
      params.timeMax = opts.timeMaxIso ?? new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
      params.orderBy = 'startTime';
    }

    let res;
    try {
      res = await cal.events.list(params as any);
    } catch (err: any) {
      // A 410 means the syncToken is stale — caller should retry without it.
      if (err?.code === 410 || err?.response?.status === 410) {
        throw Object.assign(new Error('syncToken expired'), { code: 'SYNC_TOKEN_EXPIRED' });
      }
      throw err;
    }

    for (const item of res.data.items ?? []) {
      if (!item.id) continue;
      const start = item.start?.dateTime ?? item.start?.date ?? null;
      const end = item.end?.dateTime ?? item.end?.date ?? null;
      if (!start || !end) continue;
      events.push({
        id: item.id,
        etag: item.etag ?? null,
        title: item.summary ?? '(no title)',
        startIso: start,
        endIso: end,
        allDay: !!item.start?.date,
        location: item.location ?? null,
        description: item.description ?? null,
        attendees: (item.attendees ?? []).map((a) => a.email ?? '').filter(Boolean),
        status: (item.status as 'confirmed' | 'cancelled' | 'tentative') ?? 'confirmed',
      });
    }

    pageToken = res.data.nextPageToken ?? undefined;
    if (res.data.nextSyncToken) nextSyncToken = res.data.nextSyncToken;
    if (!pageToken) break;
  }

  return { events, nextSyncToken, refreshedTokens: refreshed };
}
