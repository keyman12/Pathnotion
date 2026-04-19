import 'dotenv/config';
import { db, schema } from './client.js';

const FOUNDERS = [
  { key: 'D', name: 'Dave', email: process.env.FOUNDER_D_EMAIL ?? 'dave@example.com', role: 'CEO', color: '#35d37a' },
  { key: 'R', name: 'Raj', email: process.env.FOUNDER_R_EMAIL ?? 'raj@example.com', role: 'CFO', color: '#6bb3ff' },
];

const PRODUCTS = [
  { id: 'dashboard', label: 'Dashboard', color: '#35d37a', accent: '#49BC4E', sortOrder: 1 },
  { id: 'boarding', label: 'Boarding', color: '#FF5252', accent: '#FF8A80', sortOrder: 2 },
  { id: 'sdk', label: 'SDK', color: '#0068A3', accent: '#6bb3ff', sortOrder: 3 },
  { id: 'mcp', label: 'MCP', color: '#9F7AEA', accent: '#B794F4', sortOrder: 4 },
  { id: 'emulator', label: 'Emulator', color: '#F0A000', accent: '#F6C056', sortOrder: 5 },
  { id: 'invoicing', label: 'Invoicing', color: '#10298E', accent: '#5470D6', sortOrder: 6 },
];

const BACKLOG = [
  { id: 'PTH-204', title: 'Clean up / sharpen built screens', product: 'dashboard', stage: 'now', owner: 'D', note: 'Some of the screens are getting messy — wrong layouts' },
  { id: 'PTH-205', title: 'Wire live pulse metric', product: 'dashboard', stage: 'now', owner: 'D', flag: 'due-soon', due: '21 Apr' },
  { id: 'PTH-189', title: 'Boarding flow: email verify retry', product: 'boarding', stage: 'now', owner: 'R' },
  { id: 'PTH-212', title: 'SDK: TypeScript type exports', product: 'sdk', stage: 'now', owner: 'D' },
  { id: 'PTH-221', title: 'MCP server: token refresh bug', product: 'mcp', stage: 'now', owner: 'D', flag: 'overdue', due: '16 Apr' },
  { id: 'PTH-230', title: 'Dashboard: drill-down filters', product: 'dashboard', stage: 'next', owner: 'D' },
  { id: 'PTH-231', title: 'Boarding: KYC gate copy pass', product: 'boarding', stage: 'next', owner: 'R' },
  { id: 'PTH-232', title: 'SDK docs: quick-start refresh', product: 'sdk', stage: 'next', owner: 'D' },
  { id: 'PTH-240', title: 'Emulator: sandbox reset button', product: 'emulator', stage: 'next', owner: 'D' },
  { id: 'PTH-241', title: 'Invoicing: PDF styling', product: 'invoicing', stage: 'next', owner: 'R' },
  { id: 'PTH-260', title: 'Dashboard v2: layout system', product: 'dashboard', stage: 'later', owner: 'D' },
  { id: 'PTH-261', title: 'Boarding: partner co-brand theming', product: 'boarding', stage: 'later', owner: 'R' },
  { id: 'PTH-270', title: 'MCP: public registry listing', product: 'mcp', stage: 'later', owner: 'D' },
  { id: 'PTH-271', title: 'Emulator: record+replay mode', product: 'emulator', stage: 'later', owner: 'D' },
];

const TASKS = [
  { title: 'Send MoU draft to Lloyds partner team', owner: 'R', due: 'today', linkType: 'doc', linkRef: 'Bank partner term sheet' },
  { title: 'Sharpen dashboard demo screens', owner: 'D', due: 'today', linkType: 'backlog', linkRef: 'PTH-204' },
  { title: 'Record a 30-sec MCP walkthrough', owner: 'D', due: 'tomorrow' },
  { title: 'Respond to SeedLegals quote', owner: 'R', due: 'tomorrow' },
  { title: 'Review SDK type exports PR', owner: 'D', due: 'Fri', linkType: 'backlog', linkRef: 'PTH-212' },
  { title: 'Kick off Series A operating model v4', owner: 'R', due: 'Mon', linkType: 'doc', linkRef: 'Series A operating model v3' },
];

const EVENTS = [
  { dayOfWeek: 0, startHour: 9, endHour: 9.5, title: 'Morning standup', who: 'SHARED', kind: 'shared' },
  { dayOfWeek: 1, startHour: 15, endHour: 16, title: 'Investor 1:1', who: 'R', kind: 'meet', flag: 'clash' },
  { dayOfWeek: 1, startHour: 15.5, endHour: 16, title: 'SDK sync', who: 'D', kind: 'meet', flag: 'clash' },
  { dayOfWeek: 4, startHour: 10, endHour: 11, title: 'Retro', who: 'SHARED', kind: 'shared' },
];

const JOBS = [
  { name: 'Weekly summary', schedule: 'Mon 07:00', enabled: true, description: 'Drafts a summary across all modules and files it to Workspace / Weekly summaries.' },
  { name: 'Calendar clash resolver', schedule: 'Every 2h · 09:00–18:00', enabled: true, description: "Reads both founders' calendars, proposes reschedules. Never writes without approval." },
  { name: 'Doc sync', schedule: 'On backlog change', enabled: true, description: 'When a backlog item changes stage or description, drafts edits to linked docs/decks.' },
];

const ACCESS = [
  { module: 'calendar', read: true, write: false },
  { module: 'docs', read: true, write: true },
  { module: 'backlog', read: true, write: false },
  { module: 'tasks', read: true, write: false },
];

async function main() {
  console.log('Seeding...');

  for (const u of FOUNDERS) {
    await db.insert(schema.users).values(u).onConflictDoNothing();
  }

  for (const p of PRODUCTS) {
    await db.insert(schema.products).values(p).onConflictDoNothing();
  }

  for (const [i, b] of BACKLOG.entries()) {
    await db.insert(schema.backlogItems).values({ ...b, sortOrder: i }).onConflictDoNothing();
  }

  for (const t of TASKS) {
    await db.insert(schema.tasks).values(t as any);
  }

  for (const e of EVENTS) {
    await db.insert(schema.calendarEvents).values(e as any);
  }

  for (const j of JOBS) {
    await db.insert(schema.agentJobs).values(j as any);
  }

  for (const a of ACCESS) {
    await db.insert(schema.accessGrants).values(a as any).onConflictDoNothing();
  }

  console.log('✓ Seed complete');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
