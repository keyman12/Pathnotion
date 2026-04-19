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
  sortOrder?: number;
  completedAt?: string | null;
  subfolderId?: number | null;
}

export interface Task {
  id: number | string;
  title: string;
  owner: FounderKey;
  due: string;
  done: boolean;
  link?: { type: 'doc' | 'backlog'; ref: string } | null;
}

export interface CalendarEvent {
  id?: string;
  day: number; // 0=Mon..4=Fri (v1 week view)
  start: number;
  end: number;
  title: string;
  who: 'SHARED' | FounderKey;
  kind: 'shared' | 'meet' | 'deep' | 'personal';
  flag?: 'clash';
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

export type DocBlock =
  | { type: 'h1'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'code'; text: string; lang?: string }
  | { type: 'divider' }
  | { type: 'callout'; tone: 'info' | 'warn'; text: string }
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
  when: string;
  job: string;
  status: 'done' | 'changes' | 'error';
  summary: string;
  changes?: number;
}

export interface AgentJob {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  lastRun?: string;
  description: string;
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
