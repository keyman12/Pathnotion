// Jeff's tool belt. Each tool is a small function Anthropic can call during a conversation.
// We register them here; the chat loop in jeff.ts handles the dispatch.
//
// Keep these tools focused and read-mostly. Anything that changes workspace state (creating tasks,
// patching events) returns a tidy payload so the UI can still show the change in a surface-specific way.

import type Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { listMemories, type JeffMemory } from './jeff.js';
import { decryptToken } from './token-vault.js';
import { type GoogleTokens } from './google-calendar.js';

// ─── Tool registry ──────────────────────────────────────────────────────────

interface ToolDef {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, any>; required?: string[] };
  run: (input: any) => Promise<any>;
}

const TOOLS: Record<string, ToolDef> = {};
function register(def: ToolDef): void { TOOLS[def.name] = def; }

export function allToolDefinitions(): Anthropic.Tool[] {
  return Object.values(TOOLS).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));
}

export async function runTool(name: string, input: any): Promise<{ content: string; isError?: boolean }> {
  const tool = TOOLS[name];
  if (!tool) return { content: `No tool named "${name}" is registered.`, isError: true };
  try {
    const result = await tool.run(input ?? {});
    return { content: typeof result === 'string' ? result : JSON.stringify(result) };
  } catch (err) {
    return { content: `Tool "${name}" failed: ${(err as Error).message}`, isError: true };
  }
}

// Helper — clamp a limit argument without letting the model ask for 5000 rows.
function clampLimit(n: unknown, fallback = 25, max = 100): number {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return fallback;
  return Math.min(max, Math.floor(x));
}

// ─── Memory ─────────────────────────────────────────────────────────────────

register({
  name: 'search_memory',
  description: "Search Jeff's long-term memory by keyword. Memory contains short summaries of articles, Drive files, and past weekly summaries. Use this first when the founders ask about workspace content.",
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Words to match against memory titles and summaries.' },
      kind:  { type: 'string', enum: ['article', 'drive-file', 'weekly-summary', 'note'], description: 'Optional — narrow to one memory kind.' },
      limit: { type: 'number', description: 'Default 10, max 50.' },
    },
    required: ['query'],
  },
  run: async ({ query, kind, limit }) => {
    const rows = listMemories(clampLimit(limit, 10, 50), kind) as JeffMemory[];
    const q = String(query ?? '').toLowerCase();
    const hits = rows.filter((m) => m.title.toLowerCase().includes(q) || m.summary.toLowerCase().includes(q));
    return hits.map((m) => ({ id: m.id, title: m.title, kind: m.kind, scope: m.scope, summary: m.summary }));
  },
});

// ─── Workspace read tools ───────────────────────────────────────────────────

register({
  name: 'list_tasks',
  description: 'List tasks. Defaults to open (not done) tasks. Handy when asked "what\'s overdue" or "what does Dave have on".',
  input_schema: {
    type: 'object',
    properties: {
      owner:  { type: 'string', enum: ['D', 'R', 'both'], description: 'Filter by owner (D = Dave, R = Raj, both).' },
      status: { type: 'string', enum: ['open', 'done', 'all'], description: 'Default open.' },
      limit:  { type: 'number', description: 'Default 25, max 100.' },
    },
  },
  run: async ({ owner, status, limit }) => {
    const clauses: string[] = [];
    const params: any[] = [];
    if (owner && owner !== 'both') { clauses.push('owner = ?'); params.push(owner); }
    if (!status || status === 'open') clauses.push("(status IS NULL OR status != 'done')");
    else if (status === 'done')        clauses.push("status = 'done'");
    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
    const rows = db.prepare(`SELECT id, title, owner, due, status, priority FROM tasks ${where} ORDER BY due LIMIT ?`).all(...params, clampLimit(limit, 25)) as any[];
    return rows;
  },
});

register({
  name: 'list_backlog',
  description: 'List backlog items, optionally filtered by product or stage. Stages are "now", "next", "later".',
  input_schema: {
    type: 'object',
    properties: {
      product: { type: 'string', description: 'Product id, e.g. "dashboard" or "boarding".' },
      stage:   { type: 'string', enum: ['now', 'next', 'later'] },
      limit:   { type: 'number' },
    },
  },
  run: async ({ product, stage, limit }) => {
    const clauses: string[] = [];
    const params: any[] = [];
    if (product) { clauses.push('product = ?'); params.push(product); }
    if (stage)   { clauses.push('stage = ?');   params.push(stage); }
    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
    const rows = db.prepare(`SELECT id, title, product, stage, owner, flag, effort_days FROM backlog_items ${where} ORDER BY sort_order LIMIT ?`).all(...params, clampLimit(limit, 30)) as any[];
    return rows;
  },
});

register({
  name: 'list_events',
  description: 'List calendar events in a date range (ISO dates). Use to answer "what meetings do I have this week" or to plan around gaps.',
  input_schema: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'Lower bound ISO datetime. Defaults to now.' },
      to:   { type: 'string', description: 'Upper bound ISO datetime. Defaults to 14 days from now.' },
      owner: { type: 'string', enum: ['D', 'R', 'SHARED', 'all'] },
      limit: { type: 'number' },
    },
  },
  run: async ({ from, to, owner, limit }) => {
    const now = new Date();
    const fromIso = from ? new Date(from).toISOString() : now.toISOString();
    const toIso = to ? new Date(to).toISOString() : new Date(now.getTime() + 14 * 86400_000).toISOString();
    const clauses = ['start_iso IS NOT NULL', 'start_iso >= ?', 'start_iso <= ?'];
    const params: any[] = [fromIso, toIso];
    if (owner && owner !== 'all') { clauses.push('who = ?'); params.push(owner); }
    const rows = db.prepare(`SELECT id, title, start_iso, end_iso, who, location FROM calendar_events WHERE ${clauses.join(' AND ')} ORDER BY start_iso LIMIT ?`).all(...params, clampLimit(limit, 50, 200)) as any[];
    return rows;
  },
});

register({
  name: 'list_articles',
  description: "List PathNotion articles (docs written inside the workspace). Filter by scope ('product', 'finance', 'sales', 'legal').",
  input_schema: {
    type: 'object',
    properties: {
      scope: { type: 'string', enum: ['product', 'finance', 'sales', 'legal'] },
      query: { type: 'string', description: 'Optional title filter.' },
      limit: { type: 'number' },
    },
  },
  run: async ({ scope, query, limit }) => {
    const clauses: string[] = [];
    const params: any[] = [];
    if (scope) { clauses.push('root = ?'); params.push(scope); }
    if (query) { clauses.push('title LIKE ?'); params.push(`%${query}%`); }
    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
    const rows = db.prepare(`SELECT id, title, root, product_id AS product, group_name AS "group", updated FROM docs ${where} ORDER BY updated_at DESC LIMIT ?`).all(...params, clampLimit(limit, 30)) as any[];
    return rows;
  },
});

register({
  name: 'read_article',
  description: 'Read the full text of one article by id.',
  input_schema: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
  },
  run: async ({ id }) => {
    const doc = db.prepare('SELECT id, title, root, updated FROM docs WHERE id = ?').get(id) as any;
    if (!doc) return { error: 'Not found' };
    const blocks = db.prepare('SELECT data FROM doc_blocks WHERE doc_id = ? ORDER BY sort_order').all(id) as Array<{ data: string }>;
    const text = blocks.map((b) => { try { return (JSON.parse(b.data) as any).text ?? ''; } catch { return ''; } }).filter(Boolean).join('\n');
    return { ...doc, text: text.slice(0, 6000) };
  },
});

// ─── Workspace write tools (careful — these mutate state) ──────────────────

register({
  name: 'create_task',
  description: 'Create a new task. Use when the founders ask Jeff to capture something as a todo.',
  input_schema: {
    type: 'object',
    properties: {
      title:    { type: 'string' },
      owner:    { type: 'string', enum: ['D', 'R'] },
      due:      { type: 'string', description: 'Free text due label, e.g. "today", "tomorrow", or a date string.' },
      priority: { type: 'string', enum: ['low', 'med', 'high'] },
    },
    required: ['title', 'owner', 'due'],
  },
  run: async ({ title, owner, due, priority }) => {
    const info = db.prepare(`
      INSERT INTO tasks (title, owner, due, status, priority)
      VALUES (?, ?, ?, 'open', ?)
    `).run(title, owner, due, priority ?? null);
    return { id: info.lastInsertRowid, title, owner, due, priority: priority ?? null };
  },
});

register({
  name: 'patch_event',
  description: 'Move or edit a calendar event. Returns the updated row. Use for scheduling mediation — e.g. "move Ops review to 15:30".',
  input_schema: {
    type: 'object',
    properties: {
      id:      { type: 'number', description: 'Event id.' },
      startIso:{ type: 'string' },
      endIso:  { type: 'string' },
      title:   { type: 'string' },
      location:{ type: 'string' },
    },
    required: ['id'],
  },
  run: async ({ id, startIso, endIso, title, location }) => {
    const sets: string[] = [];
    const params: any[] = [];
    if (startIso) { sets.push('start_iso = ?'); params.push(startIso); }
    if (endIso)   { sets.push('end_iso = ?');   params.push(endIso); }
    if (title)    { sets.push('title = ?');      params.push(title); }
    if (location) { sets.push('location = ?');   params.push(location); }
    if (!sets.length) return { error: 'Nothing to patch' };
    params.push(id);
    const res = db.prepare(`UPDATE calendar_events SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    if (!res.changes) return { error: 'Not found' };
    const updated = db.prepare('SELECT id, title, start_iso, end_iso, who FROM calendar_events WHERE id = ?').get(id);
    return updated;
  },
});

// ─── Scheduling mediation ───────────────────────────────────────────────────

register({
  name: 'find_calendar_conflicts',
  description: 'Scan a date range for overlapping calendar events (any two events that intersect in time). Returns pairs Jeff can propose moves for.',
  input_schema: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'ISO lower bound. Defaults to now.' },
      to:   { type: 'string', description: 'ISO upper bound. Defaults to 14 days from now.' },
    },
  },
  run: async ({ from, to }) => {
    const now = new Date();
    const fromIso = from ? new Date(from).toISOString() : now.toISOString();
    const toIso = to ? new Date(to).toISOString() : new Date(now.getTime() + 14 * 86400_000).toISOString();
    const events = db.prepare(`
      SELECT id, title, start_iso, end_iso, who, location
      FROM calendar_events
      WHERE start_iso IS NOT NULL AND start_iso >= ? AND start_iso <= ?
      ORDER BY start_iso
    `).all(fromIso, toIso) as any[];
    // Simple pairwise overlap check — for a couple of dozen events per fortnight this is fine.
    const conflicts: Array<{ a: any; b: any; overlapMinutes: number }> = [];
    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const a = events[i]; const b = events[j];
        const aStart = new Date(a.start_iso).getTime();
        const aEnd   = new Date(a.end_iso ?? a.start_iso).getTime();
        const bStart = new Date(b.start_iso).getTime();
        const bEnd   = new Date(b.end_iso ?? b.start_iso).getTime();
        if (aStart < bEnd && bStart < aEnd) {
          const overlap = Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
          conflicts.push({ a, b, overlapMinutes: Math.round(overlap / 60_000) });
        }
      }
    }
    return conflicts;
  },
});

// ─── Competitor / research helpers ──────────────────────────────────────────

register({
  name: 'list_competitors',
  description: "List the competitors Jeff watches, with their homepage, press page, focus tags and region. Use when the founders ask 'who are we tracking' or before running competitor research.",
  input_schema: {
    type: 'object',
    properties: {
      region: { type: 'string', description: "Optional region filter: 'uk', 'de', 'fr', 'es-pt', 'it', 'benelux', 'global'." },
    },
  },
  run: async ({ region }) => {
    const where = region ? 'WHERE enabled = 1 AND region = ?' : 'WHERE enabled = 1';
    const params: any[] = region ? [region] : [];
    const rows = db.prepare(`SELECT id, name, homepage, press_page_url AS pressPageUrl, notes, focus_areas AS focusAreas, region FROM jeff_competitors ${where} ORDER BY sort_order, name`).all(...params) as any[];
    return rows.map((r) => ({ ...r, focusAreas: r.focusAreas ? JSON.parse(r.focusAreas) : [] }));
  },
});

register({
  name: 'add_competitor',
  description: "Add a competitor to the tracked list. Use this when the founders ask Jeff to propose or suggest new competitors — after you've identified one via web_search, call this to save it. Returns the new id.",
  input_schema: {
    type: 'object',
    properties: {
      id:            { type: 'string', description: 'Optional slug. Auto-generated if omitted.' },
      name:          { type: 'string', description: 'Short brand name, e.g. "Mollie".' },
      homepage:      { type: 'string', description: 'Main website URL.' },
      pressPageUrl:  { type: 'string', description: 'Press / newsroom URL. Used by the research-refresh job.' },
      focusAreas:    { type: 'array', items: { type: 'string' }, description: 'Short tags: kyc, boarding, baas, marketplace-payments, open-banking, …' },
      region:        { type: 'string', enum: ['uk', 'de', 'fr', 'es-pt', 'it', 'benelux', 'global'] },
      notes:         { type: 'string' },
    },
    required: ['name'],
  },
  run: async ({ id, name, homepage, pressPageUrl, focusAreas, region, notes }) => {
    const slug = (id ?? String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')).slice(0, 40) || `c_${randomUUID().slice(0, 8)}`;
    // Duplicate guard — by slug or by exact name match.
    const dup = db.prepare('SELECT id FROM jeff_competitors WHERE id = ? OR LOWER(name) = LOWER(?)').get(slug, name) as { id: string } | undefined;
    if (dup) return { error: `Already tracking "${name}" (id=${dup.id})` };
    db.prepare(`
      INSERT INTO jeff_competitors (id, name, homepage, press_page_url, notes, focus_areas, region, enabled, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, (SELECT COALESCE(MAX(sort_order), 0) + 10 FROM jeff_competitors))
    `).run(slug, name, homepage ?? null, pressPageUrl ?? null, notes ?? null, JSON.stringify(focusAreas ?? []), region ?? null);
    return { id: slug, name };
  },
});

register({
  name: 'list_tracked_features',
  description: 'List product features Jeff has noted for the tracked competitors. Filter by competitor id if you know it.',
  input_schema: {
    type: 'object',
    properties: {
      competitorId: { type: 'string' },
      limit: { type: 'number' },
    },
  },
  run: async ({ competitorId, limit }) => {
    const where = competitorId ? 'WHERE competitor_id = ?' : '';
    const params: any[] = competitorId ? [competitorId] : [];
    const rows = db.prepare(`SELECT id, competitor_id AS competitorId, name, summary, source_url AS sourceUrl, discovered_at AS discoveredAt FROM jeff_tracked_features ${where} ORDER BY discovered_at DESC LIMIT ?`).all(...params, clampLimit(limit, 40)) as any[];
    return rows;
  },
});

// ─── Drive access (for uploads / reads by id) ──────────────────────────────

function firstGoogleTokens(): GoogleTokens | null {
  const row = db.prepare(
    "SELECT access_token, refresh_token, token_expiry, scope FROM calendar_sources WHERE provider = 'google' ORDER BY connected_at DESC LIMIT 1",
  ).get() as { access_token: string | null; refresh_token: string | null; token_expiry: number | null; scope: string | null } | undefined;
  if (!row) return null;
  return {
    access_token: decryptToken(row.access_token),
    refresh_token: decryptToken(row.refresh_token),
    expiry_date: row.token_expiry ?? null,
    scope: row.scope,
  };
}

register({
  name: 'list_pinned_folders',
  description: 'List the Drive folders the founders have pinned for Jeff to scan. Use when asked "what folders are you watching" or before suggesting a scan.',
  input_schema: { type: 'object', properties: {} },
  run: async () => {
    const rows = db.prepare('SELECT drive_folder_id AS id, folder_name AS name, pinned_at AS pinnedAt FROM jeff_pinned_folders ORDER BY folder_name').all();
    return rows;
  },
});

register({
  name: 'pin_folder',
  description: 'Pin a Drive folder so the drive-file scan includes it. Use when the founders ask you to "track", "watch" or "start scanning" a folder they\'ve just pointed at.',
  input_schema: {
    type: 'object',
    properties: {
      driveFolderId: { type: 'string' },
      folderName:    { type: 'string' },
    },
    required: ['driveFolderId', 'folderName'],
  },
  run: async ({ driveFolderId, folderName }) => {
    db.prepare(`
      INSERT INTO jeff_pinned_folders (drive_folder_id, folder_name)
      VALUES (?, ?)
      ON CONFLICT(drive_folder_id) DO UPDATE SET folder_name = excluded.folder_name
    `).run(driveFolderId, folderName);
    return { driveFolderId, folderName, pinned: true };
  },
});

register({
  name: 'unpin_folder',
  description: 'Unpin a Drive folder so the scan job stops walking it.',
  input_schema: {
    type: 'object',
    properties: { driveFolderId: { type: 'string' } },
    required: ['driveFolderId'],
  },
  run: async ({ driveFolderId }) => {
    const r = db.prepare('DELETE FROM jeff_pinned_folders WHERE drive_folder_id = ?').run(driveFolderId);
    return { driveFolderId, unpinned: r.changes > 0 };
  },
});

register({
  name: 'read_drive_file',
  description: "Read a Drive file's content when the memory summary isn't enough. Works for Google Docs / Sheets / Slides (exported as text), PDFs (first few pages as text), and plain text. Images aren't readable — use the file's preview link instead. Returns a text excerpt, truncated.",
  input_schema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Drive file id, as surfaced by search_memory or list commands.' },
      maxChars: { type: 'number', description: 'Excerpt length, default 4000, max 12000.' },
    },
    required: ['id'],
  },
  run: async ({ id, maxChars }) => {
    const tokens = firstGoogleTokens();
    if (!tokens) return { error: 'Google not connected.' };
    const { getEntry, fetchFileContent } = await import('./google-drive.js');
    const entry = await getEntry(tokens, id);
    if (!entry) return { error: 'Not found' };
    const cap = Math.min(12_000, Math.max(500, Number(maxChars) || 4000));
    const content = await fetchFileContent(tokens, entry, { maxTextChars: cap });
    if (!content) return { name: entry.name, mimeType: entry.mimeType, error: 'This file type has no readable text (try the preview link in Drive instead).' };
    if (content.kind === 'text') return { name: entry.name, mimeType: entry.mimeType, text: content.text };
    return { name: entry.name, mimeType: entry.mimeType, error: 'Binary file — send it to Jeff directly if you need vision / PDF reasoning.' };
  },
});

register({
  name: 'save_note_to_drive',
  description: "Save a short markdown note to the Jeff folder in Drive. Use when asked to 'make a note' or 'file that'.",
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      body:  { type: 'string', description: 'Markdown content.' },
    },
    required: ['title', 'body'],
  },
  run: async ({ title, body }) => {
    const cfg = db.prepare('SELECT drive_id, jeff_folder_id FROM workspace_config WHERE id = 1').get() as
      | { drive_id: string | null; jeff_folder_id: string | null }
      | undefined;
    if (!cfg?.drive_id) return { error: 'No shared drive configured.' };
    const tokens = firstGoogleTokens();
    if (!tokens) return { error: 'Google not connected.' };
    const { ensureJeffFolder, uploadFile } = await import('./google-drive.js');
    let jeffId = cfg.jeff_folder_id;
    if (!jeffId) {
      const f = await ensureJeffFolder(tokens, cfg.drive_id);
      jeffId = f.id;
      db.prepare("UPDATE workspace_config SET jeff_folder_id = ? WHERE id = 1").run(jeffId);
    }
    const safeName = title.replace(/[^\w \-.]/g, '_');
    const entry = await uploadFile(tokens, {
      parentId: jeffId!,
      name: `${safeName}.md`,
      mimeType: 'text/markdown',
      data: Buffer.from(String(body ?? ''), 'utf8'),
    });
    return { id: entry.id, name: entry.name, webViewLink: entry.webViewLink };
  },
});

register({
  name: 'make_presentation',
  description: "Produce a branded PowerPoint deck in Path's house style and save it to the Jeff folder in Drive. Use when asked to make a deck, slides, presentation, briefing, pitch or similar. A title slide is added automatically — provide ONLY the content slides. Each slide needs a heading; bullets are optional but keep them tight (sentence fragments, ≤8 per slide). Returns the Drive file id and a link the founders can open.",
  input_schema: {
    type: 'object',
    properties: {
      title:   { type: 'string', description: 'Deck title. Appears on the title slide.' },
      subject: { type: 'string', description: 'Optional sub-title under the deck title (e.g. "Competitor brief").' },
      slides: {
        type: 'array',
        description: 'Content slides in order. The renderer adds the title slide itself.',
        items: {
          type: 'object',
          properties: {
            heading:  { type: 'string', description: 'Slide heading. One short line.' },
            subtitle: { type: 'string', description: 'Optional second line under the heading.' },
            bullets:  { type: 'array', items: { type: 'string' }, description: 'Bullet points for this slide. Sentence fragments, not paragraphs.' },
          },
          required: ['heading'],
        },
      },
    },
    required: ['title', 'slides'],
  },
  run: async ({ title, subject, slides }) => {
    const cfg = db.prepare('SELECT drive_id, jeff_folder_id FROM workspace_config WHERE id = 1').get() as
      | { drive_id: string | null; jeff_folder_id: string | null } | undefined;
    if (!cfg?.drive_id) return { error: 'No shared drive configured. Pick one in Settings → Google first.' };
    const tokens = firstGoogleTokens();
    if (!tokens) return { error: 'Google not connected.' };
    const safeSlides = Array.isArray(slides) ? slides.filter((s: any) => s && typeof s.heading === 'string') : [];
    if (!safeSlides.length) return { error: 'No slides provided.' };
    const { renderPresentation } = await import('./presentation.js');
    const { ensureJeffFolder, uploadFile } = await import('./google-drive.js');
    let jeffId = cfg.jeff_folder_id;
    if (!jeffId) {
      const f = await ensureJeffFolder(tokens, cfg.drive_id);
      jeffId = f.id;
      db.prepare('UPDATE workspace_config SET jeff_folder_id = ? WHERE id = 1').run(jeffId);
    }
    const { buffer, filename } = await renderPresentation({
      title:   String(title || 'Untitled deck'),
      subject: subject ? String(subject) : undefined,
      slides:  safeSlides.map((s: any) => ({
        heading:  String(s.heading),
        subtitle: s.subtitle ? String(s.subtitle) : undefined,
        bullets:  Array.isArray(s.bullets) ? s.bullets.map((b: any) => String(b)) : [],
      })),
    });
    const entry = await uploadFile(tokens, {
      parentId: jeffId!,
      name: filename,
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      data: buffer,
    });
    return {
      id: entry.id,
      name: entry.name,
      webViewLink: entry.webViewLink,
      slideCount: safeSlides.length + 1,
    };
  },
});

register({
  name: 'make_product_pdf',
  description: "Produce a branded Path PDF (A4 product-sheet style) and save it to the Jeff folder in Drive. Use when asked for a product sheet, feature brief, research PDF, one-pager, or any polished prose document. Header bar and footer are applied automatically — provide only the title/subtitle and a list of content blocks. Blocks are rendered in order, flowing onto new pages automatically. Keep bodies tight — Path product sheets favour short paragraphs + feature lists over walls of text.",
  input_schema: {
    type: 'object',
    properties: {
      title:    { type: 'string', description: 'Document title. Appears in the header of every page.' },
      subtitle: { type: 'string', description: 'Sub-title under the title in the header.' },
      blocks: {
        type: 'array',
        description: 'Content blocks rendered in order. Mix freely.',
        items: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              enum: ['paragraph', 'h2', 'bullet', 'bullets', 'feature', 'icon-bullet', 'table', 'hero-image', 'spacer', 'page-break'],
              description: 'Block type. "h2" is a green section heading. "feature" is a bold title + grey description pair. "icon-bullet" is a big icon + green title + body (use for top-of-page overviews). "table" renders a zebra-striped table with a coloured header row.',
            },
            text:        { type: 'string', description: 'Text for paragraph, h2, or single bullet.' },
            items:       { type: 'array', items: { type: 'string' }, description: 'Items for "bullets" block.' },
            title:       { type: 'string', description: 'Title for feature or icon-bullet blocks.' },
            description: { type: 'string', description: 'Description for feature blocks.' },
            icon:        { type: 'string', description: 'One-character icon glyph for icon-bullet (e.g. £, §, •). Kept small for clarity.' },
            body:        { type: 'string', description: 'Body text for icon-bullet.' },
            headers:     { type: 'array', items: { type: 'string' }, description: 'Table column headers.' },
            rows:        { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Table body rows as arrays of cell strings.' },
            accent:      { type: 'string', enum: ['primary', 'secondary'], description: 'Colour accent for h2 or table header. Primary = green, secondary = coral.' },
            driveFileId: { type: 'string', description: 'Drive file id for hero-image blocks. Must be an image uploaded to the shared drive.' },
            caption:     { type: 'string', description: 'Caption under a hero image.' },
            size:        { type: 'number', description: 'Vertical size in mm for a "spacer" block. Defaults to 3mm.' },
          },
          required: ['kind'],
        },
      },
    },
    required: ['title', 'blocks'],
  },
  run: async ({ title, subtitle, blocks }) => {
    const cfg = db.prepare('SELECT drive_id, jeff_folder_id FROM workspace_config WHERE id = 1').get() as
      | { drive_id: string | null; jeff_folder_id: string | null } | undefined;
    if (!cfg?.drive_id) return { error: 'No shared drive configured. Pick one in Settings → Google first.' };
    const tokens = firstGoogleTokens();
    if (!tokens) return { error: 'Google not connected.' };
    const safeBlocks = Array.isArray(blocks) ? blocks.filter((b: any) => b && typeof b.kind === 'string') : [];
    if (!safeBlocks.length) return { error: 'No blocks provided.' };
    const { renderProductPdf } = await import('./pdf-render.js');
    const { ensureJeffFolder, uploadFile } = await import('./google-drive.js');
    let jeffId = cfg.jeff_folder_id;
    if (!jeffId) {
      const f = await ensureJeffFolder(tokens, cfg.drive_id);
      jeffId = f.id;
      db.prepare('UPDATE workspace_config SET jeff_folder_id = ? WHERE id = 1').run(jeffId);
    }
    const { buffer, filename } = await renderProductPdf({
      title:    String(title || 'Untitled'),
      subtitle: subtitle ? String(subtitle) : undefined,
      blocks:   safeBlocks as any,
    });
    const entry = await uploadFile(tokens, {
      parentId: jeffId!,
      name: filename,
      mimeType: 'application/pdf',
      data: buffer,
    });
    return { id: entry.id, name: entry.name, webViewLink: entry.webViewLink, blockCount: safeBlocks.length };
  },
});

register({
  name: 'make_spreadsheet',
  description: "Produce a branded Excel workbook (.xlsx) in Path styling and save it to the Jeff folder in Drive. Use when asked for a comparison, tracker, pricing sheet, data pull, or any tabular output. Each sheet has a short name, a header row and body rows. First column is bold and frozen — put row labels there (e.g. feature names, metrics). First row is frozen — use it for column labels (e.g. competitors, options, periods). Returns the Drive file id and a link.",
  input_schema: {
    type: 'object',
    properties: {
      title:    { type: 'string', description: 'Workbook title. Appears as a branded band at the top of each sheet.' },
      subtitle: { type: 'string', description: 'Optional subtitle under the title.' },
      sheets: {
        type: 'array',
        description: 'One or more sheets.',
        items: {
          type: 'object',
          properties: {
            name:    { type: 'string', description: 'Sheet tab name. Kept under 31 characters.' },
            headers: { type: 'array', items: { type: 'string' }, description: 'Column headers in order. First column is the row-label column.' },
            rows:    { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Body rows as arrays of cell strings, one per header column.' },
          },
          required: ['name', 'headers', 'rows'],
        },
      },
    },
    required: ['title', 'sheets'],
  },
  run: async ({ title, subtitle, sheets }) => {
    const cfg = db.prepare('SELECT drive_id, jeff_folder_id FROM workspace_config WHERE id = 1').get() as
      | { drive_id: string | null; jeff_folder_id: string | null } | undefined;
    if (!cfg?.drive_id) return { error: 'No shared drive configured. Pick one in Settings → Google first.' };
    const tokens = firstGoogleTokens();
    if (!tokens) return { error: 'Google not connected.' };
    const safeSheets = Array.isArray(sheets) ? sheets.filter((s: any) => s && typeof s.name === 'string') : [];
    if (!safeSheets.length) return { error: 'No sheets provided.' };
    const { renderSpreadsheet } = await import('./excel-render.js');
    const { ensureJeffFolder, uploadFile } = await import('./google-drive.js');
    let jeffId = cfg.jeff_folder_id;
    if (!jeffId) {
      const f = await ensureJeffFolder(tokens, cfg.drive_id);
      jeffId = f.id;
      db.prepare('UPDATE workspace_config SET jeff_folder_id = ? WHERE id = 1').run(jeffId);
    }
    const { buffer, filename } = await renderSpreadsheet({
      title:    String(title || 'Untitled'),
      subtitle: subtitle ? String(subtitle) : undefined,
      sheets:   safeSheets.map((s: any) => ({
        name:    String(s.name),
        headers: Array.isArray(s.headers) ? s.headers.map((h: any) => String(h ?? '')) : [],
        rows:    Array.isArray(s.rows) ? s.rows.map((r: any) => Array.isArray(r) ? r.map((c: any) => String(c ?? '')) : []) : [],
      })),
    });
    const entry = await uploadFile(tokens, {
      parentId: jeffId!,
      name: filename,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      data: buffer,
    });
    return {
      id: entry.id,
      name: entry.name,
      webViewLink: entry.webViewLink,
      sheetCount: safeSheets.length,
    };
  },
});

register({
  name: 'save_tracked_feature',
  description: 'Record a newly-observed product feature from a competitor. Used by the competitor-features job but also callable from chat if the founders spot something live.',
  input_schema: {
    type: 'object',
    properties: {
      competitorId: { type: 'string' },
      name:         { type: 'string' },
      summary:      { type: 'string' },
      sourceUrl:    { type: 'string' },
    },
    required: ['competitorId', 'name', 'summary'],
  },
  run: async ({ competitorId, name, summary, sourceUrl }) => {
    const exists = db.prepare('SELECT id FROM jeff_competitors WHERE id = ?').get(competitorId);
    if (!exists) return { error: `Competitor ${competitorId} not found` };
    const id = `tf_${randomUUID().slice(0, 10)}`;
    db.prepare(`
      INSERT INTO jeff_tracked_features (id, competitor_id, name, summary, source_url)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, competitorId, name, summary, sourceUrl ?? null);
    return { id, competitorId, name };
  },
});

// ─── Web — Anthropic's server-side tools (pass-through) ────────────────────

/** Anthropic's web_search + web_fetch run on their side — we just include them in the `tools` array.
 *  These functions return the tool definitions; they have no local runner. The chat loop skips any
 *  tool_use block whose name isn't in our local registry (Anthropic handles those itself). */
export const SERVER_SIDE_TOOLS: Anthropic.Tool[] = [
  // Anthropic's hosted web search — up to 5 queries per conversation turn.
  { type: 'web_search_20250305' as any, name: 'web_search', max_uses: 5 } as any,
  // Anthropic's hosted URL fetcher — lets Jeff read specific pages (newsroom articles, blog posts, etc.)
  // rather than only Google-style searching. Paired with web_search it's a full reading loop.
  { type: 'web_fetch_20250910' as any, name: 'web_fetch', max_uses: 5 } as any,
];

/** Compose the full tool set: local + server-side. Call this from jeff.ts. */
export function allTools(): Anthropic.Tool[] {
  return [...allToolDefinitions(), ...SERVER_SIDE_TOOLS];
}

/** Style sheet — used in the system prompt so Jeff speaks in our voice. */
export function loadStyleSheet(): any {
  const row = db.prepare('SELECT data FROM jeff_style_sheet WHERE id = 1').get() as { data: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.data); } catch { return null; }
}

/** Generate a small `(random id)` for tool-use bookkeeping when needed. */
export function toolUseId(): string { return `tool_${randomUUID().slice(0, 8)}`; }
