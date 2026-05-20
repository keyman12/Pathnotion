import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client.js';
import { pushTaskToGoogle, removeTaskFromGoogle, syncGoogleTasksForUser } from '../services/google-tasks-sync.js';

export const tasksRouter = Router();

const attachmentSchema = z.object({
  type: z.enum(['doc', 'file', 'url', 'backlog']),
  ref: z.string().min(1),
  label: z.string().optional(),
});

const SELECT_TASK = `
  SELECT id,
         title,
         owner_key AS owner,
         due,
         done,
         priority,
         attachments AS attachmentsJson,
         google_task_id AS googleTaskId,
         google_task_list_id AS googleTaskListId,
         google_owner_key AS googleOwnerKey,
         google_web_link AS googleWebLink,
         last_synced_at AS lastSyncedAt,
         sort_order AS sortOrder
  FROM tasks
`;

type TaskRow = {
  id: number;
  title: string;
  owner: string;
  due: string;
  done: number;
  priority: string | null;
  attachmentsJson: string | null;
  googleTaskId: string | null;
  googleTaskListId: string | null;
  googleOwnerKey: string | null;
  googleWebLink: string | null;
  lastSyncedAt: string | null;
  sortOrder: number;
};

function mapTask(row: TaskRow) {
  let attachments: Array<{ type: string; ref: string; label?: string }> = [];
  if (row.attachmentsJson) {
    try {
      const parsed = JSON.parse(row.attachmentsJson);
      if (Array.isArray(parsed)) attachments = parsed;
    } catch { /* ignore malformed */ }
  }
  return {
    id: row.id,
    title: row.title,
    owner: row.owner,
    due: row.due,
    done: Boolean(row.done),
    priority: row.priority,
    attachments,
    googleTaskId: row.googleTaskId,
    googleTaskListId: row.googleTaskListId,
    googleOwnerKey: row.googleOwnerKey,
    googleWebLink: row.googleWebLink,
    lastSyncedAt: row.lastSyncedAt,
    sortOrder: row.sortOrder,
  };
}

tasksRouter.get('/', (_req, res) => {
  const rows = db.prepare(SELECT_TASK + ' ORDER BY done, sort_order, id').all() as TaskRow[];
  res.json(rows.map(mapTask));
});

const prioritySchema = z.enum(['P1', 'P2', 'P3']);

const createSchema = z.object({
  title: z.string().min(1),
  owner: z.enum(['D', 'R']),
  due: z.string().min(1),
  priority: prioritySchema.nullish(),
  attachments: z.array(attachmentSchema).optional(),
});

tasksRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const maxOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS n FROM tasks').get() as { n: number }).n;
  const info = db.prepare(`
    INSERT INTO tasks (title, owner_key, due, done, priority, attachments, sort_order)
    VALUES (@title, @owner, @due, 0, @priority, @attachments, @sort_order)
  `).run({
    title: parsed.data.title,
    owner: parsed.data.owner,
    due: parsed.data.due,
    priority: parsed.data.priority ?? null,
    attachments: parsed.data.attachments ? JSON.stringify(parsed.data.attachments) : null,
    sort_order: maxOrder + 1,
  });
  const sync = await pushTaskToGoogle(Number(info.lastInsertRowid));
  if (!sync.ok) console.warn('[tasks] Google create sync failed:', sync.error);
  const row = db.prepare(SELECT_TASK + ' WHERE id = ?').get(info.lastInsertRowid) as TaskRow;
  res.status(201).json(mapTask(row));
});

const patchSchema = z.object({
  title: z.string().optional(),
  owner: z.enum(['D', 'R']).optional(),
  due: z.string().optional(),
  done: z.boolean().optional(),
  priority: prioritySchema.nullish(),
  attachments: z.array(attachmentSchema).nullish(),
  sortOrder: z.number().int().optional(),
});

tasksRouter.patch('/:id', async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const existing = db.prepare(SELECT_TASK + ' WHERE id = ?').get(req.params.id) as TaskRow | undefined;
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const sets: string[] = [];
  const params: Record<string, unknown> = { id: req.params.id };
  if (parsed.data.title !== undefined) { sets.push('title = @title'); params.title = parsed.data.title; }
  if (parsed.data.owner !== undefined) { sets.push('owner_key = @owner'); params.owner = parsed.data.owner; }
  if (parsed.data.due !== undefined) { sets.push('due = @due'); params.due = parsed.data.due; }
  if (parsed.data.done !== undefined) { sets.push('done = @done'); params.done = parsed.data.done ? 1 : 0; }
  if (parsed.data.priority !== undefined) { sets.push('priority = @priority'); params.priority = parsed.data.priority ?? null; }
  if (parsed.data.sortOrder !== undefined) { sets.push('sort_order = @sortOrder'); params.sortOrder = parsed.data.sortOrder; }
  if (parsed.data.attachments !== undefined) {
    sets.push('attachments = @attachments');
    params.attachments = parsed.data.attachments === null ? null : JSON.stringify(parsed.data.attachments);
  }
  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
  sets.push("updated_at = datetime('now')");

  const result = db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = @id`).run(params);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  const sync = await pushTaskToGoogle(Number(req.params.id), existing.owner);
  if (!sync.ok) console.warn('[tasks] Google patch sync failed:', sync.error);
  const row = db.prepare(SELECT_TASK + ' WHERE id = ?').get(req.params.id) as TaskRow;
  res.json(mapTask(row));
});

tasksRouter.delete('/:id', async (req, res) => {
  const existing = db.prepare(SELECT_TASK + ' WHERE id = ?').get(req.params.id) as TaskRow | undefined;
  if (!existing) return res.status(404).json({ error: 'Not found' });
  try {
    await removeTaskFromGoogle(existing);
  } catch (err) {
    console.warn('[tasks] Google delete sync failed:', (err as Error).message);
  }
  const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

tasksRouter.post('/sync', async (req, res) => {
  const key = req.session?.userKey;
  if (!key) return res.status(401).json({ error: 'Not authenticated' });
  const result = await syncGoogleTasksForUser(key);
  if (!result.ok) return res.status(503).json(result);
  res.json(result);
});
