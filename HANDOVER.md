# PathNotion — handover for a fresh Claude

Read this top-to-bottom before making any change. Every section matters.

---

## 1. What PathNotion is

Two-founder daily workspace for **Dave (CEO)** and **Raj (CFO)** of a UK fintech building a platform-payments product called **Path**. Six modules: **Week, Backlog, Documentation, Tasks, Calendar, Jeff** (the agent). The existing product is a backlog service at `backlog.path2ai.tech`; PathNotion extends outward from it.

Canonical UI reference: `design_handoff_pathnotion/PathNotion.html` (single-file React prototype). **Before changing anything visible, open the relevant section there.** Screenshots live in `design_handoff_pathnotion/screenshots/` (light + dark, desktop + mobile).

---

## 2. Stack

- **Frontend** (`web/`): Vite + React 18 + TypeScript, Zustand for UI state, TanStack Query for server state, TipTap for the article editor. Inline CSS-in-JS + a small set of `web/src/styles/*.css` files.
- **Backend** (`api/`): Node 20 + Express + TypeScript, better-sqlite3, Anthropic SDK (`@anthropic-ai/sdk`), googleapis.
- npm workspaces at the repo root (`web/` + `api/`). `npm run dev` runs both.
- Database file: `api/data/pathnotion.db` (SQLite, WAL).

### Dev cadence
- **Never skip hooks/signing** (`--no-verify`, `--no-gpg-sign`).
- `tsx watch` runs the API. **`tsx watch` does NOT reload `api/.env`** — editing env values requires `pkill -f "tsx watch src/index"` + restart. Has bitten us more than once.
- `dotenv.config({ override: true })` is set in `api/src/index.ts` because Claude Code's sandbox sets `ANTHROPIC_API_KEY=""` into spawned shells, which otherwise wins over `.env`.
- Vite falls back to port 5174 if 5173 is busy. Users sometimes have two tabs on different ports.

---

## 3. User preferences — critical

These come from the user's memory file (`/Users/davidkey/.claude/projects/.../memory/MEMORY.md`) and explicit instructions throughout sessions. **Honour all of them.**

- **Plain product-oriented language.** Frame replies by what the user sees, not by code identifiers. No "I'll refactor the `useFoo` hook" — say "the Docs list will now show the folder name inline." Exception: technical debugging where file paths are useful.
- **Clean, simple English** in responses. Avoid breathless lists, "I've also taken the liberty," hedging. Short paragraphs.
- **Always state deferred vs done honestly.** User explicitly thanks this.
- **Visibly verify visually before handing back** on UI changes. Use `mcp__Claude_Preview__*` tools (preview_start, preview_screenshot, preview_eval, preview_inspect). Don't trust that a UI change "looks right" without loading the page.
- **Follow the prototype.** Pull values from the prototype's inline styles or existing `web/src/styles/tokens.css` tokens. **Do not ad-lib colours / sizes / radii** — find the token. Tokens look like `--fg-1`, `--bg-surface`, `--path-primary-tint`, `--danger-bg`, etc.
- **Dark mode swaps via `[data-theme="dark"]`.** Components don't branch on theme — they reference tokens that flip automatically.
- **Avatars** use `.av-dave / .av-raj / .av-agent` classes in `web/src/styles/globals.css`. Never pass colour via inline style for a founder avatar.
- **"Now" date is pinned** to `Mon 13 Apr 2026 · 10:42 GMT` in `web/src/App.tsx` (`new Date('2026-04-13T10:42:00+01:00')`). **Leave it pinned** until real auth + real calendars replace seed data.
- The user **batches asks in one message** ("also while we're here..."). Parse all of them; don't miss any.
- The user **corrects tersely** ("not great" / "ugly" / "doesn't work"). Take the correction straight — rework, don't defend.
- **End responses with 1–3 "next up" options.** Makes planning easier for them.
- **Commit only when asked.** Git writes are not automatic.

---

## 4. File map — the hot zones

### Frontend

| File | Purpose |
|---|---|
| `web/src/App.tsx` | Route dispatcher. Docs (product, finance, sales, legal) all render `DocsDriveReal` with a mode prop. |
| `web/src/views/DocsDriveReal.tsx` | **1800+ lines.** The entire Docs surface: folder tree, middle pane, article + file rows, selection toolbar, preview drawer, inline `<iframe>` preview, pin UI, new folder/article/upload, dialogs (Rename, Move, ConfirmTrash, NewArticle, ArticleRow menu). |
| `web/src/views/JeffView.tsx` | **~900 lines.** Status header, tabs (Conversation → Schedule → Run log → Access → Memory), ChatTab (with Clear chat button), ScheduleTab (cards + dialog), MemoryTab (filter + Scan Drive files + Scan articles), `ScheduleEditor` (structured editor: Frequency/Day/Time/Minutes/Custom). |
| `web/src/views/SettingsView.tsx` | Users, Products, Categories, **Jeff tab** (ScanScopePanel + StyleSheetPanel + CompetitorsPanel), Google (GoogleTab + DriveTab + CalendarTab), Notifications. |
| `web/src/views/WeekView.tsx` | Week summary tile reads from the latest `weekly-summary` memory. |
| `web/src/components/Dropdown.tsx` | Theme-aware `<select>` replacement. **Use this everywhere.** Native `<option>` ignores most CSS in Chromium/macOS which is why dark-mode popups used to render white. |
| `web/src/components/primitives.tsx` | `Avatar`, `Card`, `BacklogRow`, `HeadlineCard`, `InfoTip` (hover tooltip for info icons). |
| `web/src/components/Icon.tsx` | Inline SVGs. `sw` prop for stroke width. Added icons this session: `pin`, `info`. |
| `web/src/components/PageHeader.tsx` | Title + sub + tabs. Used by every view. |
| `web/src/components/DocEditor.tsx` | TipTap article editor drawer. |
| `web/src/lib/api.ts` | Typed API client. All data types exported (`JeffCompetitor`, `JeffPinnedFolder`, `JeffStyleSheet`, `DriveEntry`, …). |
| `web/src/lib/queries.ts` | TanStack Query hooks. Invalidation keys: `['agent', 'jobs']`, `['agent', 'memories']`, `['drive', 'children']`, `['agent', 'pinned-folders']`, etc. |
| `web/src/lib/store.ts` | Zustand store. Includes `askJeff(prompt)` action which sets `jeffPrefill` + navigates to `jeff` route. |
| `web/src/styles/tokens.css` | All colour / spacing / radius / shadow / font tokens. **Never add new tokens without reading this first.** |
| `web/src/styles/globals.css` | `.row-hover`, `.row-actions-btn` hover-reveal, `.input` + `textarea.input`, native select styling (mostly legacy now). |

### Backend

| File | Purpose |
|---|---|
| `api/src/index.ts` | Entry point. `dotenv.config({ override: true })`. Starts digest scheduler, calendar-sync scheduler, **Jeff scheduler**. |
| `api/src/routes/agent.ts` | All `/api/agent/*` endpoints: status, conversations (GET + DELETE), message, memories (list + scan + scan-drive + clear), schedule (GET + POST + PATCH + DELETE + :id/run + prompt-defaults), weekly-summary, competitors CRUD, tracked-features, style-sheet, pinned-folders CRUD, settings (scan cap), access grants. |
| `api/src/routes/drive.ts` | `/api/drive/*` — config, shared-drives, children, entry/:id (GET + PATCH + DELETE + download), folders (POST), upload (multer), bootstrap-jeff. |
| `api/src/routes/docs.ts` | `/api/docs/*` — tree, articles (by folder), get/patch/create/delete. |
| `api/src/services/jeff.ts` | Anthropic client, tool-use chat loop (`askJeff`), `JOB_PROMPT_DEFAULTS` + `getJobPrompt`, memory CRUD (`writeMemory`, `listMemories`, `countMemories`), all 6 job runners (`scanArticleMemories`, `scanDriveFiles`, `runWeeklySummary`, `runDailyNews`, `runCompetitorFeatures`, `runResearchRefresh`), `runJob(kind, jobId?)` dispatcher. |
| `api/src/services/jeff-tools.ts` | Tool registry. 18 tools: `search_memory`, `list_tasks`, `list_backlog`, `list_events`, `list_articles`, `read_article`, `create_task`, `patch_event`, `find_calendar_conflicts`, `list_competitors`, `add_competitor`, `list_tracked_features`, `save_tracked_feature`, `list_pinned_folders`, `pin_folder`, `unpin_folder`, `read_drive_file`, `save_note_to_drive`. Plus two Anthropic hosted tools: `web_search_20250305` and `web_fetch_20250910` (exported as `SERVER_SIDE_TOOLS`). |
| `api/src/services/jeff-scheduler.ts` | 60-second tick. Parses `@hourly`, `@daily`, `@weekly`, `N m`, 5-field cron. `runJobNow(jobId)` for manual runs. Passes `jobId` to `runJob` so runners can read per-job prompt overrides. |
| `api/src/services/google-drive.ts` | `listSharedDrives`, `listChildren`, `getEntry`, `ensureFolder`, `ensureJeffFolder`, `uploadFile`, `downloadFile`, `renameFile`, `moveFile`, `trashFile`, **`fetchFileContent`** (exports text for Google-native, returns bytes for PDFs/images), **`walkFiles`** (bounded BFS walker). |
| `api/src/services/google-calendar.ts` | OAuth client, tokens. `GOOGLE_SCOPES` includes `drive.readonly` and `drive.file` now. |
| `api/src/services/calendar-sync.ts` | Pulls Google events into local DB. Not yet two-way. |
| `api/src/services/daily-digest.ts` | Email digest via SMTP. |
| `api/src/db/client.ts` | **Schema + all migrations + seeds in one file.** ALTER statements guarded with try/catch. See section 5 for migration gotchas. |
| `api/src/db/schema.sql` | Base tables (users, products, backlog_items, tasks, calendar_events, docs, doc_blocks, calendar_sources, agent_jobs, agent_runs, agent_messages, access_grants, sessions, business_categories). |

---

## 5. Database schema

Base tables in `schema.sql`. Migrations + additional tables in `client.ts` (additive, guarded). Here's what's live now:

### Jeff tables
- `jeff_memories` — kind ('article' | 'drive-file' | 'weekly-summary' | 'note'), source_id, title, summary, tags JSON, scope, source_updated_at, created_at, updated_at. Dedupe via `(kind, source_id)`.
- `jeff_style_sheet` — singleton row (id=1) with `data` JSON blob. Seeded with voice/brand/outputs.
- `jeff_competitors` — id, name, homepage, press_page_url, notes, focus_areas JSON, region ('uk' | 'de' | 'fr' | 'es-pt' | 'it' | 'benelux' | 'global'), enabled, sort_order. Seeded with 15 across regions.
- `jeff_tracked_features` — id, competitor_id FK, name, summary, source_url, discovered_at.
- `jeff_pinned_folders` — drive_folder_id PK, folder_name, pinned_at, pinned_by.

### agent_jobs (extended)
Extra columns added to the original seed table:
- `kind TEXT` — one of `scan-memories` | `scan-drive-files` | `weekly-summary` | `daily-news` | `competitor-features` | `research-refresh`. Nullable; jobs without a kind are stubs the scheduler skips.
- `input TEXT` — reserved for future parameterisation.
- `next_run_at TEXT` — scheduler writes this so reboots don't fire everything at once.
- `prompt TEXT` — nullable per-job instruction override. When null, runner uses `JOB_PROMPT_DEFAULTS[kind]`.

### workspace_config (singleton)
- `drive_id`, `drive_name`, `jeff_folder_id`, `updated_at`, `updated_by`, `jeff_scan_cap` (default 40).

### docs (extended)
- `drive_folder_id TEXT` — article can be bound to a Drive folder so it shows in that folder's merged listing.

### Migration gotchas we've already hit
1. **SQLite UNIQUE on NULL treats them as distinct.** Our calendar_events.external_id partial index was replaced with a full UNIQUE index because `ON CONFLICT` targets can't match partial indexes.
2. **SUBSTR character offset.** One migration used `+3` where it should have been `+2` (em-dash = 1 char, `— ` = 2 chars, want to start at position+2+1=+3 via 1-indexed SUBSTR… actually `+2` was right and we'd used `+3`). Damage was six descriptions with first character chopped. Fixed with an idempotent restore UPDATE in client.ts. **Test migrations that touch text with `LIKE` patterns on a copy of the DB first.**
3. **INSERT OR IGNORE** is used liberally for seeds. Re-running never overwrites user edits — that's intentional.

---

## 6. Jeff — the agent's architecture

### Model
`JEFF_MODEL = 'claude-sonnet-4-5'` (env override via `JEFF_MODEL`). Upgrade in a single constant in `api/src/services/jeff.ts`.

### Chat (`askJeff`)
- Tool-use loop, up to 6 steps.
- System prompt = base preamble + style-sheet block + 20 most recent memories.
- Short-term history = last 20 `agent_messages` rows, passed as the Anthropic `messages` array.
- Tool dispatch: on each iteration, execute every `tool_use` block not named `web_search` / `web_fetch` (those run server-side at Anthropic). Feed results back as a single `role: 'user'` turn of `tool_result` content blocks. Loop.
- Returns `{ text, model, toolCalls: ToolCallLog[] }`. Tool calls are persisted in `agent_messages.actions` JSON so the UI can render them as chips.

### Memory
- **Long-term** = `jeff_memories` table. Populated by scans (articles, Drive files) + by job outputs (weekly summaries, daily news, research findings). Dedupe via `(kind, source_id)` and `source_updated_at` so re-scans only update changed items.
- **Short-term** = last 20 chat messages. Wipable via `DELETE /api/agent/conversations` (Clear chat button).
- In the system prompt, memories appear as `[N] (kind) "title" — summary` lines. The model is instructed to cite titles when it draws from memory.

### Scheduler
`jeff-scheduler.ts` runs a 60s tick. Parses:
- `@hourly` / `@daily` / `@weekly`
- `N m` (every N minutes, 1–59)
- 5-field cron (minute, hour, `*`, `*`, day-of-week). Only these three fields are honoured; day-of-month and month are ignored.

`next_run_at` is written after each run. New jobs (NULL `next_run_at`) get scheduled on the next tick, not fired immediately — prevents all-jobs-at-once on boot.

### Job kinds
All six seeded; the first two enabled by default, others off:

| Kind | Schedule | What it does |
|---|---|---|
| `scan-memories` | @hourly | Reads articles, summarises bodies, upserts memory rows. Skips articles whose `updated_at` matches `source_updated_at` in memory. |
| `scan-drive-files` | `0 4 * * *` (disabled) | **Only runs when folders are pinned.** Walks pinned folders ≤4 levels deep, up to `jeff_scan_cap` files total (split across pins). Reads each file (Google-native → text, PDF/image → bytes sent as document/image blocks), summarises, upserts memory. Returns `skippedNoKey: true` if no `ANTHROPIC_API_KEY`, `skippedNoPins: true` if nothing pinned. |
| `weekly-summary` | Mon 07:00 | Builds context from open tasks + now/next backlog + upcoming events + 15 recent memories. Writes memory row + uploads `.md` to the Jeff Drive folder. |
| `daily-news` | Weekdays 07:30 (disabled) | Uses `web_search` + `web_fetch`. **Placeholder-based context:** `{competitors}` and `{today}` substituted in when the prompt references them, otherwise the prompt runs untouched. |
| `competitor-features` | Mon 09:00 (disabled) | Walks enabled competitors with homepages. Instructs Jeff to use `web_search`/`web_fetch` and call `save_tracked_feature` for each finding. Counts new tracked_features as `changes`. |
| `research-refresh` | Mon 06:00 (disabled) | Walks enabled competitors with `press_page_url`. Same loop as competitor-features. |

### Prompt overrides
- `agent_jobs.prompt` is nullable. `getJobPrompt(jobId, kind)` returns override → default from `JOB_PROMPT_DEFAULTS`.
- The frontend dialog shows the default as textarea placeholder, with a "Reset to default" button that clears the override.
- The card shows a green "custom prompt" chip when a job has one.
- **daily-news** uses `{competitors}` / `{today}` placeholders for opt-in context injection. Other runners always append their context (the competitor list IS the input for competitor-features).

---

## 7. Docs surface

### DocsDriveReal is the only Docs view
All four routes (`docs`, `finance-docs`, `sales-docs`, `legal-docs`) render `<DocsDriveReal mode="product|finance|sales|legal" />`. The `MODE_CONFIG` constant carries per-mode hero title/sub.

`DocsView.tsx` is kept only because `Attachments.tsx` imports `FileBadge`, `fileMeta`, `humanBytes` from it. No route references it.

### Article silo'ing
Each mode only shows articles where `article.root === mode`. So the Finance view never bleeds Product docs and vice versa. Drive files are not filtered by mode — they live wherever they're filed in the shared drive.

### Layout
Three panes: folder tree (260 px) · middle pane · preview drawer (440 px when open). **When the drawer opens, the folder tree collapses entirely** so the middle pane can breathe. Close the drawer → tree returns.

### Selection toolbar
When a Drive file is selected, the `SelectionToolbar` sits above the file list (not in the drawer). Path-primary left stripe, icon-only 36×36 buttons: Open/Edit in Drive · Share · Copy link · Move · Rename · | · Trash. Prototype pattern. **No filename or X button** (per user feedback — the drawer header already shows the filename).

### Article row menu
Each article row has a hover-reveal 3-dot menu on the right (Rename / Open / Delete). Click-outside + Escape close.

### File row
Files don't have a row menu. Actions live in the toolbar above the list when a file is selected. User explicitly removed per-row file menus ("prototype didn't have them + two surfaces for the same actions is noise").

### Inline preview
`<iframe src="https://drive.google.com/file/d/{id}/preview">` in the drawer's body area. Works for Docs/Sheets/Slides/PDFs/images/video. Relies on the user being signed into Google in their browser — which they are if they can use the Drive features. Headless browsers show a "Sign in to Google" screen because the iframe doesn't share our OAuth session.

### New folder
"New folder" button in middle-pane toolbar → `prompt('New folder name:')` → `POST /api/drive/folders`. Calls `ensureFolder` (idempotent on duplicate names).

### Pins
Pin icon on each folder tree row — hidden until hover for unpinned, visible green when pinned. Click toggles. The pin set drives `scanDriveFiles` and is visible in Settings → Jeff → Scan scope.

---

## 8. Key decisions + rationale

1. **Custom `Dropdown<T>` replaces every native `<select>`.** Native `<option>` ignores most CSS in Chromium/macOS, so dark-mode popups rendered white. 10 sites swapped. **Never add a new `<select>` — use `Dropdown<T>`.**
2. **ESM dotenv override (`{ override: true }`).** Claude Code sandbox exports `ANTHROPIC_API_KEY=""` into spawned shells as a safety measure. Without override, the empty shell value wins over `.env` and Jeff says "not set" forever. Took a session to diagnose.
3. **Tool-use loop skips server-side tools.** `web_search_20250305` and `web_fetch_20250910` are hosted by Anthropic; their results arrive in the response. Our dispatcher checks `tu.name === 'web_search' || tu.name === 'web_fetch'` and skips — no local execution, no result to feed back (Anthropic already did).
4. **No npm cron library.** `jeff-scheduler.ts` is ~80 lines. Supports the expressions we need. Adding a library for one more cron shape isn't worth the dependency.
5. **Memory = keyword search + recency, not vector search.** Workspace is small (low thousands of docs at most). `LIKE` on title/summary + top-N-by-recency in the system prompt works.
6. **PDFs/images sent directly to Anthropic.** No pdf-parse, no OCR. `document` and `image` content blocks handle it natively.
7. **Drive preview via iframe, not server-side render.** `https://drive.google.com/file/d/{id}/preview` is Google's own viewer. Zero work on our side.
8. **Scan only when pinned.** `scanDriveFiles` returns `skippedNoPins: true` if nothing's pinned. Scanning the whole drive silently wasted Anthropic credits.
9. **Cap splits evenly across pins.** Four pins × cap 40 = 10 per folder.
10. **"Now" date pinned to 13 Apr 2026 10:42 GMT.** Until real auth + real calendars land, this gives the backlog/events seed data a fixed "today" to render against.
11. **Placeholder-based context for daily-news.** User explicitly rejected the forced competitor-list append — they want generic news jobs (e.g. payments industry, FCA watch) that don't drag the competitor list into every prompt.
12. **Modern structured scheduler editor.** Replaced preset-pills-plus-raw-cron (which had a "Custom" bug where the dropdown silently snapped back). Now it's Frequency + Day + Time — three fields max, only what applies shows. Live preview says "Runs **Daily 09:00**" below the form.

---

## 9. Approaches rejected + why

1. **Auto-scan of whole Drive when nothing pinned** — silent token burn. Now: no pins = no scan.
2. **Per-row 3-dot menu on file rows** — user removed after initial add. Toolbar is the single surface.
3. **Embedding-based RAG** — overkill for the workspace size.
4. **pdf-parse / Tesseract** for local text extraction — Anthropic's native document/image blocks handle it cleanly.
5. **`@google-cloud/storage` + server-side PDF rendering** — iframe approach is zero code.
6. **Preset pills + raw cron input** — "Custom" was discoverability-broken. Replaced with structured editor.
7. **Cadence label on the Schedule card** — user felt it was noise. Now only "Next: X today" shows when enabled.
8. **Raw cron (`0 9 * * 1`) anywhere user-visible** — humanised ("Mondays 09:00") everywhere except the edit dialog's Custom mode.
9. **Classic DocsView for product mode** — user explicitly said "close out the classic view." DocsView kept only as a module that exports utilities for Attachments.tsx.
10. **Native HTML `<select>`** — see decision 1.
11. **Committing changes eagerly** — user commits explicitly, never on assumption.

---

## 10. Open items / deferred

In rough priority order (what the user has asked for but we haven't built):

1. **PowerPoint generation via `pptxgenjs`.** Style sheet has `brand` (colours, fonts) and `outputs.competitorBrief` already set up to drive templates. Make it a new job kind `make-presentation` + a `make_presentation` tool. Save the `.pptx` to the Jeff Drive folder.
2. **Real Share flow.** Drive permissions API (`drive.permissions.create`) to add emails + pick role. Currently Share just opens the webViewLink for the user to use Drive's own dialog.
3. **Calendar Phase 3** — two-way sync. Local → Google. Read-only pull + clash detection already in.
4. **Research-refresh downloads.** Currently produces memory rows + tracked features. Original vision: download PDFs from press pages into a Drive Research folder. Needs a Drive-upload step in the runner + maybe a `pressPagePdfSelector` column per competitor.
5. **TipTap block for embedded Drive files.** Inline image + PDF embeds in articles. Big-ish because TipTap extensions add complexity.
6. **Weekly summary tile on Week view** — already reads latest weekly-summary memory. Could also surface today's daily-news if that job is enabled.
7. **Duplicate cleanup helper.** User has a duplicate "Stripe Connect" row (one from migration seed, one they added manually). Small tool + UI affordance to merge or dedupe.
8. **Per-run scan cap override.** The UI global cap is 40. Useful to have a "scan this folder right now with cap 100" button — `rootId` is already plumbed through `scanDriveFiles`.
9. **Kill-stale-tsx-watch dev helper.** `npm run dev` sometimes leaves a pile of `tsx watch src/index.ts` processes. A top-level script that `pkill`s stale ones before starting would save repeated manual cleanup.
10. **Reports view** — still minimal. No current ask, but visually under-invested.

---

## 11. Operational gotchas (read these)

1. **API key format.** Must start with `sk-ant-api03-`. User once pasted only the tail and we spent a session debugging "ready: false".
2. **`tsx watch` does NOT reload `.env`.** After editing `api/.env`: `pkill -f "tsx watch src/index"; nohup npm --workspace api run dev > /tmp/pn-api.log 2>&1 &`.
3. **Claude Code sandbox leaks `ANTHROPIC_API_KEY=""` into shells.** Fixed by `dotenv.config({ override: true })`. If another env var ever needs the same treatment, same pattern.
4. **Migration text manipulation** — be very careful with `SUBSTR` + em-dash. SQLite `INSTR` is character-indexed, `SUBSTR(s, pos)` is 1-based. Test on a copy of the DB.
5. **Vite port fallback** — 5173 → 5174 silently. When verifying, check `lsof -iTCP:5173 -sTCP:LISTEN` + `:5174`.
6. **API uptime** — `ps -p <pid> -o etime=` tells you how long the API process has been running. If it's hours old, env changes haven't been picked up.
7. **Native `<input type="time">`** works fine in dark mode (respects `color-scheme`). Only `<select>` needed replacing.
8. **The user sometimes closes Claude mid-flow.** Treat the last user message as a checkpoint; when they return, pick up from there without re-explaining what they already saw.
9. **Dates in SQLite** — `datetime('now')` is UTC. Human-readable display done in the frontend via `new Date()` + `toLocaleString`.
10. **Drive API rate limits** — each `scan-drive-files` run hits Drive list + file export/download per file. The 40-file cap keeps us well under rate limits but on a 500-file workspace you'd want batching.

---

## 12. How to verify a UI change

1. `mcp__Claude_Preview__preview_list` — see what's running.
2. `mcp__Claude_Preview__preview_start` with name `web` and/or `api` (from `.claude/launch.json`).
3. Fill login form if needed — username `dave`, password `pathnotion` (seed default).
4. `mcp__Claude_Preview__preview_resize` to `1440 × 900` for desktop layout.
5. Navigate via `preview_eval` clicking span text, e.g. `Array.from(document.querySelectorAll('span')).find(s => s.textContent.trim() === 'Jeff' && s.closest('.nav-row')).closest('.nav-row').click()`.
6. `preview_inspect` with CSS selector to check computed styles (more reliable than screenshots for colours/sizes).
7. `preview_screenshot` last, to confirm the visual.

Do **not** hand back a UI change without at least a DOM inspect or a screenshot.

---

## 13. Communication style for this user

- **Short acknowledgement at the start, details in the middle, "next up" options at the end.**
- **Never say "I'll refactor the X hook" or "the Y component was broken."** Say "the Drive browse view was loading slowly" or "the scan card now shows when the next run is."
- **Always honest about deferred vs done.** User explicitly thanked this.
- **Flag duplicates / stale state / env issues proactively** at the end of responses when you notice them.
- **No emojis in files** unless user asks. Text emoji in responses is fine sparingly.
- **Treat "not great" / "ugly" / "doesn't work" as "redo it."** Don't defend, don't rationalise — rework.

---

## 14. Current state as of handover

- Dark-mode dropdowns are fixed — native `<select>` gone across Jeff, Settings, Backlog, Reports.
- Clear chat button lives top-right of the Conversation chat column.
- Modern structured ScheduleEditor is in (Frequency / Day / Time / Minutes / Custom).
- Jeff has 18 local tools + 2 Anthropic-hosted (web_search, web_fetch).
- Prompt overrides per-job are live, with default shown as placeholder.
- 15 competitors seeded across regions. User pinned 5 folders (Market Research, Path Commissions, Path Presentations, Product, Product Material).
- `ANTHROPIC_API_KEY` is correctly set in `api/.env`. Jeff status shows "Ready · claude-sonnet-4-5 · 22+ memories".
- `ScheduleEditor` renders its preview as "Runs **Mondays 09:00**" live below the form.

Last user message before this handover ask was a thumbs-up on the dark-mode dropdown fix.

Most-likely next ask: **PowerPoint generation** (user mentioned it multiple sessions ago; style sheet is ready for it) or **real Share flow**.

---

## 15. Things the user said verbatim that matter

- *"no neeed to take up the full width with massive buttons"* — the user notices when UI feels chunky.
- *"use modern web scheduler layout"* — informed the structured editor decision.
- *"please do keep the summaries in readable English thx"* — this is a standing ask.
- *"broken english with little meaning"* — something to avoid in output.
- *"so we can tweak as we learn more"* — users want configurable, not baked-in.
- *"if its scheduled, simple"* — user values simplicity over completeness in UI.
- *"there is no need to show the cron setup on the card"* — cron is for editors, not for cards.
- *"drop the competitors by default - thats a different scan"* — context-sensitive defaults matter.
- *"we do not want those buttons on the side bar"* — the user has strong opinions on placement; match the prototype.

---

Good luck. If anything looks off, the user will tell you — and they'll be right.
