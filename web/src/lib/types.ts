export type FounderKey = 'D' | 'R';
export type Stage = 'now' | 'next' | 'later';
export type Route =
  | 'week'
  | 'backlog'
  | 'docs'
  | 'tasks'
  | 'calendar'
  | 'jeff'
  | 'settings'
  | 'reports'
  | 'finance-docs'
  | 'sales-docs'
  | 'legal-docs'
  | `product:${string}`
  | `business:${string}`;

export interface Founder {
  key: FounderKey;
  name: string;
  role: string;
  color: string;
}

export interface Product {
  id: string;
  label: string;
  color: string;
  accent: string;
  count?: number;
}

export type AttachmentKind = 'doc' | 'file' | 'url' | 'backlog';

export interface Attachment {
  type: AttachmentKind;
  /** For doc/file: the id in seed (e.g. 'd1', 'pf3'). For url: the href. For backlog: the item id (e.g. 'PTH-175'). */
  ref: string;
  /** Display label — falls back to the referenced resource's title if omitted. */
  label?: string;
}

export interface BacklogItem {
  id: string;
  title: string;
  product: string;
  stage: Stage;
  owner: FounderKey;
  note?: string | null;
  due?: string | null;
  age?: string | null;
  flag?: 'due-soon' | 'overdue' | null;
  progress?: number;
  effortDays?: number | null;
  sortOrder?: number;
  completedAt?: string | null;
  attachments?: Attachment[];
  /** Write-only: setting true stamps completedAt = now; false clears it. */
  completed?: boolean;
}

export type TaskPriority = 'P1' | 'P2' | 'P3';

export interface Task {
  id: number | string;
  title: string;
  owner: FounderKey;
  /** ISO YYYY-MM-DD preferred for new tasks; legacy free-form strings (today, tomorrow, Fri…) tolerated on read. */
  due: string;
  done: boolean;
  /** Urgency — P1 highest, P3 lowest. Null/undefined = no priority assigned. */
  priority?: TaskPriority | null;
  attachments?: Attachment[];
}

export interface CalendarEvent {
  id?: string | number;
  day: number; // 0=Mon..4=Fri (v1 week view) — derived from startIso when present
  start: number;
  end: number;
  title: string;
  who: 'SHARED' | FounderKey | string;
  kind: 'shared' | 'meet' | 'deep' | 'personal';
  flag?: 'clash';
  /** Real ISO start/end when the event came from an external calendar (Google etc.). */
  startIso?: string | null;
  endIso?: string | null;
  allDay?: boolean;
  location?: string | null;
  description?: string | null;
  source?: string | null;
  sourceId?: number | null;
}

export interface Doc {
  id: string;
  product?: string;
  group?: string;
  title: string;
  updated: string;
  by: FounderKey;
  size: string;
  tags: string[];
}

export interface FileEntry {
  id: string;
  product?: string;
  group?: string;
  title: string;
  ext: string;
  bytes: number;
  updated: string;
  by: FounderKey;
  version?: string;
  tags: string[];
}

export type InlineMarkName = 'bold' | 'italic' | 'code' | 'underline' | 'strike';

/** How a text-containing block is horizontally aligned. */
export type TextAlign = 'left' | 'center' | 'right' | 'justify';

/** One span of text in a rich-text block. `marks` carries bold/italic/code/underline/strike; `href` marks a link; `color` sets foreground colour. */
export interface InlineNode {
  text: string;
  marks?: InlineMarkName[];
  href?: string;
  color?: string;
}

/** A nested list block that can appear under a list item. Points back to DocBlock via the union. */
export type ListBlock = Extract<DocBlock, { type: 'ul' | 'ol' | 'todo' }>;

/** A single checkable row in a todo list. */
export interface TodoItem {
  text: string;
  checked: boolean;
  inline?: InlineNode[];
}

export type DocBlock =
  | { type: 'h1'; text: string; inline?: InlineNode[]; align?: TextAlign }
  | { type: 'h2'; text: string; inline?: InlineNode[]; align?: TextAlign }
  | { type: 'h3'; text: string; inline?: InlineNode[]; align?: TextAlign }
  | { type: 'p'; text: string; inline?: InlineNode[]; align?: TextAlign }
  // `itemsChildren[i]`, if present, is a nested list that renders under item i.
  | { type: 'ul'; items: string[]; itemsInline?: InlineNode[][]; itemsChildren?: (ListBlock | null)[] }
  | { type: 'ol'; items: string[]; itemsInline?: InlineNode[][]; itemsChildren?: (ListBlock | null)[] }
  | { type: 'todo'; items: TodoItem[]; itemsChildren?: (ListBlock | null)[] }
  | { type: 'quote'; text: string; inline?: InlineNode[]; align?: TextAlign }
  | { type: 'code'; text: string; lang?: string }
  | { type: 'divider' }
  | { type: 'callout'; tone: 'info' | 'warn'; text: string; inline?: InlineNode[]; align?: TextAlign }
  | { type: 'file'; name: string; ext: string; bytes: number }
  | { type: 'table'; columns: string[]; rows: string[][] };

export interface DocPage {
  id: string;
  title: string;
  blocks: DocBlock[];
}

export type AgentStatus = 'idle' | 'working' | 'blocked' | 'error';

export interface AgentRun {
  id: string;
  /** Legacy alias — seed rows still populate this. Backend uses `ranAt`. */
  when?: string;
  ranAt?: string;
  jobId?: string | null;
  job?: string;
  status: 'done' | 'changes' | 'error' | 'ok';
  summary: string;
  changes?: number;
  diff?: unknown;
}

export interface AgentJob {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  kind?: string | null;
  description: string;
  /** Custom instruction for Claude. Null / missing = use the built-in default for this kind. */
  prompt?: string | null;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  time: string;
  actions?: { label: string; intent?: 'primary' | 'ghost' }[];
}

export interface AccessGrant {
  module: 'calendar' | 'docs' | 'backlog' | 'tasks';
  read: boolean;
  write: boolean;
  lastTouched?: string;
}
