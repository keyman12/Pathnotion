import type {
  AccessGrant,
  AgentJob,
  AgentMessage,
  AgentRun,
  BacklogItem,
  CalendarEvent,
  Doc,
  DocPage,
  FileEntry,
  Founder,
  Product,
  Task,
} from './types';

export const FOUNDERS: Record<'D' | 'R', Founder> = {
  D: { key: 'D', name: 'Dave', role: 'CEO', color: '#35d37a' },
  R: { key: 'R', name: 'Raj', role: 'CFO', color: '#6bb3ff' },
};

export const PRODUCTS: Product[] = [
  { id: 'dashboard', label: 'Dashboard', color: '#297D2D', accent: '#49BC4E', count: 5 },
  { id: 'boarding', label: 'Boarding', color: '#B42318', accent: '#FF5252', count: 4 },
  { id: 'sdk', label: 'Path SDK', color: '#6B2A8F', accent: '#B794F4', count: 1 },
  { id: 'mcp', label: 'MCP Server', color: '#10298E', accent: '#5470D6', count: 2 },
  { id: 'emulator', label: 'Emulator', color: '#B54708', accent: '#F0A000', count: 1 },
  { id: 'invoicing', label: 'Invoicing', color: '#0068A3', accent: '#6bb3ff', count: 1 },
];

export const BACKLOG: BacklogItem[] = [
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

export const TASKS: Task[] = [
  { id: 1, title: 'Send MoU draft to Lloyds partner team', owner: 'R', due: 'today', done: false, link: { type: 'doc', ref: 'Bank partner term sheet' } },
  { id: 2, title: 'Reply to Notable re. data room access', owner: 'R', due: 'today', done: false, link: null },
  { id: 3, title: 'Push SDK v1.4 release notes', owner: 'D', due: 'tomorrow', done: false, link: { type: 'backlog', ref: 'PTH-175' } },
  { id: 4, title: 'Review case mgmt phase 2 scope', owner: 'D', due: 'Fri', done: false, link: { type: 'backlog', ref: 'PTH-151' } },
  { id: 5, title: 'Collect April expense receipts', owner: 'R', due: 'Fri', done: false, link: null },
  { id: 6, title: 'Update pricing deck for bank pitch', owner: 'R', due: 'Mon', done: false, link: { type: 'doc', ref: 'Pricing playbook' } },
  { id: 7, title: 'Confirm emulator fleet at the shelf', owner: 'D', due: '15 Apr', done: true, link: { type: 'backlog', ref: 'PTH-207' } },
];

export const EVENTS: CalendarEvent[] = [
  { day: 0, start: 9, end: 9.5, title: 'Morning standup', who: 'SHARED', kind: 'shared' },
  { day: 0, start: 11, end: 12, title: 'Bank partner intro — Lloyds', who: 'R', kind: 'meet' },
  { day: 0, start: 14, end: 15.5, title: 'Backlog triage', who: 'SHARED', kind: 'shared' },
  { day: 1, start: 9, end: 9.5, title: 'Morning standup', who: 'SHARED', kind: 'shared' },
  { day: 1, start: 10, end: 11, title: 'SDK review', who: 'D', kind: 'deep' },
  { day: 1, start: 13, end: 14, title: 'Lunch — Fintech Sq', who: 'D', kind: 'personal' },
  { day: 1, start: 15, end: 16.5, title: 'Series A model v3', who: 'R', kind: 'deep' },
  { day: 2, start: 9, end: 9.5, title: 'Morning standup', who: 'SHARED', kind: 'shared' },
  { day: 2, start: 10, end: 11.5, title: 'Investor — Notable', who: 'SHARED', kind: 'shared', flag: 'clash' },
  { day: 2, start: 10.5, end: 11, title: 'Ops review', who: 'R', kind: 'meet', flag: 'clash' },
  { day: 2, start: 14, end: 15, title: 'MCP design', who: 'D', kind: 'deep' },
  { day: 3, start: 9, end: 10, title: 'Founder sync', who: 'SHARED', kind: 'shared' },
  { day: 3, start: 11, end: 12, title: 'Legal — Boarding T&Cs', who: 'R', kind: 'meet' },
  { day: 3, start: 13, end: 14.5, title: 'Terminal firmware lab', who: 'D', kind: 'deep' },
  { day: 3, start: 16, end: 17, title: 'Board update draft', who: 'R', kind: 'deep' },
  { day: 4, start: 9, end: 9.5, title: 'Morning standup', who: 'SHARED', kind: 'shared' },
  { day: 4, start: 10, end: 11.5, title: 'Weekly review', who: 'SHARED', kind: 'shared' },
  { day: 4, start: 14, end: 15, title: 'CFO — bank call', who: 'R', kind: 'meet' },
];

export const PRODUCT_DOCS: Doc[] = [
  { id: 'd1', product: 'boarding', title: 'Boarding — the Wizard, end-to-end', updated: 'today', by: 'D', size: '22 min', tags: ['spec'] },
  { id: 'd2', product: 'mcp', title: 'MCP — tool surface + scopes', updated: 'today', by: 'D', size: '14 min', tags: ['rfc'] },
  { id: 'd3', product: 'emulator', title: 'V3 firmware OTA design', updated: 'yesterday', by: 'D', size: '9 min', tags: ['spec'] },
  { id: 'd4', product: 'dashboard', title: 'Dashboard — information architecture', updated: '2d ago', by: 'D', size: '12 min', tags: ['spec', 'IA'] },
  { id: 'd5', product: 'dashboard', title: 'Dashboard v2 north-star', updated: '3d ago', by: 'D', size: '4 min', tags: ['vision'] },
  { id: 'd6', product: 'boarding', title: 'Partner co-brand guidelines', updated: '1w ago', by: 'R', size: '6 min', tags: ['brand'] },
];

export const PRODUCT_FILES: FileEntry[] = [
  { id: 'pf1', product: 'dashboard', title: 'Dashboard wireframes v4.fig', ext: 'fig', bytes: 8_400_000, updated: 'today', by: 'D', version: 'v4', tags: ['wireframe'] },
  { id: 'pf2', product: 'dashboard', title: 'Pulse metric mock.png', ext: 'png', bytes: 620_000, updated: '2d ago', by: 'D', version: '', tags: ['mock'] },
  { id: 'pf3', product: 'boarding', title: 'KYC flow diagram.pdf', ext: 'pdf', bytes: 1_300_000, updated: '1w ago', by: 'R', tags: ['compliance'] },
  { id: 'pf4', product: 'sdk', title: 'SDK sample app.zip', ext: 'zip', bytes: 14_200_000, updated: '3d ago', by: 'D', tags: ['sample'] },
];

export const FINANCE_DOCS: Doc[] = [
  { id: 'f1', group: 'Models', title: 'Series A operating model — v3', updated: 'today', by: 'R', size: 'sheet', tags: ['model', 'Series A'] },
  { id: 'f2', group: 'Models', title: 'Monthly burn tracker', updated: '3d ago', by: 'R', size: 'sheet', tags: ['ops'] },
  { id: 'f3', group: 'Forecasts', title: 'FY26 forecast assumptions', updated: '1w ago', by: 'R', size: '7 min', tags: ['forecast'] },
  { id: 'f4', group: 'Legal', title: 'Bank partner term sheet', updated: '2d ago', by: 'R', size: '11 min', tags: ['term-sheet'] },
  { id: 'f5', group: 'Contracts', title: 'Employment agreements — master', updated: '2w ago', by: 'R', size: '14 min', tags: ['template'] },
  { id: 'f6', group: 'Board', title: 'April board deck', updated: 'yesterday', by: 'R', size: 'deck', tags: ['board'] },
];

export const FINANCE_FILES: FileEntry[] = [
  { id: 'ff1', group: 'Models', title: 'Series A model v3.xlsx', ext: 'xlsx', bytes: 420_000, updated: 'today', by: 'R', version: 'v3', tags: ['model'] },
  { id: 'ff2', group: 'Legal', title: 'Lloyds MoU — executed.pdf', ext: 'pdf', bytes: 1_100_000, updated: '4d ago', by: 'R', version: 'final', tags: ['MoU'] },
  { id: 'ff3', group: 'Board', title: 'April board deck.pptx', ext: 'pptx', bytes: 6_200_000, updated: 'yesterday', by: 'R', version: 'v2', tags: ['board'] },
  { id: 'ff4', group: 'Forecasts', title: 'Cash runway scenarios.xlsx', ext: 'xlsx', bytes: 280_000, updated: '1w ago', by: 'R', version: 'v1', tags: ['scenarios'] },
];

export const SALES_DOCS: Doc[] = [
  { id: 's1', group: 'Pipeline', title: 'Q2 pipeline — target accounts', updated: 'today', by: 'D', size: '8 min', tags: ['pipeline'] },
  { id: 's2', group: 'Accounts', title: 'Lloyds — account notes', updated: '2d ago', by: 'R', size: '5 min', tags: ['bank'] },
  { id: 's3', group: 'Playbooks', title: 'Demo playbook v2', updated: '1w ago', by: 'D', size: '10 min', tags: ['playbook'] },
  { id: 's4', group: 'Pricing', title: 'Tiered pricing — rationale', updated: '3d ago', by: 'R', size: 'sheet', tags: ['pricing'] },
];

export const SALES_FILES: FileEntry[] = [
  { id: 'sf1', group: 'Pipeline', title: 'Pipeline tracker.xlsx', ext: 'xlsx', bytes: 96_000, updated: 'today', by: 'D', version: 'live', tags: ['tracker'] },
  { id: 'sf2', group: 'Pricing', title: 'Pricing comps.xlsx', ext: 'xlsx', bytes: 210_000, updated: '3d ago', by: 'R', version: 'v4', tags: ['analysis'] },
  { id: 'sf3', group: 'Accounts', title: 'Lloyds deck — discovery.pptx', ext: 'pptx', bytes: 4_400_000, updated: '2d ago', by: 'R', version: 'v1', tags: ['bank'] },
];

export const LEGAL_DOCS: Doc[] = [
  { id: 'l1', group: 'Corporate', title: 'Shareholder register', updated: '2w ago', by: 'R', size: 'sheet', tags: ['corporate'] },
  { id: 'l2', group: 'Compliance', title: 'FCA — application checklist', updated: '5d ago', by: 'R', size: '6 min', tags: ['FCA'] },
  { id: 'l3', group: 'Contracts', title: 'NDA — master template', updated: '3w ago', by: 'R', size: '3 min', tags: ['template'] },
  { id: 'l4', group: 'IP', title: 'Trademarks — filings log', updated: '1w ago', by: 'R', size: 'sheet', tags: ['IP'] },
];

export const LEGAL_FILES: FileEntry[] = [
  { id: 'lf1', group: 'Corporate', title: 'Articles of association.pdf', ext: 'pdf', bytes: 320_000, updated: '2w ago', by: 'R', version: 'v1', tags: ['corporate'] },
  { id: 'lf2', group: 'Contracts', title: 'NDA — master.docx', ext: 'docx', bytes: 42_000, updated: '3w ago', by: 'R', version: 'v2', tags: ['template'] },
  { id: 'lf3', group: 'IP', title: 'Trademark filings.pdf', ext: 'pdf', bytes: 890_000, updated: '1w ago', by: 'R', version: 'current', tags: ['IP'] },
];

export const DOC_CONTENT: Record<string, DocPage> = {
  d1: {
    id: 'd1',
    title: 'Dashboard — information architecture',
    blocks: [
      { type: 'h1', text: 'Dashboard — information architecture' },
      { type: 'p', text: 'The dashboard is the anchor surface. Each widget maps to a backlog item, a metric stream, or an embedded report. This doc tracks the chosen IA and the reasoning behind it.' },
      { type: 'callout', tone: 'info', text: 'Changes here should update the "Pulse" tile copy on the Week view.' },
      { type: 'h2', text: 'Top-level zones' },
      { type: 'ul', items: ['Pulse — realtime health strip', 'Focus — active "Now" items', 'Metrics — KPI grid', 'Reports — drillable tables'] },
      { type: 'h2', text: 'Navigation model' },
      { type: 'p', text: 'Sidebar is product-led. A product card drills into its own Now / Next / Later.' },
      { type: 'divider' },
      { type: 'h3', text: 'Open questions' },
      { type: 'ol', items: ['Do we surface both founders in the Pulse strip?', 'Where does Jeff\'s proposal surface live — inline or in a tray?'] },
      { type: 'file', name: 'Dashboard wireframes v4.fig', ext: 'fig', bytes: 8_400_000 },
    ],
  },
  f4: {
    id: 'f4',
    title: 'Bank partner term sheet',
    blocks: [
      { type: 'h1', text: 'Bank partner term sheet' },
      { type: 'p', text: 'Draft terms with Lloyds partner team. Not yet counter-signed. Comments open.' },
      { type: 'callout', tone: 'warn', text: 'Do not circulate outside the two founders and legal.' },
      { type: 'h2', text: 'Commercials' },
      { type: 'table', columns: ['Item', 'Their ask', 'Our counter'], rows: [
        ['Revenue share', '30%', '18%'],
        ['Minimum volume', '£50M / yr', '£20M / yr'],
        ['Exclusivity', 'UK SME', 'None in year 1'],
      ]},
      { type: 'h2', text: 'Exit clauses' },
      { type: 'ul', items: ['Either party 90-day notice', 'Data portability obligation'] },
      { type: 'file', name: 'Term sheet draft v2.pdf', ext: 'pdf', bytes: 340_000 },
    ],
  },
};

export const AGENT_RUNS: AgentRun[] = [
  { id: 'r1', when: 'Today · 08:01', job: 'Weekly summary', status: 'done', summary: "Drafted 'Week of 13 Apr'. 6 backlog changes, 2 clashes resolved, 1 doc rewrite suggested.", changes: 9 },
  { id: 'r2', when: 'Yesterday · 16:22', job: 'Calendar clash resolver', status: 'changes', summary: 'Found 1 overlap (SDK sync vs Investor 1:1). Proposed rescheduling SDK sync to Wed 15:30.', changes: 1 },
  { id: 'r3', when: 'Mon · 07:00', job: 'Doc sync', status: 'done', summary: 'Updated 3 product docs after stage changes on PTH-204, PTH-205, PTH-212.', changes: 3 },
  { id: 'r4', when: 'Fri · 09:14', job: 'Weekly summary', status: 'done', summary: "Drafted 'Week of 6 Apr'. Auto-filed to Workspace / Weekly summaries.", changes: 4 },
  { id: 'r5', when: 'Thu · 11:40', job: 'Doc sync', status: 'changes', summary: 'Rewrote 1 section of "Dashboard — IA" after scope change. Needs review.', changes: 1 },
];

export const AGENT_JOBS: AgentJob[] = [
  { id: 'j1', name: 'Weekly summary', schedule: 'Mon 07:00', enabled: true, lastRun: 'Today · 08:01', description: 'Drafts a summary across all modules and files it to Workspace / Weekly summaries.' },
  { id: 'j2', name: 'Calendar clash resolver', schedule: 'Every 2h · 09:00–18:00', enabled: true, lastRun: 'Yesterday · 16:22', description: 'Reads both founders\' calendars, proposes reschedules. Never writes without approval.' },
  { id: 'j3', name: 'Doc sync', schedule: 'On backlog change', enabled: true, lastRun: 'Mon · 07:00', description: 'When a backlog item changes stage or description, drafts edits to linked docs/decks.' },
  { id: 'j4', name: 'Overnight triage', schedule: 'Daily 06:45', enabled: false, description: 'Triages overnight inbound (PRs, emails, alerts). Off by default.' },
];

export const AGENT_MESSAGES: AgentMessage[] = [
  { id: 'm1', role: 'agent', text: "Morning. The clash resolver found one overlap today: Investor 1:1 (Tue 15:00) and SDK sync (Tue 15:30 → 16:00). Want me to propose a move?", time: '08:02', actions: [{ label: 'Show both calendars', intent: 'ghost' }, { label: 'Propose reschedule', intent: 'primary' }] },
  { id: 'm2', role: 'user', text: 'Propose it.', time: '08:04' },
  { id: 'm3', role: 'agent', text: "Proposed: SDK sync → Wed 15:30. I posted it in the shared calendar as a draft. It won't send until one of you approves.", time: '08:04', actions: [{ label: 'Open draft', intent: 'ghost' }] },
  { id: 'm4', role: 'user', text: 'Also — can you redraft the dashboard IA doc callout? Make it clearer.', time: '08:06' },
  { id: 'm5', role: 'agent', text: "On it. I'll draft a revision, leave the original in place, and flag the diff for you to review.", time: '08:06' },
];

export const ACCESS: AccessGrant[] = [
  { module: 'calendar', read: true, write: false, lastTouched: 'Today · 08:02' },
  { module: 'docs', read: true, write: true, lastTouched: 'Mon · 07:00' },
  { module: 'backlog', read: true, write: false, lastTouched: 'Mon · 07:00' },
  { module: 'tasks', read: true, write: false, lastTouched: '—' },
];
