// Jeff — the PathNotion founder-facing assistant.
// Wraps the Anthropic SDK, manages Jeff's long-term memory, and hosts the two built-in jobs
// (memory scan + weekly summary). Keeps the surface small so the rest of the API can just call
// ask(), scanMemories() or runWeeklySummary().
//
// Memory model: flat rows in the `jeff_memories` table. Each row is a bite-sized summary (< 600 chars)
// of something Jeff has observed — an article, a Drive file, a weekly-summary output. We inject the
// most recent ~20 into the system prompt so Jeff has context without blowing the token window.
//
// Model: the latest Sonnet. Drops the old `claude-3-5-sonnet-20241022` reference entirely.

import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { db } from '../db/client.js';
import { decryptToken } from './token-vault.js';
import { type GoogleTokens } from './google-calendar.js';
import { ensureJeffFolder, fetchFileContent, uploadFile, walkFiles, type DriveEntry } from './google-drive.js';

// ─── Config ─────────────────────────────────────────────────────────────────

/** Latest Sonnet. Upgrade this single constant when Anthropic publishes a newer model id. */
export const JEFF_MODEL = process.env.JEFF_MODEL ?? 'claude-sonnet-4-5';
const MAX_OUTPUT_TOKENS = 1024;
const MAX_MEMORIES_IN_PROMPT = 20;

function apiKey(): string | null {
  return process.env.ANTHROPIC_API_KEY ?? null;
}

function client(): Anthropic {
  const key = apiKey();
  if (!key) throw Object.assign(new Error('ANTHROPIC_API_KEY is not set — Jeff has no keys to call Anthropic with.'), { status: 503 });
  return new Anthropic({ apiKey: key });
}

/** Cheap status check so the UI can show a "Jeff isn't configured" message instead of erroring on send. */
export function jeffStatus(): { ready: boolean; model: string; reason?: string } {
  if (!apiKey()) return { ready: false, model: JEFF_MODEL, reason: 'ANTHROPIC_API_KEY not set' };
  return { ready: true, model: JEFF_MODEL };
}

// ─── Job prompt registry ────────────────────────────────────────────────────
// Default system prompts for each job kind. Editable per-job via `agent_jobs.prompt` — when a row
// has a prompt override set, the runner uses that instead. Exposed so the frontend can show the
// default as placeholder text and "Reset to default" behaviour in the edit dialog.
export const JOB_PROMPT_DEFAULTS: Record<string, string> = {
  'scan-memories': 'You summarise internal workspace documents for a founder-facing assistant. Give 1–3 sentences, max 60 words. Focus on what the doc IS (type + topic) and its most actionable takeaway. No preamble. No bullet points.',
  'scan-drive-files': 'You summarise files from a workspace drive for a founder-facing assistant. 1–3 sentences, max 60 words. Say what the file IS (format + topic) and the key takeaway or the most actionable point. No preamble, no bullets.',
  'weekly-summary': 'You are Jeff. Write this week\'s brief for Dave and Raj. Keep it tight and actionable: three short sections — "Focus this week", "Watch list" (things at risk or slipping), and "Decisions needed". Markdown only. No small talk.',
  'daily-news': "Produce today's news digest for the Path founders. Use web_search to find news from the last 24 hours relevant to the UK fintech / platform / PSP space. Use web_fetch to read specific articles when you need detail. Return 5–8 bullets: short title · one-line takeaway · source domain. Order by relevance to Path. No preamble.\n\n(Use {competitors} if you'd like the tracked competitor list substituted in, or {today} for today's date. Otherwise those placeholders are ignored.)",
  'competitor-features': "Check each competitor below for new or updated product features. For each one: fetch their homepage (use web_search if web_fetch is unavailable); identify up to 3 distinct product features or capabilities mentioned; for each, call save_tracked_feature with the competitor id, a short feature name (6 words max), a 1–2 sentence summary, and the source URL. Only call save_tracked_feature for features that look new / notable — don't flood the DB with generic marketing copy. When you finish, reply with one short line summarising what you saved.",
  'research-refresh': "Refresh research on the competitors below. For each one: use web_search to find what they've announced in the last 90 days — product launches, regulatory filings, funding, acquisitions, executive moves. Pick the 1–3 most material items. Call save_tracked_feature with the competitor id and a crisp 1–2 sentence summary — flag which ones are threats to Path and which are opportunities. When you've finished the whole list, reply with a short summary paragraph of what you found.",
};

/** Resolve the prompt for a given job — custom override if set on the row, otherwise the default. */
export function getJobPrompt(jobId: string | null, kind: string): string {
  if (jobId) {
    const row = db.prepare('SELECT prompt FROM agent_jobs WHERE id = ?').get(jobId) as { prompt: string | null } | undefined;
    if (row?.prompt && row.prompt.trim()) return row.prompt;
  }
  return JOB_PROMPT_DEFAULTS[kind] ?? '';
}

// ─── Memory store ───────────────────────────────────────────────────────────

export type MemoryKind = 'article' | 'drive-file' | 'weekly-summary' | 'note';

export interface JeffMemory {
  id: string;
  kind: MemoryKind;
  sourceId: string | null;
  title: string;
  summary: string;
  tags: string[];
  scope: string | null;
  sourceUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToMemory(r: any): JeffMemory {
  return {
    id: r.id,
    kind: r.kind,
    sourceId: r.source_id ?? null,
    title: r.title,
    summary: r.summary,
    tags: r.tags ? JSON.parse(r.tags) : [],
    scope: r.scope ?? null,
    sourceUpdatedAt: r.source_updated_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listMemories(limit = 100, kind?: MemoryKind): JeffMemory[] {
  const rows = kind
    ? db.prepare('SELECT * FROM jeff_memories WHERE kind = ? ORDER BY updated_at DESC LIMIT ?').all(kind, limit)
    : db.prepare('SELECT * FROM jeff_memories ORDER BY updated_at DESC LIMIT ?').all(limit);
  return (rows as any[]).map(rowToMemory);
}

export function countMemories(): { total: number; byKind: Record<string, number> } {
  const total = (db.prepare('SELECT COUNT(*) AS n FROM jeff_memories').get() as { n: number }).n;
  const byKind = (db.prepare('SELECT kind, COUNT(*) AS n FROM jeff_memories GROUP BY kind').all() as Array<{ kind: string; n: number }>)
    .reduce<Record<string, number>>((acc, r) => { acc[r.kind] = r.n; return acc; }, {});
  return { total, byKind };
}

/** Upsert a memory. We key by (kind, source_id) so re-scanning an article overwrites its summary
 *  rather than piling up duplicates. For rows without a source (notes, weekly summaries) we
 *  always insert a new one. */
export function writeMemory(m: {
  kind: MemoryKind;
  sourceId?: string | null;
  title: string;
  summary: string;
  tags?: string[];
  scope?: string | null;
  sourceUpdatedAt?: string | null;
}): JeffMemory {
  const now = new Date().toISOString();
  if (m.sourceId) {
    const existing = db.prepare('SELECT id FROM jeff_memories WHERE kind = ? AND source_id = ?').get(m.kind, m.sourceId) as { id: string } | undefined;
    if (existing) {
      db.prepare(`
        UPDATE jeff_memories
        SET title = @title, summary = @summary, tags = @tags, scope = @scope,
            source_updated_at = @sourceUpdatedAt, updated_at = @now
        WHERE id = @id
      `).run({
        id: existing.id,
        title: m.title,
        summary: m.summary,
        tags: JSON.stringify(m.tags ?? []),
        scope: m.scope ?? null,
        sourceUpdatedAt: m.sourceUpdatedAt ?? null,
        now,
      });
      return rowToMemory(db.prepare('SELECT * FROM jeff_memories WHERE id = ?').get(existing.id));
    }
  }
  const id = `mem_${randomUUID().slice(0, 12)}`;
  db.prepare(`
    INSERT INTO jeff_memories (id, kind, source_id, title, summary, tags, scope, source_updated_at, created_at, updated_at)
    VALUES (@id, @kind, @sourceId, @title, @summary, @tags, @scope, @sourceUpdatedAt, @now, @now)
  `).run({
    id,
    kind: m.kind,
    sourceId: m.sourceId ?? null,
    title: m.title,
    summary: m.summary,
    tags: JSON.stringify(m.tags ?? []),
    scope: m.scope ?? null,
    sourceUpdatedAt: m.sourceUpdatedAt ?? null,
    now,
  });
  return rowToMemory(db.prepare('SELECT * FROM jeff_memories WHERE id = ?').get(id));
}

export function clearMemories(kind?: MemoryKind): number {
  const res = kind
    ? db.prepare('DELETE FROM jeff_memories WHERE kind = ?').run(kind)
    : db.prepare('DELETE FROM jeff_memories').run();
  return res.changes;
}

// ─── Chat (ask Jeff) ────────────────────────────────────────────────────────

export interface ChatTurn { role: 'user' | 'assistant'; content: string; }

/** A compact summary of tool calls Jeff made during one answer — surfaced in the chat UI. */
export interface ToolCallLog {
  name: string;
  input: any;
  result: string;
  isError?: boolean;
}

const SYSTEM_PREAMBLE_BASE = `You are Jeff, the PathNotion workspace assistant for the two founders Dave and Raj.

You have tools for reading workspace state (memory, backlog, tasks, calendar, articles), for writing ('create_task', 'patch_event', 'save_note_to_drive'), and for the web (search + fetch). Use them aggressively — prefer retrieving real data over guessing. When a question touches workspace content, call 'search_memory' first; if the answer isn't clear, fall back to the listing tools.

When you make proposals (e.g. "move Ops review to 15:30"), state them clearly, then use the write tool to apply the change only after the founder agrees in the current turn or the previous user message. If you're unsure, describe the proposed change and let them confirm.

When you answer, cite specific items by title when you pulled them from memory or the tools. Plain text, no markdown headers unless producing a document. Keep answers tight.`;

function loadStyleSheetRow(): any | null {
  // Inline the style-sheet read here so we don't create a circular import with jeff-tools.ts.
  const row = db.prepare('SELECT data FROM jeff_style_sheet WHERE id = 1').get() as { data: string } | undefined;
  if (!row) return null;
  try { return JSON.parse(row.data); } catch { return null; }
}

function buildSystemPrompt(): string {
  const memories = listMemories(MAX_MEMORIES_IN_PROMPT);
  const memBlock = memories.length
    ? `Workspace memory (most recent first):\n${memories.map((m, i) => `[${i + 1}] (${m.kind}) "${m.title}" — ${m.summary}`).join('\n')}`
    : 'Workspace memory: (empty — run "Scan articles" to build it)';

  const style = loadStyleSheetRow();
  let styleBlock = '';
  if (style) {
    const voice = style.voice
      ? `Voice: ${style.voice.tone}\nAvoid: ${(style.voice.avoid ?? []).join(', ')}\nPrefer: ${(style.voice.prefer ?? []).join(', ')}`
      : '';
    // Prefer new palette keys, fall back to legacy keys from the first seed.
    const primary = style.brand?.colorPrimary ?? style.brand?.primaryColor;
    const secondary = style.brand?.colorSecondary ?? style.brand?.accentColor;
    const fontA = style.brand?.fontPrimary;
    const fontB = style.brand?.fontSecondary ?? style.brand?.fontMono;
    const brand = style.brand
      ? `Brand: ${style.brand.name} — ${style.brand.tagline}. Primary ${primary ?? '—'}, secondary ${secondary ?? '—'}. Fonts: ${fontA ?? '—'} / ${fontB ?? '—'}.`
      : '';
    // Output style guides — Jeff applies these when producing the matching file type.
    const outs = style.outputs ?? {};
    const outputsBlock = Object.entries(outs)
      .filter(([, v]) => typeof v === 'string' && (v as string).trim())
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n');
    const outputs = outputsBlock ? `Output style guides:\n${outputsBlock}` : '';
    styleBlock = ['Style sheet:', voice, brand, outputs].filter(Boolean).join('\n');
  }

  return [SYSTEM_PREAMBLE_BASE, styleBlock, memBlock].filter(Boolean).join('\n\n');
}

/** Ask Jeff a question. Runs a tool-use loop — Anthropic may request tools, we execute them,
 *  feed the results back, and keep going until the model finishes. */
export async function askJeff(opts: {
  history?: ChatTurn[];
  message: string;
  maxSteps?: number;
}): Promise<{ text: string; model: string; toolCalls: ToolCallLog[] }> {
  // Lazy import so TS doesn't complain about circular dep at eval time.
  const { allTools, runTool } = await import('./jeff-tools.js');
  const c = client();
  const system = buildSystemPrompt();

  type Msg = { role: 'user' | 'assistant'; content: any };
  const history = opts.history ?? [];
  const messages: Msg[] = [
    ...history.map<Msg>((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: opts.message },
  ];
  const tools = allTools();
  const toolCalls: ToolCallLog[] = [];
  const maxSteps = opts.maxSteps ?? 6;

  let text = '';
  for (let step = 0; step < maxSteps; step++) {
    const response = await c.messages.create({
      model: JEFF_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system,
      messages,
      tools,
    });

    // Push the assistant turn so tool results can refer back to it.
    messages.push({ role: 'assistant', content: response.content });

    // Collect text so far (may span multiple steps).
    const stepText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text).join('').trim();
    if (stepText) text = stepText;

    if (response.stop_reason !== 'tool_use') break;

    // Execute every tool_use block, feed results back as a single user turn.
    const toolUses = response.content.filter((b: any) => b.type === 'tool_use');
    const toolResults: any[] = [];
    for (const tu of toolUses as any[]) {
      // Skip server-side tools (Anthropic already ran them before returning).
      if (tu.name === 'web_search' || tu.name === 'web_fetch') continue;
      const { content, isError } = await runTool(tu.name, tu.input);
      toolCalls.push({ name: tu.name, input: tu.input, result: content.slice(0, 2000), isError });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content,
        is_error: !!isError,
      });
    }
    if (!toolResults.length) break; // all server-side — nothing for us to return
    messages.push({ role: 'user', content: toolResults });
  }

  return { text: text || '(Jeff returned an empty reply.)', model: JEFF_MODEL, toolCalls };
}

// ─── Article scan — populate memory from PathNotion articles ────────────────

interface ArticleRow {
  id: string;
  title: string;
  root: string;
  product_id: string | null;
  group_name: string | null;
  tags: string | null;
  updated_at: string;
  blocks_json: string | null;
}

function blocksToPlainText(blocksJson: string | null): string {
  if (!blocksJson) return '';
  try {
    const arr = JSON.parse(blocksJson) as any[];
    return arr
      .map((b) => typeof b?.text === 'string' ? b.text : '')
      .filter(Boolean)
      .join('\n')
      .slice(0, 4000);
  } catch {
    return '';
  }
}

async function summariseText(title: string, body: string, scope: string | null, systemPrompt: string): Promise<string> {
  if (!apiKey()) {
    // No API key — fall back to the first ~500 chars so the scan still produces useful rows.
    const trimmed = body.replace(/\s+/g, ' ').trim().slice(0, 500);
    return trimmed || `(no body) ${title}`;
  }
  const c = client();
  const scopeHint = scope && scope !== 'product' ? ` (scope: ${scope})` : '';
  const res = await c.messages.create({
    model: JEFF_MODEL,
    max_tokens: 200,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Title: ${title}${scopeHint}\n\nBody:\n${body || '(empty)'}`,
    }],
  });
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('').trim();
  return text || body.slice(0, 300);
}

/** Scan PathNotion articles. Walks through every doc, summarises the body, and upserts a memory row.
 *  Skips articles whose `updated_at` matches the previously-stored `source_updated_at` (cheap idempotency).
 *  `jobId` lets the scheduler pass in the parallel job row so we can read a custom prompt override. */
export async function scanArticleMemories(opts: { jobId?: string | null } = {}): Promise<{ scanned: number; updated: number; skipped: number }> {
  const rows = db.prepare(`
    SELECT d.id, d.title, d.root, d.product_id, d.group_name, d.tags, d.updated_at,
           (SELECT json_group_array(json(data)) FROM doc_blocks WHERE doc_id = d.id) AS blocks_json
    FROM docs d
    ORDER BY d.updated_at DESC
  `).all() as ArticleRow[];

  const systemPrompt = getJobPrompt(opts.jobId ?? null, 'scan-memories');

  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    // Skip if we already have a memory for this article at the same source_updated_at.
    const existing = db.prepare('SELECT source_updated_at FROM jeff_memories WHERE kind = ? AND source_id = ?').get('article', row.id) as { source_updated_at: string | null } | undefined;
    if (existing && existing.source_updated_at === row.updated_at) { skipped++; continue; }

    const body = blocksToPlainText(row.blocks_json);
    const summary = await summariseText(row.title, body, row.root, systemPrompt);
    const tags = row.tags ? (JSON.parse(row.tags) as string[]) : [];
    const scope = row.root && row.root !== 'product' ? row.root : (row.product_id ?? null);
    writeMemory({
      kind: 'article',
      sourceId: row.id,
      title: row.title,
      summary,
      tags,
      scope,
      sourceUpdatedAt: row.updated_at,
    });
    updated++;
  }
  return { scanned: rows.length, updated, skipped };
}

// ─── Drive file scan ────────────────────────────────────────────────────────

const SCANNABLE_MIMES = new Set<string>([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
]);
function isScannable(mime: string): boolean {
  return SCANNABLE_MIMES.has(mime) || mime.startsWith('image/');
}

async function summariseFileContent(
  entry: DriveEntry,
  content: NonNullable<Awaited<ReturnType<typeof fetchFileContent>>>,
  system: string,
): Promise<string> {
  const c = client();

  if (content.kind === 'text') {
    const trimmed = (content.text ?? '').trim();
    if (!trimmed) return `(empty) ${entry.name}`;
    const res = await c.messages.create({
      model: JEFF_MODEL,
      max_tokens: 220,
      system,
      messages: [{ role: 'user', content: `File: ${entry.name}\nType: ${entry.mimeType}\n\n${trimmed}` }],
    });
    return res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('').trim();
  }

  // Binary — send as a document or image block. `content.data` is already sized-capped.
  const base64 = content.data.toString('base64');
  const block: any = content.mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image',    source: { type: 'base64', media_type: content.mediaType,   data: base64 } };

  const res = await c.messages.create({
    model: JEFF_MODEL,
    max_tokens: 220,
    system,
    messages: [{
      role: 'user',
      content: [block, { type: 'text', text: `File: ${entry.name}` }],
    }],
  });
  return res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('').trim();
}

/** Walk the shared drive (bounded) and upsert a memory row per readable file.
 *  Skips files whose `modifiedTime` matches the previously-stored `source_updated_at`.
 *
 *  Resolution order for *which* folders to scan:
 *  1. Explicit `rootId` passed in — used for "Scan this folder" triggers
 *  2. Pinned folders in `jeff_pinned_folders` — walk each one up to the cap (split evenly)
 *  3. Fall back to the shared-drive root
 */
export async function scanDriveFiles(opts: { maxFiles?: number; rootId?: string; jobId?: string | null } = {}): Promise<{ scanned: number; updated: number; skipped: number; skippedNoKey?: boolean; skippedNoPins?: boolean; roots: Array<{ id: string; name: string }> }> {
  if (!apiKey()) {
    return { scanned: 0, updated: 0, skipped: 0, skippedNoKey: true, roots: [] };
  }
  const tokens = firstGoogleTokens();
  if (!tokens) return { scanned: 0, updated: 0, skipped: 0, roots: [] };
  const cfg = db.prepare('SELECT drive_id, drive_name, jeff_scan_cap FROM workspace_config WHERE id = 1').get() as
    | { drive_id: string | null; drive_name: string | null; jeff_scan_cap: number | null }
    | undefined;
  if (!cfg?.drive_id) return { scanned: 0, updated: 0, skipped: 0, roots: [] };

  const configuredCap = Math.max(1, Math.min(500, cfg.jeff_scan_cap ?? 40));
  const maxFiles = opts.maxFiles ?? configuredCap;

  // Figure out the root set. Rule: an explicit rootId (from a "Scan this folder" trigger) always wins.
  // Otherwise we scan only the pinned folders. If nothing is pinned we skip entirely — scanning the
  // whole shared drive silently was wasteful. The UI tells the user to pin something.
  let roots: Array<{ id: string; name: string }>;
  if (opts.rootId) {
    roots = [{ id: opts.rootId, name: '(scoped)' }];
  } else {
    const pinned = db.prepare('SELECT drive_folder_id AS id, folder_name AS name FROM jeff_pinned_folders ORDER BY folder_name').all() as Array<{ id: string; name: string }>;
    if (!pinned.length) {
      return { scanned: 0, updated: 0, skipped: 0, skippedNoPins: true, roots: [] };
    }
    roots = pinned;
  }

  // Share the cap across roots — if you pin 4 folders with a cap of 40, each gets 10.
  const perRootCap = Math.max(1, Math.floor(maxFiles / roots.length));
  const files: Array<import('./google-drive.js').DriveEntry> = [];
  for (const r of roots) {
    if (files.length >= maxFiles) break;
    const remaining = maxFiles - files.length;
    // eslint-disable-next-line no-await-in-loop
    const batch = await walkFiles(tokens, {
      driveId: cfg.drive_id,
      rootId: r.id,
      maxFiles: Math.min(perRootCap, remaining),
      maxDepth: 4,
      acceptedMimes: isScannable,
    });
    files.push(...batch);
  }

  let updated = 0;
  let skipped = 0;
  for (const f of files) {
    const existing = db.prepare('SELECT source_updated_at FROM jeff_memories WHERE kind = ? AND source_id = ?').get('drive-file', f.id) as { source_updated_at: string | null } | undefined;
    if (existing && existing.source_updated_at === f.modifiedTime) { skipped++; continue; }

    let content: Awaited<ReturnType<typeof fetchFileContent>> = null;
    try {
      // eslint-disable-next-line no-await-in-loop
      content = await fetchFileContent(tokens, f);
    } catch (err) {
      console.warn(`[jeff] fetch failed for ${f.name}:`, (err as Error).message);
      continue;
    }
    if (!content) continue;

    try {
      // eslint-disable-next-line no-await-in-loop
      const summary = await summariseFileContent(f, content, getJobPrompt(opts.jobId ?? null, 'scan-drive-files'));
      writeMemory({
        kind: 'drive-file',
        sourceId: f.id,
        title: f.name,
        summary,
        tags: [f.mimeType],
        scope: null,
        sourceUpdatedAt: f.modifiedTime,
      });
      updated++;
    } catch (err) {
      console.warn(`[jeff] summarise failed for ${f.name}:`, (err as Error).message);
    }
  }
  return { scanned: files.length, updated, skipped, roots };
}

// ─── Weekly summary ─────────────────────────────────────────────────────────

interface WeeklyContext {
  taskList: string;
  backlogList: string;
  upcomingEvents: string;
  memorySnippets: string;
}

function buildWeeklyContext(): WeeklyContext {
  const tasks = db.prepare("SELECT title, owner, due, status, priority FROM tasks WHERE status != 'done' ORDER BY due LIMIT 30").all() as any[];
  const backlog = db.prepare("SELECT title, product, stage, owner FROM backlog_items WHERE stage IN ('now', 'next') ORDER BY sort_order LIMIT 30").all() as any[];
  const events = db.prepare("SELECT title, start_iso, end_iso, location FROM calendar_events WHERE start_iso >= datetime('now') ORDER BY start_iso LIMIT 20").all() as any[];

  const memories = listMemories(15);
  const taskList = tasks.map((t: any) => `- ${t.owner}: ${t.title} (due ${t.due}${t.priority ? ' · ' + t.priority : ''})`).join('\n') || '(none)';
  const backlogList = backlog.map((b: any) => `- [${b.stage}] ${b.product}: ${b.title} (${b.owner})`).join('\n') || '(none)';
  const upcomingEvents = events.map((e: any) => `- ${e.start_iso}: ${e.title}${e.location ? ' @ ' + e.location : ''}`).join('\n') || '(none)';
  const memorySnippets = memories.slice(0, 10).map((m) => `- ${m.title}: ${m.summary}`).join('\n') || '(empty)';
  return { taskList, backlogList, upcomingEvents, memorySnippets };
}

export async function runWeeklySummary(opts: { jobId?: string | null } = {}): Promise<{ text: string; memoryId: string; driveFileId: string | null }> {
  const c = client();
  const ctx = buildWeeklyContext();
  const userMessage = `Open tasks:\n${ctx.taskList}\n\nBacklog (now + next):\n${ctx.backlogList}\n\nUpcoming events:\n${ctx.upcomingEvents}\n\nRecent memory:\n${ctx.memorySnippets}`;
  const res = await c.messages.create({
    model: JEFF_MODEL,
    max_tokens: 1200,
    system: getJobPrompt(opts.jobId ?? null, 'weekly-summary'),
    messages: [{ role: 'user', content: userMessage }],
  });
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('').trim();

  const today = new Date().toISOString().slice(0, 10);
  const title = `Weekly summary — ${today}`;
  const mem = writeMemory({
    kind: 'weekly-summary',
    sourceId: `weekly:${today}`,
    title,
    summary: text.slice(0, 600),
    tags: ['weekly', 'summary'],
  });

  // Also drop a markdown file into Drive's Jeff folder if we can. Non-fatal if it fails.
  let driveFileId: string | null = null;
  try {
    driveFileId = await saveToJeffFolder(`${title}.md`, text);
  } catch (err) {
    console.warn('[jeff] Could not save weekly summary to Drive:', (err as Error).message);
  }

  return { text, memoryId: mem.id, driveFileId };
}

/** Look up any user's Google tokens — we only need one to upload to the shared drive.
 *  Returns null if no user has connected Google. */
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

/** Save a markdown file into the workspace's Jeff folder. Auto-creates the folder if missing.
 *  Called by scheduled jobs that produce documents (weekly summary etc.). */
async function saveToJeffFolder(filename: string, markdown: string): Promise<string | null> {
  const cfg = db.prepare('SELECT drive_id, jeff_folder_id FROM workspace_config WHERE id = 1').get() as
    | { drive_id: string | null; jeff_folder_id: string | null }
    | undefined;
  if (!cfg?.drive_id) return null;

  const tokens = firstGoogleTokens();
  if (!tokens) return null;

  let jeffId = cfg.jeff_folder_id;
  if (!jeffId) {
    const folder = await ensureJeffFolder(tokens, cfg.drive_id);
    jeffId = folder.id;
    db.prepare("UPDATE workspace_config SET jeff_folder_id = ? WHERE id = 1").run(jeffId);
  }

  const buffer = Buffer.from(markdown, 'utf8');
  const entry = await uploadFile(tokens, {
    parentId: jeffId!,
    name: filename,
    mimeType: 'text/markdown',
    data: buffer,
  });
  // Consume the Readable import to keep TS happy if the SDK changes later.
  void Readable;
  return entry.id;
}

// ─── Daily news scan ────────────────────────────────────────────────────────

async function runDailyNews(opts: { jobId?: string | null } = {}): Promise<{ memoryId: string; competitors: number }> {
  const instruction = getJobPrompt(opts.jobId ?? null, 'daily-news');
  // Context append is now opt-in via placeholders so unrelated news jobs (payments industry,
  // regulatory watch) don't get the competitor list forced in. If the prompt references
  // {competitors} or {today}, we substitute; otherwise the prompt runs as-is.
  const today = new Date().toISOString().slice(0, 10);
  const competitors = db.prepare('SELECT name FROM jeff_competitors WHERE enabled = 1').all() as Array<{ name: string }>;
  const names = competitors.map((c) => c.name).join(', ') || '(none configured)';
  const message = instruction
    .replaceAll('{competitors}', names)
    .replaceAll('{today}', today);
  const result = await askJeff({ message });
  const mem = writeMemory({
    kind: 'note',
    sourceId: `daily-news:${today}`,
    title: `Daily news — ${today}`,
    summary: result.text.slice(0, 600),
    tags: ['daily-news'],
  });
  return { memoryId: mem.id, competitors: competitors.length };
}

// ─── Competitor feature watch ───────────────────────────────────────────────

async function runCompetitorFeatures(opts: { jobId?: string | null } = {}): Promise<{ competitors: number; features: number }> {
  const competitors = db.prepare('SELECT id, name, homepage FROM jeff_competitors WHERE enabled = 1 AND homepage IS NOT NULL').all() as Array<{ id: string; name: string; homepage: string }>;
  if (!competitors.length) return { competitors: 0, features: 0 };

  const beforeCount = (db.prepare('SELECT COUNT(*) AS n FROM jeff_tracked_features').get() as { n: number }).n;
  const list = competitors.map((c) => `- id="${c.id}", name="${c.name}", homepage="${c.homepage}"`).join('\n');

  const instruction = getJobPrompt(opts.jobId ?? null, 'competitor-features');
  const message = `${instruction}\n\nCompetitors:\n${list}`;
  const result = await askJeff({ message, maxSteps: 10 });
  const afterCount = (db.prepare('SELECT COUNT(*) AS n FROM jeff_tracked_features').get() as { n: number }).n;

  // Also save the narrative as a memory so the weekly summary can reference it.
  const today = new Date().toISOString().slice(0, 10);
  writeMemory({
    kind: 'note',
    sourceId: `competitor-features:${today}`,
    title: `Competitor feature watch — ${today}`,
    summary: result.text.slice(0, 600),
    tags: ['competitors', 'features'],
  });

  return { competitors: competitors.length, features: Math.max(0, afterCount - beforeCount) };
}

// ─── Research materials refresh ─────────────────────────────────────────────

async function runResearchRefresh(opts: { jobId?: string | null } = {}): Promise<{ competitors: number; digested: number }> {
  // Competitors with a press page configured — we can actually do something for these.
  const rows = db.prepare(`
    SELECT id, name, press_page_url AS pressPageUrl, region
    FROM jeff_competitors
    WHERE enabled = 1 AND press_page_url IS NOT NULL
    ORDER BY sort_order, name
  `).all() as Array<{ id: string; name: string; pressPageUrl: string; region: string | null }>;

  if (!rows.length) {
    return { competitors: 0, digested: 0 };
  }

  const list = rows.map((r) => `- ${r.name} (id=${r.id}, region=${r.region ?? 'global'}): ${r.pressPageUrl}`).join('\n');
  const today = new Date().toISOString().slice(0, 10);
  const instruction = getJobPrompt(opts.jobId ?? null, 'research-refresh');
  const message = `${instruction}\n\nCompetitors (all have press pages):\n${list}`;

  const result = await askJeff({ message, maxSteps: rows.length * 2 + 4 });

  // Save the narrative as a memory so the Week view / chat can reference today's refresh at a glance.
  const mem = writeMemory({
    kind: 'note',
    sourceId: `research-refresh:${today}`,
    title: `Research refresh — ${today}`,
    summary: result.text.slice(0, 600),
    tags: ['research', 'competitors'],
  });

  // Count how many save_tracked_feature calls Jeff made this run as a proxy for "useful findings".
  const digested = (result.toolCalls ?? []).filter((c) => c.name === 'save_tracked_feature' && !c.isError).length;
  void mem;
  return { competitors: rows.length, digested };
}

// ─── Job kinds dispatched by the scheduler ──────────────────────────────────

export type JobKind = 'scan-memories' | 'scan-drive-files' | 'weekly-summary' | 'daily-news' | 'competitor-features' | 'research-refresh';

/** Run a job by kind. The scheduler passes the jobId so each runner can pick up a custom
 *  prompt override for this particular job row. */
export async function runJob(kind: JobKind, jobId?: string | null): Promise<{ summary: string; changes: number }> {
  if (kind === 'scan-memories') {
    const r = await scanArticleMemories({ jobId });
    return {
      summary: `Scanned ${r.scanned} articles — ${r.updated} updated, ${r.skipped} unchanged.`,
      changes: r.updated,
    };
  }
  if (kind === 'scan-drive-files') {
    const r = await scanDriveFiles({ jobId });
    if (r.skippedNoKey) {
      return { summary: 'ANTHROPIC_API_KEY not set — Drive file scan needs the API to summarise PDFs and images. Skipped.', changes: 0 };
    }
    if (r.skippedNoPins) {
      return { summary: 'No folders pinned — scan skipped. Pin folders in Docs to tell Jeff what to read.', changes: 0 };
    }
    const rootsLabel = r.roots.length === 1 && r.roots[0].name !== '(scoped)'
      ? r.roots[0].name
      : `${r.roots.length} folder${r.roots.length === 1 ? '' : 's'}`;
    return {
      summary: `Scanned ${r.scanned} Drive files across ${rootsLabel} — ${r.updated} updated, ${r.skipped} unchanged.`,
      changes: r.updated,
    };
  }
  if (kind === 'weekly-summary') {
    const r = await runWeeklySummary({ jobId });
    return {
      summary: r.driveFileId
        ? `Wrote weekly summary (memory ${r.memoryId}, Drive file ${r.driveFileId}).`
        : `Wrote weekly summary (memory ${r.memoryId}). Drive copy skipped — no shared drive / Google connection.`,
      changes: 1,
    };
  }
  if (kind === 'daily-news') {
    const r = await runDailyNews({ jobId });
    return {
      summary: `Drafted news digest across ${r.competitors} competitor${r.competitors === 1 ? '' : 's'} (memory ${r.memoryId}).`,
      changes: 1,
    };
  }
  if (kind === 'competitor-features') {
    const r = await runCompetitorFeatures({ jobId });
    return {
      summary: `Checked ${r.competitors} competitor${r.competitors === 1 ? '' : 's'}, recorded ${r.features} new feature${r.features === 1 ? '' : 's'}.`,
      changes: r.features,
    };
  }
  if (kind === 'research-refresh') {
    const r = await runResearchRefresh({ jobId });
    if (r.competitors === 0) {
      return { summary: 'No competitors with a press page URL configured — nothing to refresh. Add press page URLs in Settings → Jeff.', changes: 0 };
    }
    return {
      summary: `Refreshed ${r.competitors} competitor${r.competitors === 1 ? '' : 's'}, logged ${r.digested} new finding${r.digested === 1 ? '' : 's'}.`,
      changes: r.digested,
    };
  }
  throw Object.assign(new Error(`Unknown job kind: ${kind}`), { status: 400 });
}
