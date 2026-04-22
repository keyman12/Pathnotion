import 'dotenv/config';
import bcrypt from 'bcrypt';
import { db } from './client.js';

const FOUNDERS = [
  { key: 'D', username: 'dave', display: 'Dave', email: process.env.FOUNDER_D_EMAIL ?? 'dave@example.com', role: 'admin',  color: '#297D2D' },
  { key: 'R', username: 'raj',  display: 'Raj',  email: process.env.FOUNDER_R_EMAIL ?? 'raj@example.com',  role: 'member', color: '#FF5252' },
];

const PRODUCTS = [
  { id: 'dashboard', label: 'Dashboard', color: '#297D2D', accent: '#49BC4E', sort_order: 1 },
  { id: 'boarding',  label: 'Boarding',  color: '#B42318', accent: '#FF5252', sort_order: 2 },
  { id: 'sdk',       label: 'Path SDK',  color: '#6B2A8F', accent: '#B794F4', sort_order: 3 },
  { id: 'mcp',       label: 'MCP Server',color: '#10298E', accent: '#5470D6', sort_order: 4 },
  { id: 'emulator',  label: 'Emulator',  color: '#B54708', accent: '#F0A000', sort_order: 5 },
  { id: 'invoicing', label: 'Invoicing', color: '#0068A3', accent: '#6bb3ff', sort_order: 6 },
];

const BACKLOG = [
  { id: 'PTH-204', title: 'Clean up / sharpen built screens',                 product: 'dashboard', stage: 'now',   owner: 'D', note: 'Some of the screens are getting messy — wrong layouts', effortDays: 3 },
  { id: 'PTH-207', title: 'Version 3 Emulator with battery and OTA',          product: 'emulator',  stage: 'now',   owner: 'D', effortDays: 8 },
  { id: 'PTH-211', title: 'Pricing groups — merchant assignment flow',        product: 'dashboard', stage: 'now',   owner: 'R', due: '2026-04-22', effortDays: 5 },
  { id: 'PTH-182', title: 'Amend function',                                   product: 'boarding',  stage: 'now',   owner: 'D', due: '2026-04-20', effortDays: 2 },
  { id: 'PTH-175', title: 'API readability improvement.',                     product: 'sdk',       stage: 'now',   owner: 'D', due: '2026-03-30', effortDays: 1 },
  { id: 'PTH-189', title: 'Boarding flow: email verify retry',                product: 'boarding',  stage: 'next',  owner: 'R', effortDays: 1 },
  { id: 'PTH-212', title: 'SDK: TypeScript type exports',                     product: 'sdk',       stage: 'next',  owner: 'D', effortDays: 2 },
  { id: 'PTH-221', title: 'MCP server: token refresh bug',                    product: 'mcp',       stage: 'next',  owner: 'D', effortDays: 0.5 },
  { id: 'PTH-230', title: 'Dashboard: drill-down filters',                    product: 'dashboard', stage: 'next',  owner: 'D', effortDays: 4 },
  { id: 'PTH-231', title: 'Boarding: KYC gate copy pass',                     product: 'boarding',  stage: 'next',  owner: 'R', effortDays: 0.5 },
  { id: 'PTH-240', title: 'Emulator: sandbox reset button',                   product: 'emulator',  stage: 'next',  owner: 'D', effortDays: 1 },
  { id: 'PTH-241', title: 'Invoicing: PDF styling',                           product: 'invoicing', stage: 'next',  owner: 'R', effortDays: 1.5 },
  { id: 'PTH-260', title: 'Dashboard v2: layout system',                      product: 'dashboard', stage: 'later', owner: 'D' },
  { id: 'PTH-261', title: 'Boarding: partner co-brand theming',               product: 'boarding',  stage: 'later', owner: 'R' },
  { id: 'PTH-270', title: 'MCP: public registry listing',                     product: 'mcp',       stage: 'later', owner: 'D' },
  { id: 'PTH-271', title: 'Emulator: record+replay mode',                     product: 'emulator',  stage: 'later', owner: 'D' },
];

const TASKS = [
  { title: 'Send MoU draft to Lloyds partner team', owner: 'R', due: 'today',    link_type: 'doc',     link_ref: 'Bank partner term sheet' },
  { title: 'Reply to Notable re. data room access',  owner: 'R', due: 'today',    link_type: null,      link_ref: null },
  { title: 'Push SDK v1.4 release notes',            owner: 'D', due: 'tomorrow', link_type: 'backlog', link_ref: 'PTH-175' },
  { title: 'Review case mgmt phase 2 scope',         owner: 'D', due: 'Fri',      link_type: 'backlog', link_ref: 'PTH-151' },
  { title: 'Collect April expense receipts',         owner: 'R', due: 'Fri',      link_type: null,      link_ref: null },
  { title: 'Update pricing deck for bank pitch',     owner: 'R', due: 'Mon',      link_type: 'doc',     link_ref: 'Pricing playbook' },
];

const EVENTS = [
  { title: 'Morning standup',             day: 0, start: 9,    end: 9.5,  who: 'SHARED', kind: 'shared' },
  { title: 'Bank partner intro — Lloyds', day: 0, start: 11,   end: 12,   who: 'R',      kind: 'meet' },
  { title: 'Backlog triage',              day: 0, start: 14,   end: 15.5, who: 'SHARED', kind: 'shared' },
  { title: 'Morning standup',             day: 1, start: 9,    end: 9.5,  who: 'SHARED', kind: 'shared' },
  { title: 'SDK review',                  day: 1, start: 10,   end: 11,   who: 'D',      kind: 'deep' },
  { title: 'Series A model v3',           day: 1, start: 15,   end: 16.5, who: 'R',      kind: 'deep' },
  { title: 'Morning standup',             day: 2, start: 9,    end: 9.5,  who: 'SHARED', kind: 'shared' },
  { title: 'Investor — Notable',          day: 2, start: 10,   end: 11.5, who: 'SHARED', kind: 'shared', flag: 'clash' },
  { title: 'Ops review',                  day: 2, start: 10.5, end: 11,   who: 'R',      kind: 'meet',   flag: 'clash' },
  { title: 'Founder sync',                day: 3, start: 9,    end: 10,   who: 'SHARED', kind: 'shared' },
  { title: 'Terminal firmware lab',       day: 3, start: 13,   end: 14.5, who: 'D',      kind: 'deep' },
  { title: 'Morning standup',             day: 4, start: 9,    end: 9.5,  who: 'SHARED', kind: 'shared' },
  { title: 'CFO — bank call',             day: 4, start: 14,   end: 15,   who: 'R',      kind: 'meet' },
];

// Agent jobs now live in the migration in client.ts (scan-memories + weekly-summary).
// Legacy seed rows (j1/j2/j3) had no `kind` wired up, so the scheduler skipped them anyway.
const JOBS: Array<{ id: string; name: string; schedule: string; enabled: number; description: string }> = [];

const ACCESS = [
  { module: 'calendar', read: 1, write: 0 },
  { module: 'docs',     read: 1, write: 1 },
  { module: 'backlog',  read: 1, write: 1 },
  { module: 'tasks',    read: 1, write: 1 },
];

const BUSINESS_CATEGORIES = [
  { id: 'finance', label: 'Finance', icon: 'money',    sort_order: 1 },
  { id: 'sales',   label: 'Sales',   icon: 'trend-up', sort_order: 2 },
  { id: 'legal',   label: 'Legal',   icon: 'scale',    sort_order: 3 },
];

type SeedBlock =
  | { type: 'h1' | 'h2' | 'h3' | 'p' | 'quote'; text: string }
  | { type: 'ul' | 'ol'; items: string[] }
  | { type: 'code'; text: string; lang?: string }
  | { type: 'divider' }
  | { type: 'callout'; tone: 'info' | 'warn'; text: string };

interface SeedDoc {
  id: string;
  title: string;
  root: 'product' | 'finance' | 'sales' | 'legal';
  product_id?: string;
  group_name?: string;
  size_label: string;
  tags: string[];
  by: string;
  blocks?: SeedBlock[];
}

const DEFAULT_STUB_BLOCKS: SeedBlock[] = [
  { type: 'p', text: 'This doc is a stub — start typing to give it shape.' },
];

const DOCS: SeedDoc[] = [
  // Product docs
  { id: 'd1', title: 'Boarding — the Wizard, end-to-end', root: 'product', product_id: 'boarding',  size_label: '22 min', tags: ['spec'], by: 'D', blocks: [
    { type: 'h1', text: 'Boarding — the Wizard, end-to-end' },
    { type: 'p', text: 'This is the primary merchant onboarding flow. It covers account creation, KYC collection, bank linking, and plan selection.' },
    { type: 'callout', tone: 'info', text: 'Every step writes a checkpoint — users can resume where they left off on any device.' },
    { type: 'h2', text: 'Steps' },
    { type: 'ol', items: ['Create account', 'Business details', 'KYC', 'Bank link', 'Plan select', 'Review and submit'] },
    { type: 'h2', text: 'Edge cases' },
    { type: 'ul', items: ['Soft-declined KYC → retry once with additional docs', 'Partial applications aged 30 days → nudge email', 'Sanctioned country → hard stop with support link'] },
  ]},
  { id: 'd2', title: 'MCP — tool surface + scopes',          root: 'product', product_id: 'mcp',       size_label: '14 min', tags: ['rfc'], by: 'D' },
  { id: 'd3', title: 'V3 firmware OTA design',               root: 'product', product_id: 'emulator',  size_label: '9 min',  tags: ['spec'], by: 'D' },
  { id: 'd4', title: 'Dashboard — information architecture', root: 'product', product_id: 'dashboard', size_label: '12 min', tags: ['spec', 'IA'], by: 'D', blocks: [
    { type: 'h1', text: 'Dashboard — information architecture' },
    { type: 'p', text: 'The dashboard is the anchor surface. Each widget maps to a backlog item, a metric stream, or an embedded report. This doc tracks the chosen IA and the reasoning behind it.' },
    { type: 'callout', tone: 'info', text: 'Changes here should update the "Pulse" tile copy on the Week view.' },
    { type: 'h2', text: 'Top-level zones' },
    { type: 'ul', items: ['Pulse — realtime health strip', 'Focus — active "Now" items', 'Metrics — KPI grid', 'Reports — drillable tables'] },
    { type: 'h2', text: 'Navigation model' },
    { type: 'p', text: 'Sidebar is product-led. A product card drills into its own Now / Next / Later.' },
    { type: 'divider' },
    { type: 'h3', text: 'Open questions' },
    { type: 'ol', items: ['Do we surface both founders in the Pulse strip?', "Where does Jeff's proposal surface live — inline or in a tray?"] },
  ]},
  { id: 'd5', title: 'Dashboard v2 north-star',              root: 'product', product_id: 'dashboard', size_label: '4 min',  tags: ['vision'], by: 'D' },
  { id: 'd6', title: 'Partner co-brand guidelines',          root: 'product', product_id: 'boarding',  size_label: '6 min',  tags: ['brand'], by: 'R' },

  // Finance docs
  { id: 'f1', title: 'Series A operating model — v3', root: 'finance', group_name: 'Models',    size_label: 'sheet', tags: ['model', 'Series A'], by: 'R' },
  { id: 'f2', title: 'Monthly burn tracker',          root: 'finance', group_name: 'Models',    size_label: 'sheet', tags: ['ops'], by: 'R' },
  { id: 'f3', title: 'FY26 forecast assumptions',     root: 'finance', group_name: 'Forecasts', size_label: '7 min', tags: ['forecast'], by: 'R' },
  { id: 'f4', title: 'Bank partner term sheet',       root: 'finance', group_name: 'Legal',     size_label: '11 min', tags: ['term-sheet'], by: 'R', blocks: [
    { type: 'h1', text: 'Bank partner term sheet' },
    { type: 'p', text: 'Draft terms with Lloyds partner team. Not yet counter-signed. Comments open.' },
    { type: 'callout', tone: 'warn', text: 'Do not circulate outside the two founders and legal.' },
    { type: 'h2', text: 'Commercials' },
    { type: 'ul', items: ['Revenue share — their ask 30%, our counter 18%', 'Minimum volume — their ask £50M/yr, our counter £20M/yr', 'Exclusivity — their ask UK SME, our counter none in year 1'] },
    { type: 'h2', text: 'Exit clauses' },
    { type: 'ul', items: ['Either party 90-day notice', 'Data portability obligation'] },
  ]},
  { id: 'f5', title: 'Employment agreements — master', root: 'finance', group_name: 'Contracts', size_label: '14 min', tags: ['template'], by: 'R' },
  { id: 'f6', title: 'April board deck',              root: 'finance', group_name: 'Board',     size_label: 'deck',  tags: ['board'], by: 'R' },

  // Sales docs
  { id: 's1', title: 'Q2 pipeline — target accounts', root: 'sales', group_name: 'Pipeline',  size_label: '8 min',  tags: ['pipeline'], by: 'D' },
  { id: 's2', title: 'Lloyds — account notes',        root: 'sales', group_name: 'Accounts',  size_label: '5 min',  tags: ['bank'], by: 'R' },
  { id: 's3', title: 'Demo playbook v2',              root: 'sales', group_name: 'Playbooks', size_label: '10 min', tags: ['playbook'], by: 'D' },
  { id: 's4', title: 'Tiered pricing — rationale',    root: 'sales', group_name: 'Pricing',   size_label: 'sheet',  tags: ['pricing'], by: 'R' },

  // Legal docs
  { id: 'l1', title: 'Shareholder register',           root: 'legal', group_name: 'Corporate',  size_label: 'sheet', tags: ['corporate'], by: 'R' },
  { id: 'l2', title: 'FCA — application checklist',    root: 'legal', group_name: 'Compliance', size_label: '6 min', tags: ['FCA'], by: 'R' },
  { id: 'l3', title: 'NDA — master template',          root: 'legal', group_name: 'Contracts',  size_label: '3 min', tags: ['template'], by: 'R' },
  { id: 'l4', title: 'Trademarks — filings log',       root: 'legal', group_name: 'IP',         size_label: 'sheet', tags: ['IP'], by: 'R' },
];

const upsertDoc = db.prepare(`
  INSERT INTO docs (id, title, root, product_id, group_name, size_label, tags, created_by, updated_by, updated)
  VALUES (@id, @title, @root, @product_id, @group_name, @size_label, @tags, @by, @by, 'today')
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    root = excluded.root,
    product_id = excluded.product_id,
    group_name = excluded.group_name,
    size_label = excluded.size_label,
    tags = excluded.tags,
    updated_by = excluded.updated_by
`);
const deleteBlocks = db.prepare('DELETE FROM doc_blocks WHERE doc_id = ?');
const insertBlock = db.prepare('INSERT INTO doc_blocks (doc_id, sort_order, type, data) VALUES (?, ?, ?, ?)');
const countBlocks = db.prepare('SELECT COUNT(*) AS n FROM doc_blocks WHERE doc_id = ?');

const seedPassword = process.env.SEED_PASSWORD ?? 'pathnotion';

const upsertUser = db.prepare(`
  INSERT INTO users (key, username, display_name, email, password_hash, role, color)
  VALUES (@key, @username, @display, @email, @hash, @role, @color)
  ON CONFLICT(key) DO UPDATE SET
    display_name = excluded.display_name,
    email = excluded.email,
    role = excluded.role,
    color = excluded.color
`);

const upsertProduct = db.prepare(`
  INSERT INTO products (id, label, color, accent, sort_order)
  VALUES (@id, @label, @color, @accent, @sort_order)
  ON CONFLICT(id) DO UPDATE SET
    label = excluded.label,
    color = excluded.color,
    accent = excluded.accent,
    sort_order = excluded.sort_order
`);

const upsertBacklog = db.prepare(`
  INSERT INTO backlog_items (id, title, note, product_id, stage, owner_key, due_date, flag, age, effort_days, sort_order)
  VALUES (@id, @title, @note, @product, @stage, @owner, @due, @flag, @age, @effortDays, @sort_order)
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    note = excluded.note,
    product_id = excluded.product_id,
    stage = excluded.stage,
    owner_key = excluded.owner_key,
    due_date = excluded.due_date,
    flag = excluded.flag,
    age = excluded.age,
    effort_days = excluded.effort_days,
    sort_order = excluded.sort_order
`);

const insertTask = db.prepare(`
  INSERT INTO tasks (title, owner_key, due, done, link_type, link_ref, sort_order)
  VALUES (@title, @owner, @due, 0, @link_type, @link_ref, @sort_order)
`);

const insertEvent = db.prepare(`
  INSERT INTO calendar_events (title, day_of_week, start_hour, end_hour, who, kind, flag, source)
  VALUES (@title, @day, @start, @end, @who, @kind, @flag, 'local')
`);

const upsertJob = db.prepare(`
  INSERT INTO agent_jobs (id, name, schedule, enabled, description)
  VALUES (@id, @name, @schedule, @enabled, @description)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    schedule = excluded.schedule,
    enabled = excluded.enabled,
    description = excluded.description
`);

const upsertAccess = db.prepare(`
  INSERT INTO access_grants (module, can_read, can_write)
  VALUES (@module, @read, @write)
  ON CONFLICT(module) DO UPDATE SET
    can_read = excluded.can_read,
    can_write = excluded.can_write
`);

const upsertCategory = db.prepare(`
  INSERT INTO business_categories (id, label, icon, sort_order)
  VALUES (@id, @label, @icon, @sort_order)
  ON CONFLICT(id) DO UPDATE SET
    label = excluded.label,
    icon = excluded.icon,
    sort_order = excluded.sort_order
`);

const run = db.transaction(() => {
  const hash = bcrypt.hashSync(seedPassword, 10);
  for (const u of FOUNDERS) upsertUser.run({ ...u, hash });

  for (const p of PRODUCTS) upsertProduct.run(p);

  for (const [i, b] of BACKLOG.entries()) {
    upsertBacklog.run({
      id: b.id,
      title: b.title,
      note: (b as any).note ?? null,
      product: b.product,
      stage: b.stage,
      owner: b.owner,
      due: b.due ?? null,
      flag: null,
      age: null,
      effortDays: (b as any).effortDays ?? null,
      sort_order: i,
    });
  }

  // Clear tasks/events (they're append-only with auto IDs, so reseeding otherwise duplicates)
  db.exec('DELETE FROM tasks; DELETE FROM calendar_events;');
  for (const [i, t] of TASKS.entries()) insertTask.run({ ...t, sort_order: i });
  for (const e of EVENTS) insertEvent.run({ ...e, flag: (e as any).flag ?? null });

  for (const j of JOBS) upsertJob.run(j);
  for (const a of ACCESS) upsertAccess.run(a);
  for (const c of BUSINESS_CATEGORIES) upsertCategory.run(c);

  for (const d of DOCS) {
    upsertDoc.run({
      id: d.id,
      title: d.title,
      root: d.root,
      product_id: d.product_id ?? null,
      group_name: d.group_name ?? null,
      size_label: d.size_label,
      tags: JSON.stringify(d.tags),
      by: d.by,
    });
    // Only seed blocks if this doc has no stored blocks yet — don't stomp on user edits.
    const existing = (countBlocks.get(d.id) as { n: number }).n;
    if (existing === 0) {
      deleteBlocks.run(d.id);
      const blocks = d.blocks ?? DEFAULT_STUB_BLOCKS;
      for (const [i, b] of blocks.entries()) {
        insertBlock.run(d.id, i, b.type, JSON.stringify(b));
      }
    }
  }
});

run();
console.log(`✓ Seed complete (users / products / backlog / tasks / events / jobs / access). Default password: "${seedPassword}"`);
