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
  { id: 'PTH-204', title: 'Clean up / sharpen built screens', product: 'dashboard', stage: 'now', owner: 'D', note: 'Some of the screens are getting messy — wrong layouts', age: '3d' },
  { id: 'PTH-207', title: 'Version 3 Emulator with battery and over the air management', product: 'emulator', stage: 'now', owner: 'D', age: '5d' },
  { id: 'PTH-211', title: 'Pricing groups — merchant assignment flow', product: 'dashboard', stage: 'now', owner: 'R', age: '2d', due: '22 Apr 2026' },
  { id: 'PTH-182', title: 'Amend function', product: 'boarding', stage: 'now', owner: 'D', flag: 'due-soon', due: '20 Apr 2026', age: '10d' },
  { id: 'PTH-175', title: 'API Readability improvement.', product: 'sdk', stage: 'now', owner: 'D', flag: 'overdue', due: '30 Mar 2026', age: '5d' },
  { id: 'PTH-189', title: 'Boarding flow: email verify retry', product: 'boarding', stage: 'next', owner: 'R', age: '4d' },
  { id: 'PTH-212', title: 'SDK: TypeScript type exports', product: 'sdk', stage: 'next', owner: 'D', age: '2d' },
  { id: 'PTH-221', title: 'MCP server: token refresh bug', product: 'mcp', stage: 'next', owner: 'D', age: '6h' },
  { id: 'PTH-230', title: 'Dashboard: drill-down filters', product: 'dashboard', stage: 'next', owner: 'D', age: '1w' },
  { id: 'PTH-231', title: 'Boarding: KYC gate copy pass', product: 'boarding', stage: 'next', owner: 'R', age: '5d' },
  { id: 'PTH-240', title: 'Emulator: sandbox reset button', product: 'emulator', stage: 'next', owner: 'D', age: '3d' },
  { id: 'PTH-241', title: 'Invoicing: PDF styling', product: 'invoicing', stage: 'next', owner: 'R', age: '2d' },
  { id: 'PTH-260', title: 'Dashboard v2: layout system', product: 'dashboard', stage: 'later', owner: 'D' },
  { id: 'PTH-261', title: 'Boarding: partner co-brand theming', product: 'boarding', stage: 'later', owner: 'R' },
  { id: 'PTH-270', title: 'MCP: public registry listing', product: 'mcp', stage: 'later', owner: 'D' },
  { id: 'PTH-271', title: 'Emulator: record+replay mode', product: 'emulator', stage: 'later', owner: 'D' },
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

const JOBS = [
  { id: 'j1', name: 'Weekly summary',         schedule: 'Mon 07:00',                    enabled: 1, description: 'Drafts a summary across all modules and files it to Workspace / Weekly summaries.' },
  { id: 'j2', name: 'Calendar clash resolver', schedule: 'Every 2h · 09:00–18:00',      enabled: 1, description: "Reads both founders' calendars, proposes reschedules. Never writes without approval." },
  { id: 'j3', name: 'Doc sync',               schedule: 'On backlog change',            enabled: 1, description: 'When a backlog item changes stage or description, drafts edits to linked docs/decks.' },
];

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
  INSERT INTO backlog_items (id, title, note, product_id, stage, owner_key, due_date, flag, age, sort_order)
  VALUES (@id, @title, @note, @product, @stage, @owner, @due, @flag, @age, @sort_order)
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    note = excluded.note,
    product_id = excluded.product_id,
    stage = excluded.stage,
    owner_key = excluded.owner_key,
    due_date = excluded.due_date,
    flag = excluded.flag,
    age = excluded.age,
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
      flag: (b as any).flag ?? null,
      age: b.age ?? null,
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
});

run();
console.log(`✓ Seed complete (users / products / backlog / tasks / events / jobs / access). Default password: "${seedPassword}"`);
