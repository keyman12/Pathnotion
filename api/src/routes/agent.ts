import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { db } from '../db/client.js';
import {
  askJeff,
  clearMemories,
  countMemories,
  JOB_PROMPT_DEFAULTS,
  jeffStatus,
  listMemories,
  scanArticleMemories,
  scanDriveFiles,
  runWeeklySummary,
  type ChatTurn,
  type JeffMemory,
  type MemoryKind,
} from '../services/jeff.js';
import { runJobNow } from '../services/jeff-scheduler.js';
export const agentRouter = Router();

// 5MB is enough for any logo. Bigger images belong directly in Drive via the regular upload.
const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function requireUserKey(req: any): string {
  const key = req.session?.userKey;
  if (!key) throw Object.assign(new Error('Not authenticated'), { status: 401 });
  return key;
}

function loadStyleSheetData(): Record<string, any> {
  const row = db.prepare('SELECT data FROM jeff_style_sheet WHERE id = 1').get() as { data: string } | undefined;
  if (!row) return {};
  try { return JSON.parse(row.data); } catch { return {}; }
}

function saveStyleSheetData(data: Record<string, any>, by: string | null) {
  db.prepare(`
    INSERT INTO jeff_style_sheet (id, data, updated_at, updated_by)
    VALUES (1, @data, datetime('now'), @by)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = datetime('now'), updated_by = excluded.updated_by
  `).run({ data: JSON.stringify(data), by });
}

// ─── Status + chat ──────────────────────────────────────────────────────────

agentRouter.get('/status', (_req, res) => {
  res.json({ ...jeffStatus(), memories: countMemories() });
});

// Today-feed: every Jeff session run from today, plus the latest weekly summary if there's
// one from this week. Each row carries its full `body` so the Today modal can render the
// article without an extra fetch. Drives the cards under "Jeff · week so far" on Today.
agentRouter.get('/today-feed', (_req, res) => {
  const shape = (row: any) => {
    if (!row) return null;
    let tags: string[] = [];
    try { tags = JSON.parse(row.tags ?? '[]'); } catch { /* ignore */ }
    return { ...row, tags };
  };
  // All producing kinds run today (UTC date — close enough for our cadence).
  const today = new Date().toISOString().slice(0, 10);
  const todayRows = db.prepare(`
    SELECT id, kind, title, summary, body, tags, created_at AS createdAt, updated_at AS updatedAt
    FROM jeff_memories
    WHERE kind IN ('daily-news', 'competitor-features', 'research-refresh', 'weekly-summary')
      AND substr(created_at, 1, 10) = ?
    ORDER BY created_at DESC
  `).all(today) as any[];

  // Plus the latest weekly summary from anywhere in the last 7 days, so it's still surfaced
  // mid-week even though the job only fires Mondays.
  const latestWeekly = db.prepare(`
    SELECT id, kind, title, summary, body, tags, created_at AS createdAt, updated_at AS updatedAt
    FROM jeff_memories
    WHERE kind = 'weekly-summary'
      AND created_at >= datetime('now', '-7 days')
    ORDER BY created_at DESC
    LIMIT 1
  `).get() as any | undefined;

  // De-dupe — if today's set already has the weekly, don't add it twice.
  const ids = new Set(todayRows.map((r) => r.id));
  const runs = [...todayRows];
  if (latestWeekly && !ids.has(latestWeekly.id)) runs.push(latestWeekly);

  res.json({ runs: runs.map(shape) });
});

agentRouter.get('/conversations', (_req, res) => {
  const rows = db.prepare(`
    SELECT id, role, text, actions, created_at AS createdAt
    FROM agent_messages
    ORDER BY id DESC
    LIMIT 50
  `).all() as Array<{ actions: string | null }>;
  res.json(rows
    .map((r: any) => ({ ...r, actions: r.actions ? JSON.parse(r.actions) : null }))
    .reverse());
});

// Wipe the chat history. Useful when the founders want a fresh thread with Jeff —
// the next message starts with an empty short-term memory (long-term memory is untouched).
agentRouter.delete('/conversations', (_req, res) => {
  const r = db.prepare('DELETE FROM agent_messages').run();
  res.json({ removed: r.changes });
});

const messageSchema = z.object({ text: z.string().min(1).max(4000) });

// Real chat endpoint. Non-streaming for now — we can swap to streaming later if the wait feels long.
agentRouter.post('/message', async (req, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  db.prepare("INSERT INTO agent_messages (role, text) VALUES ('user', ?)").run(parsed.data.text);

  // Pull the last ~20 messages for short-term memory on this conversation.
  const history = (db.prepare(`
    SELECT role, text FROM agent_messages
    WHERE id <= (SELECT MAX(id) FROM agent_messages) - 1
    ORDER BY id DESC LIMIT 20
  `).all() as Array<{ role: string; text: string }>)
    .reverse()
    .map((m): ChatTurn | null => m.role === 'user' || m.role === 'agent'
      ? { role: m.role === 'agent' ? 'assistant' : 'user', content: m.text }
      : null)
    .filter((x): x is ChatTurn => x !== null);

  try {
    const result = await askJeff({ history, message: parsed.data.text });
    // Store the agent reply + any tool calls as the "actions" payload so the UI can show them.
    db.prepare("INSERT INTO agent_messages (role, text, actions) VALUES ('agent', ?, ?)").run(
      result.text,
      result.toolCalls.length ? JSON.stringify({ toolCalls: result.toolCalls }) : null,
    );
    res.json({ text: result.text, model: result.model, toolCalls: result.toolCalls });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Jeff couldn\'t reply.' });
  }
});

// ─── Memories ───────────────────────────────────────────────────────────────

agentRouter.get('/memories', (req, res) => {
  const kind = typeof req.query.kind === 'string' ? (req.query.kind as MemoryKind) : undefined;
  const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500);
  const list: JeffMemory[] = listMemories(limit, kind);
  res.json({ memories: list, counts: countMemories() });
});

agentRouter.post('/memories/scan', async (_req, res) => {
  try {
    const result = await scanArticleMemories();
    res.json(result);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Scan failed' });
  }
});

// Separate endpoint for the (heavier) Drive file scan — Anthropic cost + API time is higher,
// so we don't want the UI's "Scan articles" button to trigger both by accident.
agentRouter.post('/memories/scan-drive', async (_req, res) => {
  try {
    const result = await scanDriveFiles();
    res.json(result);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Drive scan failed' });
  }
});

agentRouter.delete('/memories', (req, res) => {
  const kind = typeof req.query.kind === 'string' ? (req.query.kind as MemoryKind) : undefined;
  const removed = clearMemories(kind);
  res.json({ removed });
});

// ─── Weekly summary — exposed directly for quick "run now" from the UI ──────

agentRouter.post('/weekly-summary', async (_req, res) => {
  try {
    const result = await runWeeklySummary();
    res.json(result);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Weekly summary failed' });
  }
});

// ─── Jobs ───────────────────────────────────────────────────────────────────

agentRouter.get('/schedule', (_req, res) => {
  const rows = db.prepare(`
    SELECT id, name, schedule, enabled, description, kind, prompt,
           last_run_at AS lastRunAt, next_run_at AS nextRunAt
    FROM agent_jobs
    ORDER BY name
  `).all() as Array<{ enabled: number }>;
  res.json(rows.map((r: any) => ({ ...r, enabled: Boolean(r.enabled) })));
});

// Expose the built-in default prompts so the UI can show them as placeholders / reset targets.
agentRouter.get('/schedule/prompt-defaults', (_req, res) => {
  res.json(JOB_PROMPT_DEFAULTS);
});

agentRouter.patch('/schedule/:jobId', (req, res) => {
  const body = z.object({
    enabled:     z.boolean().optional(),
    schedule:    z.string().min(1).max(100).optional(),
    name:        z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    // Nullable so the caller can clear an override with `prompt: null` (resets to default).
    prompt:      z.string().max(4000).nullable().optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json(body.error.flatten());
  const sets: string[] = [];
  const params: Record<string, unknown> = { id: req.params.jobId };
  if (body.data.enabled     !== undefined) { sets.push('enabled = @enabled');         params.enabled = body.data.enabled ? 1 : 0; }
  if (body.data.schedule    !== undefined) { sets.push('schedule = @schedule, next_run_at = NULL'); params.schedule = body.data.schedule; }
  if (body.data.name        !== undefined) { sets.push('name = @name');               params.name = body.data.name; }
  if (body.data.description !== undefined) { sets.push('description = @description'); params.description = body.data.description; }
  if (body.data.prompt      !== undefined) { sets.push('prompt = @prompt');           params.prompt = body.data.prompt; }
  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
  const result = db.prepare(`UPDATE agent_jobs SET ${sets.join(', ')} WHERE id = @id`).run(params);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// Create a new job row. `kind` is one of the built-in kinds — the scheduler knows how to run it.
const KNOWN_KINDS = ['scan-memories', 'scan-drive-files', 'weekly-summary', 'daily-news', 'competitor-features', 'research-refresh'] as const;
const newJobSchema = z.object({
  id:          z.string().min(1).max(60).regex(/^[a-z0-9-]+$/).optional(),
  name:        z.string().min(1).max(100),
  kind:        z.enum(KNOWN_KINDS),
  schedule:    z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  prompt:      z.string().max(4000).nullable().optional(),
  enabled:     z.boolean().optional(),
});
agentRouter.post('/schedule', (req, res) => {
  const parsed = newJobSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const id = parsed.data.id ?? `${parsed.data.kind}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    db.prepare(`
      INSERT INTO agent_jobs (id, name, schedule, enabled, description, kind, prompt)
      VALUES (@id, @name, @schedule, @enabled, @description, @kind, @prompt)
    `).run({
      id,
      name: parsed.data.name,
      schedule: parsed.data.schedule,
      enabled: parsed.data.enabled === false ? 0 : 1,
      description: parsed.data.description ?? '',
      kind: parsed.data.kind,
      prompt: parsed.data.prompt ?? null,
    });
    res.status(201).json({ id });
  } catch (err: any) {
    res.status(500).json({ error: (err as Error).message });
  }
});

agentRouter.delete('/schedule/:jobId', (req, res) => {
  const r = db.prepare('DELETE FROM agent_jobs WHERE id = ?').run(req.params.jobId);
  if (!r.changes) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

/** Run a job immediately, regardless of schedule. Returns once the run completes. */
agentRouter.post('/schedule/:jobId/run', async (req, res) => {
  try {
    const result = await runJobNow(req.params.jobId);
    res.json(result);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Run failed' });
  }
});

// ─── Runs ───────────────────────────────────────────────────────────────────

agentRouter.get('/runs', (_req, res) => {
  const rows = db.prepare(`
    SELECT id, job_id AS jobId, status, summary, changes, diff, ran_at AS ranAt
    FROM agent_runs
    ORDER BY ran_at DESC
    LIMIT 100
  `).all() as Array<{ diff: string | null }>;
  res.json(rows.map((r: any) => ({ ...r, diff: r.diff ? JSON.parse(r.diff) : null })));
});

// ─── Style sheet ────────────────────────────────────────────────────────────

agentRouter.get('/style-sheet', (_req, res) => {
  const row = db.prepare('SELECT data, updated_at AS updatedAt, updated_by AS updatedBy FROM jeff_style_sheet WHERE id = 1').get() as
    | { data: string; updatedAt: string; updatedBy: string | null } | undefined;
  if (!row) return res.json(null);
  try { res.json({ data: JSON.parse(row.data), updatedAt: row.updatedAt, updatedBy: row.updatedBy }); }
  catch { res.json(null); }
});

agentRouter.put('/style-sheet', (req, res) => {
  const data = req.body?.data;
  if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Expected { data: <object> }' });
  const by = (req as any).session?.userKey ?? null;
  saveStyleSheetData(data, by);
  res.json({ ok: true });
});

// Upload a logo (light or dark variant). Stores the file as a base64 data URL inside the
// style-sheet JSON — no Google Drive required, works on fresh installs, and the nightly DB
// backup covers it automatically. The renderers (PDF / PPTX) read the data URL directly.
agentRouter.post('/style-sheet/logo/:variant', logoUpload.single('file'), async (req, res) => {
  try {
    const variant = req.params.variant;
    if (variant !== 'light' && variant !== 'dark') {
      return res.status(400).json({ error: "variant must be 'light' or 'dark'" });
    }
    const userKey = requireUserKey(req);
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: 'Missing file.' });
    if (!/^image\//.test(file.mimetype)) {
      return res.status(400).json({ error: 'Logo must be an image.' });
    }

    const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    const logo = { dataUrl, name: file.originalname, mimeType: file.mimetype };

    const style = loadStyleSheetData();
    style.brand = style.brand ?? {};
    style.brand[variant === 'light' ? 'logoLight' : 'logoDark'] = logo;
    saveStyleSheetData(style, userKey);

    return res.status(201).json({ variant, logo });
  } catch (err: any) {
    return res.status(err.status ?? 500).json({ error: err.message ?? 'Upload failed' });
  }
});

// Clear a logo reference. Just removes the dataUrl from the style sheet.
agentRouter.delete('/style-sheet/logo/:variant', (req, res) => {
  try {
    const variant = req.params.variant;
    if (variant !== 'light' && variant !== 'dark') {
      return res.status(400).json({ error: "variant must be 'light' or 'dark'" });
    }
    const userKey = requireUserKey(req);
    const style = loadStyleSheetData();
    style.brand = style.brand ?? {};
    const key = variant === 'light' ? 'logoLight' : 'logoDark';
    style.brand[key] = null;
    saveStyleSheetData(style, userKey);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Failed to clear logo' });
  }
});

// ─── Competitors ────────────────────────────────────────────────────────────

const competitorSchema = z.object({
  id:            z.string().min(1).max(40).optional(),
  name:          z.string().min(1).max(100),
  homepage:      z.string().url().nullable().optional(),
  pressPageUrl:  z.string().url().nullable().optional(),
  notes:         z.string().nullable().optional(),
  focusAreas:    z.array(z.string()).optional(),
  region:        z.string().nullable().optional(),
  enabled:       z.boolean().optional(),
  sortOrder:     z.number().optional(),
});

agentRouter.get('/competitors', (_req, res) => {
  const rows = db.prepare(`
    SELECT id, name, homepage, press_page_url AS pressPageUrl, notes, focus_areas AS focusAreas,
           region, enabled, sort_order AS sortOrder
    FROM jeff_competitors
    ORDER BY sort_order, name
  `).all() as Array<{ enabled: number; focusAreas: string | null }>;
  res.json(rows.map((r: any) => ({
    ...r,
    enabled: Boolean(r.enabled),
    focusAreas: r.focusAreas ? JSON.parse(r.focusAreas) : [],
  })));
});

agentRouter.post('/competitors', (req, res) => {
  const parsed = competitorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const id = parsed.data.id ?? `c_${Math.random().toString(36).slice(2, 10)}`;
  db.prepare(`
    INSERT INTO jeff_competitors (id, name, homepage, press_page_url, notes, focus_areas, region, enabled, sort_order)
    VALUES (@id, @name, @homepage, @press, @notes, @focusAreas, @region, @enabled, @sortOrder)
  `).run({
    id,
    name: parsed.data.name,
    homepage: parsed.data.homepage ?? null,
    press: parsed.data.pressPageUrl ?? null,
    notes: parsed.data.notes ?? null,
    focusAreas: JSON.stringify(parsed.data.focusAreas ?? []),
    region: parsed.data.region ?? null,
    enabled: parsed.data.enabled === false ? 0 : 1,
    sortOrder: parsed.data.sortOrder ?? 0,
  });
  res.status(201).json({ id });
});

agentRouter.patch('/competitors/:id', (req, res) => {
  const parsed = competitorSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const sets: string[] = [];
  const params: Record<string, unknown> = { id: req.params.id };
  if (parsed.data.name          !== undefined) { sets.push('name = @name');                       params.name = parsed.data.name; }
  if (parsed.data.homepage      !== undefined) { sets.push('homepage = @homepage');               params.homepage = parsed.data.homepage; }
  if (parsed.data.pressPageUrl  !== undefined) { sets.push('press_page_url = @press');            params.press = parsed.data.pressPageUrl; }
  if (parsed.data.notes         !== undefined) { sets.push('notes = @notes');                     params.notes = parsed.data.notes; }
  if (parsed.data.focusAreas    !== undefined) { sets.push('focus_areas = @focus');               params.focus = JSON.stringify(parsed.data.focusAreas); }
  if (parsed.data.region        !== undefined) { sets.push('region = @region');                   params.region = parsed.data.region; }
  if (parsed.data.enabled       !== undefined) { sets.push('enabled = @enabled');                 params.enabled = parsed.data.enabled ? 1 : 0; }
  if (parsed.data.sortOrder     !== undefined) { sets.push('sort_order = @sortOrder');            params.sortOrder = parsed.data.sortOrder; }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  sets.push("updated_at = datetime('now')");
  const r = db.prepare(`UPDATE jeff_competitors SET ${sets.join(', ')} WHERE id = @id`).run(params);
  if (!r.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

agentRouter.delete('/competitors/:id', (req, res) => {
  const r = db.prepare('DELETE FROM jeff_competitors WHERE id = ?').run(req.params.id);
  if (!r.changes) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

agentRouter.get('/tracked-features', (req, res) => {
  const competitorId = typeof req.query.competitorId === 'string' ? req.query.competitorId : null;
  const where = competitorId ? 'WHERE competitor_id = ?' : '';
  const params = competitorId ? [competitorId] : [];
  const rows = db.prepare(`
    SELECT id, competitor_id AS competitorId, name, summary, source_url AS sourceUrl, discovered_at AS discoveredAt
    FROM jeff_tracked_features ${where}
    ORDER BY discovered_at DESC
    LIMIT 200
  `).all(...params);
  res.json(rows);
});

// ─── Pinned Drive folders (Jeff's scan scope) ─────────────────────────────

agentRouter.get('/pinned-folders', (_req, res) => {
  const rows = db.prepare(`
    SELECT drive_folder_id AS driveFolderId, folder_name AS folderName, pinned_at AS pinnedAt, pinned_by AS pinnedBy
    FROM jeff_pinned_folders
    ORDER BY folder_name
  `).all();
  res.json(rows);
});

const pinSchema = z.object({ driveFolderId: z.string().min(1), folderName: z.string().min(1) });
agentRouter.post('/pinned-folders', (req, res) => {
  const parsed = pinSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const by = (req as any).session?.userKey ?? null;
  db.prepare(`
    INSERT INTO jeff_pinned_folders (drive_folder_id, folder_name, pinned_at, pinned_by)
    VALUES (@driveFolderId, @folderName, datetime('now'), @by)
    ON CONFLICT(drive_folder_id) DO UPDATE SET folder_name = excluded.folder_name
  `).run({ ...parsed.data, by });
  res.status(201).json({ ok: true });
});

agentRouter.delete('/pinned-folders/:id', (req, res) => {
  const r = db.prepare('DELETE FROM jeff_pinned_folders WHERE drive_folder_id = ?').run(req.params.id);
  if (!r.changes) return res.status(404).json({ error: 'Not pinned' });
  res.status(204).send();
});

// ─── Jeff operational settings (scan cap lives here) ──────────────────────

agentRouter.get('/settings', (_req, res) => {
  const row = db.prepare('SELECT jeff_scan_cap AS scanCap FROM workspace_config WHERE id = 1').get() as { scanCap: number | null } | undefined;
  const pinnedCount = (db.prepare('SELECT COUNT(*) AS n FROM jeff_pinned_folders').get() as { n: number }).n;
  res.json({ scanCap: row?.scanCap ?? 40, pinnedCount });
});

agentRouter.put('/settings', (req, res) => {
  const parsed = z.object({ scanCap: z.number().int().min(1).max(500) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  // Make sure the singleton workspace_config row exists first.
  db.prepare("INSERT OR IGNORE INTO workspace_config (id) VALUES (1)").run();
  db.prepare("UPDATE workspace_config SET jeff_scan_cap = ?, updated_at = datetime('now') WHERE id = 1").run(parsed.data.scanCap);
  res.json({ ok: true });
});

// ─── Access grants (unchanged) ──────────────────────────────────────────────

agentRouter.get('/access', (_req, res) => {
  const rows = db.prepare(`
    SELECT module, can_read AS "read", can_write AS "write", last_touched AS lastTouched
    FROM access_grants
  `).all() as Array<{ read: number; write: number }>;
  res.json(rows.map((r: any) => ({ ...r, read: Boolean(r.read), write: Boolean(r.write) })));
});

agentRouter.patch('/access', (req, res) => {
  const body = z.object({
    module: z.enum(['calendar', 'docs', 'backlog', 'tasks']),
    read: z.boolean().optional(),
    write: z.boolean().optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json(body.error.flatten());
  const sets: string[] = [];
  const params: Record<string, unknown> = { module: body.data.module };
  if (body.data.read !== undefined) { sets.push('can_read = @read'); params.read = body.data.read ? 1 : 0; }
  if (body.data.write !== undefined) { sets.push('can_write = @write'); params.write = body.data.write ? 1 : 0; }
  sets.push("last_touched = datetime('now')");
  const result = db.prepare(`UPDATE access_grants SET ${sets.join(', ')} WHERE module = @module`).run(params);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});
