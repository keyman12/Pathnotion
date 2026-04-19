import { boolean, integer, jsonb, pgTable, real, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: varchar('key', { length: 2 }).notNull().unique(), // 'D' | 'R'
  name: varchar('name', { length: 64 }).notNull(),
  email: varchar('email', { length: 128 }).notNull().unique(),
  role: varchar('role', { length: 16 }).notNull(),
  color: varchar('color', { length: 16 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const products = pgTable('products', {
  id: varchar('id', { length: 32 }).primaryKey(),
  label: varchar('label', { length: 64 }).notNull(),
  color: varchar('color', { length: 16 }).notNull(),
  accent: varchar('accent', { length: 16 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const backlogItems = pgTable('backlog_items', {
  id: varchar('id', { length: 16 }).primaryKey(),
  title: text('title').notNull(),
  note: text('note'),
  product: varchar('product', { length: 32 }).notNull().references(() => products.id),
  stage: varchar('stage', { length: 8 }).notNull(), // now | next | later
  owner: varchar('owner', { length: 2 }).notNull().references(() => users.key),
  due: varchar('due', { length: 32 }),
  flag: varchar('flag', { length: 16 }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tasks = pgTable('tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  owner: varchar('owner', { length: 2 }).notNull().references(() => users.key),
  due: varchar('due', { length: 32 }).notNull(),
  done: boolean('done').notNull().default(false),
  linkType: varchar('link_type', { length: 16 }),
  linkRef: varchar('link_ref', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const calendarEvents = pgTable('calendar_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  externalId: varchar('external_id', { length: 256 }),
  title: text('title').notNull(),
  who: varchar('who', { length: 8 }).notNull(),
  kind: varchar('kind', { length: 16 }).notNull(),
  dayOfWeek: integer('day_of_week').notNull(),
  startHour: real('start_hour').notNull(),
  endHour: real('end_hour').notNull(),
  flag: varchar('flag', { length: 16 }),
  source: varchar('source', { length: 32 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const calendarSources = pgTable('calendar_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  userKey: varchar('user_key', { length: 2 }).notNull().references(() => users.key),
  email: varchar('email', { length: 128 }).notNull(),
  mode: varchar('mode', { length: 16 }).notNull(), // caldav | ics
  endpoint: text('endpoint'),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
});

export const docs = pgTable('docs', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  title: text('title').notNull(),
  root: varchar('root', { length: 16 }).notNull(), // product | finance
  product: varchar('product', { length: 32 }).references(() => products.id),
  group: varchar('group', { length: 32 }),
  size: varchar('size', { length: 32 }),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  createdBy: varchar('created_by', { length: 2 }).notNull().references(() => users.key),
  updatedBy: varchar('updated_by', { length: 2 }).notNull().references(() => users.key),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const docBlocks = pgTable('doc_blocks', {
  id: uuid('id').defaultRandom().primaryKey(),
  docId: uuid('doc_id').notNull().references(() => docs.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull(),
  data: jsonb('data').notNull(),
});

export const docComments = pgTable('doc_comments', {
  id: uuid('id').defaultRandom().primaryKey(),
  blockId: uuid('block_id').notNull().references(() => docBlocks.id, { onDelete: 'cascade' }),
  author: varchar('author', { length: 2 }).notNull().references(() => users.key),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const attachments = pgTable('attachments', {
  id: uuid('id').defaultRandom().primaryKey(),
  docId: uuid('doc_id').references(() => docs.id, { onDelete: 'set null' }),
  filename: text('filename').notNull(),
  ext: varchar('ext', { length: 16 }).notNull(),
  bytes: integer('bytes').notNull(),
  s3Key: text('s3_key').notNull(),
  uploadedBy: varchar('uploaded_by', { length: 2 }).notNull().references(() => users.key),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const agentJobs = pgTable('agent_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 64 }).notNull(),
  schedule: varchar('schedule', { length: 64 }).notNull(),
  enabled: boolean('enabled').notNull().default(true),
  description: text('description').notNull(),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
});

export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  jobId: uuid('job_id').references(() => agentJobs.id),
  job: varchar('job', { length: 64 }).notNull(),
  status: varchar('status', { length: 16 }).notNull(),
  summary: text('summary').notNull(),
  changes: integer('changes').notNull().default(0),
  diff: jsonb('diff'),
  ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
});

export const agentMessages = pgTable('agent_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  role: varchar('role', { length: 8 }).notNull(),
  text: text('text').notNull(),
  actions: jsonb('actions').$type<{ label: string; intent?: string }[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const accessGrants = pgTable('access_grants', {
  module: varchar('module', { length: 16 }).primaryKey(),
  read: boolean('read').notNull().default(true),
  write: boolean('write').notNull().default(false),
  lastTouchedAt: timestamp('last_touched_at', { withTimezone: true }),
});
