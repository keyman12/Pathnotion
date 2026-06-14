import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DATABASE_FILE
  ?? path.resolve(__dirname, '../../data/pathnotion.db');

const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schemaSql = fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8');
db.exec(schemaSql);

// Migrations — additive / destructive. Each statement is wrapped so re-running is a no-op.
try { db.exec('ALTER TABLE backlog_items ADD COLUMN effort_days REAL'); } catch { /* already present */ }
try { db.exec('ALTER TABLE backlog_items ADD COLUMN link_type TEXT'); } catch { /* already present */ }
try { db.exec('ALTER TABLE backlog_items ADD COLUMN link_ref TEXT'); } catch { /* already present */ }
try { db.exec('ALTER TABLE backlog_items ADD COLUMN attachments TEXT'); } catch { /* already present */ }
try { db.exec('ALTER TABLE tasks ADD COLUMN attachments TEXT'); } catch { /* already present */ }
try { db.exec('ALTER TABLE tasks ADD COLUMN priority TEXT'); } catch { /* already present */ }
try { db.exec('ALTER TABLE tasks ADD COLUMN google_task_id TEXT'); } catch { /* already present */ }
try { db.exec('ALTER TABLE tasks ADD COLUMN google_task_list_id TEXT'); } catch { /* already present */ }
try { db.exec('ALTER TABLE tasks ADD COLUMN google_owner_key TEXT'); } catch { /* already present */ }
try { db.exec('ALTER TABLE tasks ADD COLUMN google_etag TEXT'); } catch { /* already present */ }
try { db.exec('ALTER TABLE tasks ADD COLUMN google_updated_at TEXT'); } catch { /* already present */ }
try { db.exec('ALTER TABLE tasks ADD COLUMN google_web_link TEXT'); } catch { /* already present */ }
try { db.exec('ALTER TABLE tasks ADD COLUMN last_synced_at TEXT'); } catch { /* already present */ }
try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_google_id ON tasks(google_task_list_id, google_task_id)'); } catch { /* already present */ }
// One-time migration: fold legacy link_type/link_ref into a single attachment for any task
// that still has them but no attachments payload.
try {
  db.exec(`
    UPDATE tasks
    SET attachments = json_array(json_object('type', link_type, 'ref', link_ref))
    WHERE link_type IS NOT NULL
      AND link_ref IS NOT NULL
      AND (attachments IS NULL OR attachments = '')
  `);
} catch { /* link columns may not exist on a brand-new DB */ }

// Calendar source connections — per-user Google / CalDAV / ICS tokens + settings.
try { db.exec("ALTER TABLE calendar_sources ADD COLUMN provider TEXT NOT NULL DEFAULT 'google'"); } catch { /* already present */ }
try { db.exec('ALTER TABLE calendar_sources ADD COLUMN access_token TEXT'); } catch { /* already present */ }
try { db.exec('ALTER TABLE calendar_sources ADD COLUMN refresh_token TEXT'); } catch { /* already present */ }
try { db.exec('ALTER TABLE calendar_sources ADD COLUMN token_expiry INTEGER'); } catch { /* already present */ }
try { db.exec('ALTER TABLE calendar_sources ADD COLUMN scope TEXT'); } catch { /* already present */ }
try { db.exec('ALTER TABLE calendar_sources ADD COLUMN connected_at TEXT'); } catch { /* already present */ }
try { db.exec('ALTER TABLE calendar_sources ADD COLUMN sync_token TEXT'); } catch { /* already present */ }
try { db.exec('ALTER TABLE calendar_sources ADD COLUMN tasks_last_sync_at TEXT'); } catch { /* already present */ }

// Calendar events — columns added to support real external syncing beyond the demo shape.
try { db.exec('ALTER TABLE calendar_events ADD COLUMN source_id INTEGER'); } catch { /* already present */ }
try { db.exec('ALTER TABLE calendar_events ADD COLUMN start_iso TEXT'); } catch { /* already present */ }
try { db.exec('ALTER TABLE calendar_events ADD COLUMN end_iso TEXT'); } catch { /* already present */ }
try { db.exec('ALTER TABLE calendar_events ADD COLUMN all_day INTEGER NOT NULL DEFAULT 0'); } catch { /* already present */ }
try { db.exec('ALTER TABLE calendar_events ADD COLUMN location TEXT'); } catch { /* already present */ }
try { db.exec('ALTER TABLE calendar_events ADD COLUMN description TEXT'); } catch { /* already present */ }
try { db.exec('ALTER TABLE calendar_events ADD COLUMN attendees TEXT'); } catch { /* already present */ }
try { db.exec('ALTER TABLE calendar_events ADD COLUMN etag TEXT'); } catch { /* already present */ }
try { db.exec('ALTER TABLE calendar_events ADD COLUMN last_synced_at TEXT'); } catch { /* already present */ }
// Unique index on external_id so our sync upsert can use ON CONFLICT.
// SQLite treats multiple NULLs as distinct in UNIQUE indexes, so existing seed rows (external_id = NULL) are not in conflict.
// Previously this was a partial index — ON CONFLICT's target matcher doesn't match partial indexes, so we swap it.
try { db.exec('DROP INDEX IF EXISTS idx_calendar_events_external_id'); } catch { /* ignore */ }
try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_external_id ON calendar_events(external_id)'); } catch { /* already present */ }

// Articles can live "inside" a Drive folder so they show up in the merged folder listing.
// Null means the article hasn't been assigned to a Drive folder — surfaces in "All articles" only.
try { db.exec('ALTER TABLE docs ADD COLUMN drive_folder_id TEXT'); } catch { /* already present */ }

// Workspace-wide singleton settings (Drive configuration etc.). Single row keyed by id=1.
db.exec(`
  CREATE TABLE IF NOT EXISTS workspace_config (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    drive_id        TEXT,
    drive_name      TEXT,
    jeff_folder_id  TEXT,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_by      TEXT
  );
`);

// Jeff's scan cap — how many Drive files the scan job will read per run. Lives on workspace_config
// so it's a single knob, easy to reason about.
try { db.exec('ALTER TABLE workspace_config ADD COLUMN jeff_scan_cap INTEGER NOT NULL DEFAULT 40'); } catch { /* already present */ }
try { db.exec("ALTER TABLE workspace_config ADD COLUMN jeff_meeting_notes_folder_path TEXT NOT NULL DEFAULT '/Users/davidkey/My Drive (dave@path2ai.tech)/Meet Recordings'"); } catch { /* already present */ }
try { db.exec("ALTER TABLE workspace_config ADD COLUMN sales_meeting_notes_destination_folder_id TEXT NOT NULL DEFAULT '1-kfQWaPFLjH2l2-QeuQMUJ71WUiPufBf'"); } catch { /* already present */ }

// Lightweight Sales CRM. Account and contact fields deliberately live on the opportunity in v1.
db.exec(`
  CREATE TABLE IF NOT EXISTS sales_opportunities (
    id                    TEXT PRIMARY KEY,
    name                  TEXT NOT NULL,
    account_name          TEXT NOT NULL,
    contact_name          TEXT NOT NULL,
    contact_title         TEXT,
    contact_location      TEXT,
    contact_photo_url     TEXT,
    contact_phone         TEXT,
    contact_email         TEXT,
    website               TEXT,
    owner_key             TEXT NOT NULL,
    stage                 TEXT NOT NULL DEFAULT 'lead',
    status                TEXT NOT NULL DEFAULT 'active',
    value_amount          REAL NOT NULL DEFAULT 0,
    currency              TEXT NOT NULL DEFAULT 'GBP',
    forecast_label        TEXT NOT NULL DEFAULT 'pipeline',
    forecast_probability  INTEGER NOT NULL DEFAULT 10,
    expected_close_date   TEXT,
    next_action           TEXT,
    next_action_date      TEXT,
    notes                 TEXT,
    sort_order            INTEGER NOT NULL DEFAULT 0,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
try { db.exec('ALTER TABLE sales_opportunities ADD COLUMN contact_title TEXT'); } catch { /* already present */ }
try { db.exec('ALTER TABLE sales_opportunities ADD COLUMN contact_location TEXT'); } catch { /* already present */ }
try { db.exec('ALTER TABLE sales_opportunities ADD COLUMN contact_photo_url TEXT'); } catch { /* already present */ }
try { db.exec('CREATE INDEX IF NOT EXISTS idx_sales_opportunities_stage ON sales_opportunities(stage)'); } catch { /* already present */ }
try { db.exec('CREATE INDEX IF NOT EXISTS idx_sales_opportunities_status ON sales_opportunities(status)'); } catch { /* already present */ }
try { db.exec('CREATE INDEX IF NOT EXISTS idx_sales_opportunities_close ON sales_opportunities(expected_close_date)'); } catch { /* already present */ }
try { db.exec('CREATE INDEX IF NOT EXISTS idx_sales_opportunities_next_action ON sales_opportunities(next_action_date)'); } catch { /* already present */ }

db.exec(`
  CREATE TABLE IF NOT EXISTS sales_activities (
    id              TEXT PRIMARY KEY,
    opportunity_id  TEXT NOT NULL REFERENCES sales_opportunities(id) ON DELETE CASCADE,
    type            TEXT NOT NULL DEFAULT 'note',
    body            TEXT NOT NULL,
    author_key      TEXT,
    activity_date   TEXT NOT NULL DEFAULT (datetime('now')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
try { db.exec('CREATE INDEX IF NOT EXISTS idx_sales_activities_opportunity ON sales_activities(opportunity_id)'); } catch { /* already present */ }

db.exec(`
  CREATE TABLE IF NOT EXISTS sales_links (
    id              TEXT PRIMARY KEY,
    opportunity_id  TEXT NOT NULL REFERENCES sales_opportunities(id) ON DELETE CASCADE,
    link_type       TEXT NOT NULL,
    link_ref        TEXT NOT NULL,
    source_ref      TEXT,
    label           TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
try { db.exec('CREATE INDEX IF NOT EXISTS idx_sales_links_opportunity ON sales_links(opportunity_id)'); } catch { /* already present */ }
try { db.exec('ALTER TABLE sales_links ADD COLUMN source_ref TEXT'); } catch { /* already present */ }
try { db.exec('CREATE INDEX IF NOT EXISTS idx_sales_links_source_ref ON sales_links(source_ref)'); } catch { /* already present */ }

try {
  db.prepare(`
    INSERT OR IGNORE INTO sales_opportunities (
      id, name, account_name, contact_name, contact_phone, contact_email, website,
      owner_key, stage, status, value_amount, currency, forecast_label, forecast_probability,
      expected_close_date, next_action, next_action_date, notes, sort_order, updated_at
    )
    VALUES
      ('CRM-014', 'Core payments rollout', 'Acme Bank', 'Maya Shah', '+44 20 7946 0142', 'maya.shah@acmebank.example', 'acmebank.example',
       'D', 'commit', 'active', 42000, 'GBP', 'commit', 85, '2026-05-28', 'Call Maya after board review', date('now'),
       'Wants commercial confirmation on settlement timeline. Raj to validate implementation cost before final quote.', 10, datetime('now')),
      ('CRM-018', 'Proposal pack', 'Northstar Payments', 'Oliver Trent', '+44 161 555 0182', 'oliver@northstar.example', 'northstar.example',
       'R', 'proposal', 'active', 78000, 'GBP', 'best_case', 65, '2026-06-12', 'Send pricing response', date('now','-1 day'),
       'CFO asked for pricing questions to be answered before legal redlines.', 20, datetime('now','-2 days')),
      ('CRM-021', 'Enterprise negotiation', 'Helio Retail Group', 'Priya Nair', null, 'priya@helio.example', 'helio.example',
       'D', 'negotiation', 'active', 54000, 'GBP', 'pipeline', 50, '2026-05-30', 'Book legal call', date('now','+3 days'),
       'No update for 17 days. Needs sponsor confirmation.', 30, datetime('now','-17 days')),
      ('CRM-024', 'Partner intro', 'Mosaic Capital', 'Elena Morris', null, 'elena@mosaic.example', null,
       'D', 'lead', 'active', 25000, 'GBP', 'pipeline', 30, '2026-07-03', 'Find sponsor', date('now','+7 days'),
       'Intro from partner. Website and phone still missing.', 40, datetime('now','-1 day')),
      ('CRM-027', 'Treasury workflow', 'Kite Treasury', 'Anika Patel', '+44 20 5555 0148', 'anika@kite.example', 'kite.example',
       'R', 'commit', 'active', 78000, 'GBP', 'commit', 95, '2026-05-24', 'Final procurement step', date('now','+1 day'),
       'Procurement confirmed. Waiting for final order reference.', 50, datetime('now')),
      ('CRM-030', 'Discovery workshop', 'UrbanPay', 'Sam Hughes', '+44 20 5555 0192', 'sam@urbanpay.example', 'urbanpay.example',
       'D', 'qualified', 'active', 33000, 'GBP', 'pipeline', 40, '2026-06-21', 'Send discovery notes', date('now','+2 days'),
       'Discovery notes linked. Next step is a technical workshop.', 60, datetime('now','-3 days'))
  `).run();
  db.prepare(`
    INSERT OR IGNORE INTO sales_activities (id, opportunity_id, type, body, author_key, activity_date)
    VALUES
      ('sa-crm014-1', 'CRM-014', 'link', 'Proposal linked: Acme Bank proposal', 'D', datetime('now','-3 days')),
      ('sa-crm014-2', 'CRM-014', 'stage', 'Stage moved to Commit. Probability moved to 85%.', 'D', datetime('now','-1 day')),
      ('sa-crm014-3', 'CRM-014', 'jeff', 'Jeff prepared meeting brief and suggested objection: integration risk.', 'J', datetime('now')),
      ('sa-crm018-1', 'CRM-018', 'note', 'CFO pricing questions are overdue.', 'R', datetime('now','-2 days')),
      ('sa-crm021-1', 'CRM-021', 'note', 'Deal is stale. Needs a legal call.', 'D', datetime('now','-17 days'))
  `).run();
  db.prepare(`
    INSERT OR IGNORE INTO sales_links (id, opportunity_id, link_type, link_ref, label)
    VALUES
      ('sl-crm014-proposal', 'CRM-014', 'doc', 's4', 'Acme Bank proposal'),
      ('sl-crm018-pricing', 'CRM-018', 'doc', 's4', 'Northstar pricing notes'),
      ('sl-crm030-notes', 'CRM-030', 'doc', 's3', 'Discovery notes')
  `).run();
} catch { /* ignore */ }

// Folders the founders have explicitly pinned for Jeff to scan. If the set is non-empty, the
// scan job walks only those folders. If empty, it falls back to walking from the shared-drive root.
// Pinning is the visible handle — users can see exactly which folders Jeff is reading.
db.exec(`
  CREATE TABLE IF NOT EXISTS jeff_pinned_folders (
    drive_folder_id TEXT PRIMARY KEY,
    folder_name     TEXT NOT NULL,
    pinned_at       TEXT NOT NULL DEFAULT (datetime('now')),
    pinned_by       TEXT
  );
`);

// Jeff's long-term memory store. Each row is a small summary of something Jeff has seen
// (an article, a Drive file, a backlog item, a weekly-summary output). Keeps the context
// footprint small when we include memories in a prompt.
db.exec(`
  CREATE TABLE IF NOT EXISTS jeff_memories (
    id           TEXT PRIMARY KEY,
    kind         TEXT NOT NULL,              -- 'article' | 'drive-file' | 'weekly-summary' | 'note'
    source_id    TEXT,                       -- doc id / drive file id / etc.
    title        TEXT NOT NULL,
    summary      TEXT NOT NULL,
    tags         TEXT,                       -- JSON array
    scope        TEXT,                       -- 'product' | 'finance' | 'sales' | 'legal' | null
    source_updated_at TEXT,                  -- when the source was last edited (so we can re-scan)
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
try { db.exec('CREATE INDEX IF NOT EXISTS idx_jeff_memories_kind ON jeff_memories(kind)'); } catch { /* already present */ }
try { db.exec('CREATE INDEX IF NOT EXISTS idx_jeff_memories_source ON jeff_memories(source_id)'); } catch { /* already present */ }
// Full unmangled article body for kinds that produce one (daily-news, weekly-summary,
// competitor-features, research-refresh). `summary` stays the short teaser used in prompts
// and Today cards; `body` is the article rendered in the modal / saved to Drive.
try { db.exec('ALTER TABLE jeff_memories ADD COLUMN body TEXT'); } catch { /* already present */ }

// Extra columns on agent_jobs for the real scheduler.
try { db.exec('ALTER TABLE agent_jobs ADD COLUMN kind TEXT'); } catch { /* already present */ }
try { db.exec('ALTER TABLE agent_jobs ADD COLUMN input TEXT'); } catch { /* already present */ }
try { db.exec('ALTER TABLE agent_jobs ADD COLUMN next_run_at TEXT'); } catch { /* already present */ }
// Per-job Claude instruction override — if set, the job runner uses this instead of the built-in default.
try { db.exec('ALTER TABLE agent_jobs ADD COLUMN prompt TEXT'); } catch { /* already present */ }

// First-boot product seed. Without at least one product the Backlog dialog can't function
// (Product is required), so a freshly-initialised prod box was unusable until the user manually
// added one in Settings. INSERT OR IGNORE means user edits / additions are preserved, and a
// product the user has deliberately removed stays removed — we only fill the blank-slate case.
try {
  db.prepare(`
    INSERT OR IGNORE INTO products (id, label, color, accent, sort_order)
    VALUES
      ('dashboard', 'Dashboard',  '#297D2D', '#49BC4E', 1),
      ('boarding',  'Boarding',   '#B42318', '#FF5252', 2),
      ('sdk',       'Path SDK',   '#6B2A8F', '#B794F4', 3),
      ('mcp',       'MCP Server', '#10298E', '#5470D6', 4),
      ('emulator',  'Emulator',   '#B54708', '#F0A000', 5),
      ('invoicing', 'Invoicing',  '#0068A3', '#6bb3ff', 6)
  `).run();
} catch { /* ignore — table may not exist on a freshly-failed migration */ }

// Seed the standard Jeff jobs if they're not already present. They're owned by the scheduler
// and can be toggled in Settings / the Jeff page.
try {
  db.prepare(`
    INSERT OR IGNORE INTO agent_jobs (id, name, schedule, enabled, description, kind)
    VALUES
      ('scan-memories',     'Scan articles',    '@hourly',    1, 'Reads new / edited articles and builds a short summary Jeff can recall later.', 'scan-memories'),
      ('scan-drive-files',  'Scan Drive files', '0 4 * * *',  0, 'Reads pinned Drive folders (Docs, Sheets, Slides, PDFs, images, text) and adds a summary to memory.', 'scan-drive-files'),
      ('weekly-summary',    'Weekly summary',   '0 7 * * 1',  1, 'Drafts the week ahead from backlog, tasks and the calendar. Saves a markdown copy to the Jeff Drive folder.', 'weekly-summary')
  `).run();
} catch { /* ignore */ }

// One-time cleanup: drop the leading time fragment ("Mondays 09:00 — ", "Nightly 04:00 — ") from
// existing job descriptions. The card now shows the cadence via the schedule humaniser, so the
// duplication was just noise. `+ 2` skips the em-dash (1 char in SQLite's INSTR) + the trailing space.
try {
  db.prepare(`
    UPDATE agent_jobs
    SET description = TRIM(SUBSTR(description, INSTR(description, '— ') + 2))
    WHERE description GLOB '*[0-9][0-9]:[0-9][0-9] — *'
  `).run();
} catch { /* ignore */ }

// Damage control: an earlier version of this migration sliced one character too many, turning
// "fetches" into "etches" and similar. Reset the standard job descriptions to their intended
// clean shape. We only overwrite the rows whose descriptions still look like a corrupted stub.
try {
  db.prepare(`
    UPDATE agent_jobs SET description = 'Reads new / edited articles and builds a short summary Jeff can recall later.'
    WHERE id = 'scan-memories' AND (description LIKE 'eads %' OR description LIKE 'Mondays %')
  `).run();
  db.prepare(`
    UPDATE agent_jobs SET description = 'Reads pinned Drive folders (Docs, Sheets, Slides, PDFs, images, text) and adds a summary to memory.'
    WHERE id = 'scan-drive-files' AND (description LIKE 'eads %' OR description LIKE 'Nightly %')
  `).run();
  db.prepare(`
    UPDATE agent_jobs SET description = 'Drafts the week ahead from backlog, tasks and the calendar. Saves a markdown copy to the Jeff Drive folder.'
    WHERE id = 'weekly-summary' AND (description LIKE 'rafts %' OR description LIKE 'Monday %')
  `).run();
  db.prepare(`
    UPDATE agent_jobs SET description = 'Scans the web for news relevant to Path and the watched competitors, then posts a digest to the Week view.'
    WHERE id = 'daily-news' AND (description LIKE 'cans %' OR description LIKE 'Weekdays %')
  `).run();
  db.prepare(`
    UPDATE agent_jobs SET description = 'Fetches each competitor''s product pages and tracks what''s changed, saving new features as memory rows Jeff can reference.'
    WHERE id = 'competitor-features' AND (description LIKE 'etches %' OR description LIKE 'Mondays %')
  `).run();
  db.prepare(`
    UPDATE agent_jobs SET description = 'Pulls the latest PDFs / decks from the competitors'' press pages into the Research folder in Drive.'
    WHERE id = 'research-refresh' AND (description LIKE 'ulls %' OR description LIKE 'Mondays %')
  `).run();
} catch { /* ignore */ }

// One-time cleanup: remove legacy mock jobs (j1/j2/j3) that had no `kind` wired up.
try { db.prepare("DELETE FROM agent_jobs WHERE id IN ('j1', 'j2', 'j3') AND kind IS NULL").run(); } catch { /* ignore */ }

// Jeff's style sheet — a single workspace-wide JSON blob describing tone, brand colours,
// preferred vocabulary and PPT template. Used by the system prompt and by outputs (PPT / PDF).
db.exec(`
  CREATE TABLE IF NOT EXISTS jeff_style_sheet (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    data        TEXT NOT NULL,            -- JSON
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_by  TEXT
  );
`);
// Seed the default style sheet so chat prompts always have something to lean on.
// Shape is intentionally broad — the full Path brand palette, type scale, logo references,
// and per-output-format style guides that Jeff applies when producing files.
const DEFAULT_STYLE_SHEET = {
  voice: {
    tone: 'Concise, warm, direct. No waffle. Talk to the founders like a trusted operator.',
    avoid: ['corporate-speak', 'hedging language', 'emoji', 'overly long preambles'],
    prefer: ['plain English', 'specifics with numbers', 'direct recommendations', 'call out uncertainty'],
  },
  brand: {
    name: 'Path',
    tagline: 'Commerce for platforms',
    colorPrimary:          '#297D2D',
    colorPrimaryLight1:    '#3B9F40',
    colorPrimaryLight2:    '#49BC4E',
    colorSecondary:        '#FF5252',
    colorSecondaryLight1:  '#FF8A80',
    colorSecondaryLight2:  '#FFA49C',
    colorNeutralDark:      '#0F171A',
    colorNeutralLight:     '#F6F7F8',
    fontPrimary:           'Poppins',
    fontSecondary:         'Roboto',
    typeScale: { h0: 72, h1: 48, h2: 32, h3: 24, h4: 18, p1: 16, p2: 14 },
    logoLight: null,  // Drive file reference once uploaded: { fileId, name, mimeType }
    logoDark:  null,
  },
  outputs: {
    weeklySummary:   'Three sections max — Focus this week, Watch list, Decisions needed. Markdown. No preamble.',
    dailyNews:       '5–8 bullets. Title, one-line takeaway, source domain. Order by relevance to Path.',
    competitorBrief: 'Name · positioning in one sentence · three feature highlights · one threat to us · one opportunity we could take.',
    presentation:    'Five to seven slides. Title slide with subject + date. Each content slide: one H1 heading + 3–5 bullets, no walls of text. Use Path primary green for accents. Close with an "Our angle" slide — one sentence on how Path responds.',
    researchPdf:     'Cover page with title + date + Path logo. Executive summary (3 bullets). Findings grouped by theme. Each theme: heading + short paragraph + 2–4 supporting bullets. Sources listed at the end.',
    spreadsheet:     'First sheet is the headline comparison. Column A is the row label, columns B onward are each competitor or option. Freeze the first row and column. No colour coding unless you are flagging a concern (use secondary red).',
  },
};
try {
  db.prepare(`
    INSERT OR IGNORE INTO jeff_style_sheet (id, data, updated_by)
    VALUES (1, @data, 'system')
  `).run({ data: JSON.stringify(DEFAULT_STYLE_SHEET) });
} catch { /* ignore */ }
// One-time migration: the first seed used placeholder Inter + #29A03B. If the row still holds
// the old placeholder shape, replace it with the proper Path brand defaults above. Rows that
// have been edited by hand are left untouched.
try {
  const existing = db.prepare('SELECT data FROM jeff_style_sheet WHERE id = 1').get() as { data: string } | undefined;
  if (existing) {
    const parsed = JSON.parse(existing.data);
    const isOldPlaceholder =
      parsed?.brand?.primaryColor === '#29A03B' &&
      parsed?.brand?.fontPrimary === 'Inter';
    if (isOldPlaceholder) {
      db.prepare(`
        UPDATE jeff_style_sheet
        SET data = @data, updated_at = datetime('now'), updated_by = 'migration'
        WHERE id = 1
      `).run({ data: JSON.stringify(DEFAULT_STYLE_SHEET) });
    }
  }
} catch { /* ignore */ }

// Competitors Jeff watches. Managed in Settings. Each row drives news / research / feature tracking.
db.exec(`
  CREATE TABLE IF NOT EXISTS jeff_competitors (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    homepage       TEXT,
    press_page_url TEXT,                    -- where Jeff looks for the latest releases / PDFs
    notes          TEXT,
    focus_areas    TEXT,                    -- JSON array of short tags e.g. ["kyc","boarding"]
    region         TEXT,                    -- short region code: 'uk', 'de', 'fr', 'es-pt', 'it', 'benelux', 'global'
    enabled        INTEGER NOT NULL DEFAULT 1,
    sort_order     INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
// Back-fill columns on older DBs that were created before these fields existed.
try { db.exec('ALTER TABLE jeff_competitors ADD COLUMN press_page_url TEXT'); } catch { /* already present */ }
try { db.exec('ALTER TABLE jeff_competitors ADD COLUMN region TEXT'); } catch { /* already present */ }

// Starter pack — covers UK/Eire, DE, FR, ES/PT, IT, Benelux + the globals (Stripe, Adyen, Mollie, Worldline).
// INSERT OR IGNORE means re-running never overwrites user edits.
try {
  const starter = [
    // Global / Benelux
    { id: 'stripe',      name: 'Stripe Connect',        homepage: 'https://stripe.com/connect',            press: 'https://stripe.com/newsroom',                 focus: ['platform-payments','boarding','kyc'], region: 'global',  sort: 10 },
    { id: 'adyen',       name: 'Adyen for Platforms',   homepage: 'https://www.adyen.com/platforms',        press: 'https://www.adyen.com/press',                 focus: ['platform-payments','psp','unified-commerce'], region: 'benelux', sort: 20 },
    { id: 'mollie',      name: 'Mollie',                homepage: 'https://www.mollie.com',                 press: 'https://www.mollie.com/news',                 focus: ['psp','smb','e-commerce'], region: 'benelux', sort: 30 },
    // UK / Eire
    { id: 'checkoutcom', name: 'Checkout.com',          homepage: 'https://www.checkout.com',               press: 'https://www.checkout.com/newsroom',           focus: ['psp','enterprise'], region: 'uk', sort: 40 },
    { id: 'gocardless',  name: 'GoCardless',            homepage: 'https://gocardless.com',                 press: 'https://gocardless.com/press',                focus: ['direct-debit','recurring','open-banking'], region: 'uk', sort: 50 },
    { id: 'modulr',      name: 'Modulr',                homepage: 'https://www.modulrfinance.com',          press: 'https://www.modulrfinance.com/news',          focus: ['baas','e-money','faster-payments'], region: 'uk', sort: 60 },
    { id: 'truelayer',   name: 'TrueLayer',             homepage: 'https://truelayer.com',                  press: 'https://truelayer.com/about/newsroom',        focus: ['open-banking','payments','vrp'], region: 'uk', sort: 70 },
    // Germany
    { id: 'unzer',       name: 'Unzer',                 homepage: 'https://www.unzer.com',                  press: 'https://www.unzer.com/en/newsroom',           focus: ['psp','smb','retail'], region: 'de', sort: 80 },
    { id: 'solaris',     name: 'Solaris',               homepage: 'https://www.solarisgroup.com',            press: 'https://www.solarisgroup.com/en/newsroom',    focus: ['baas','banking','card-issuing'], region: 'de', sort: 90 },
    // France
    { id: 'worldline',   name: 'Worldline',             homepage: 'https://worldline.com',                   press: 'https://worldline.com/en/home/media.html',    focus: ['psp','acquiring','enterprise'], region: 'fr', sort: 100 },
    { id: 'lemonway',    name: 'Lemonway',              homepage: 'https://www.lemonway.com',                press: 'https://www.lemonway.com/en/newsroom',        focus: ['marketplace-payments','e-money','kyc'], region: 'fr', sort: 110 },
    { id: 'mangopay',    name: 'MangoPay',              homepage: 'https://mangopay.com',                    press: 'https://mangopay.com/press-room',             focus: ['marketplace-payments','wallets'], region: 'fr', sort: 120 },
    // Italy
    { id: 'nexi',        name: 'Nexi',                  homepage: 'https://www.nexigroup.com',               press: 'https://www.nexigroup.com/en/media-centre',   focus: ['psp','acquiring','enterprise'], region: 'it', sort: 130 },
    // Spain / Portugal
    { id: 'redsys',      name: 'Redsys',                homepage: 'https://www.redsys.es',                   press: 'https://www.redsys.es/actualidad',            focus: ['acquiring','interbank','card-schemes'], region: 'es-pt', sort: 140 },
    { id: 'sibs',        name: 'SIBS',                  homepage: 'https://www.sibs.com',                    press: 'https://www.sibs.com/en/press',               focus: ['interbank','mbway','card-schemes'], region: 'es-pt', sort: 150 },
  ];
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO jeff_competitors (id, name, homepage, press_page_url, focus_areas, region, enabled, sort_order)
    VALUES (@id, @name, @homepage, @press, @focus, @region, 1, @sort)
  `);
  const tx = db.transaction((rows: typeof starter) => { for (const r of rows) stmt.run({ ...r, focus: JSON.stringify(r.focus) }); });
  tx(starter);
} catch (err) {
  // Non-fatal — seeding is best-effort. Log and move on.
  console.warn('[jeff] competitor starter seed skipped:', (err as Error).message);
}

// Tracked features per competitor — output of the competitor-features job, and also editable in Settings.
db.exec(`
  CREATE TABLE IF NOT EXISTS jeff_tracked_features (
    id              TEXT PRIMARY KEY,
    competitor_id   TEXT NOT NULL REFERENCES jeff_competitors(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    summary         TEXT NOT NULL,
    source_url      TEXT,
    discovered_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
try { db.exec('CREATE INDEX IF NOT EXISTS idx_tracked_features_competitor ON jeff_tracked_features(competitor_id)'); } catch { /* ignore */ }

// Extra scheduled jobs for Jeff's new toolkit. All start disabled — user flips them on after
// reviewing the system prompt / style sheet / competitor list.
try {
  db.prepare(`
    INSERT OR IGNORE INTO agent_jobs (id, name, schedule, enabled, description, kind)
    VALUES
      ('daily-news',          'Daily news scan',          '30 7 * * 1-5', 0,
         'Scans the web for news relevant to Path and the watched competitors, then posts a digest to the Week view.', 'daily-news'),
      ('competitor-features', 'Competitor feature watch', '0 9 * * 1',    0,
         'Fetches each competitor''s product pages and tracks what''s changed, saving new features as memory rows Jeff can reference.', 'competitor-features'),
      ('research-refresh',    'Research materials refresh','0 6 * * 1',   0,
         'Pulls the latest PDFs / decks from the competitors'' press pages into the Research folder in Drive.', 'research-refresh')
  `).run();
} catch { /* ignore */ }

// Sub-folders removed — drop the table and its column if they exist from older schemas.
try { db.exec('DROP INDEX IF EXISTS idx_subfolders_product'); } catch { /* ignore */ }
try { db.exec('DROP TABLE IF EXISTS subfolders'); } catch { /* ignore */ }
try { db.exec('ALTER TABLE backlog_items DROP COLUMN subfolder_id'); } catch { /* already dropped */ }

// One-time migration: fold legacy link_type/link_ref into the attachments JSON column
// for any rows that still carry a link but no attachments payload.
try {
  db.exec(`
    UPDATE backlog_items
    SET attachments = json_array(json_object('type', link_type, 'ref', link_ref))
    WHERE link_type IS NOT NULL
      AND link_ref IS NOT NULL
      AND (attachments IS NULL OR attachments = '')
  `);
} catch { /* link columns may not exist on a brand-new DB */ }

export type DB = typeof db;
