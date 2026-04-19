import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client.js';

export const backlogRouter = Router();

const stageSchema = z.enum(['now', 'next', 'later']);

const SELECT_BACKLOG = `
  SELECT id,
         title,
         note,
         product_id AS product,
         subfolder_id AS subfolderId,
         stage,
         owner_key AS owner,
         due_date AS due,
         progress,
         flag,
         age,
         sort_order AS sortOrder,
         completed_at AS completedAt
  FROM backlog_items
`;

backlogRouter.get('/items', (req, res) => {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  const { product, stage, owner } = req.query;
  if (typeof product === 'string') { clauses.push('product_id = @product'); params.product = product; }
  if (typeof stage === 'string' && stageSchema.safeParse(stage).success) { clauses.push('stage = @stage'); params.stage = stage; }
  if (typeof owner === 'string') { clauses.push('owner_key = @owner'); params.owner = owner; }
  const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
  const rows = db.prepare(SELECT_BACKLOG + where + ' ORDER BY sort_order, id').all(params);
  res.json(rows);
});

const createSchema = z.object({
  id: z.string().min(1).max(16),
  title: z.string().min(1),
  product: z.string().min(1),
  stage: stageSchema,
  owner: z.enum(['D', 'R']),
  note: z.string().nullish(),
  due: z.string().nullish(),
  flag: z.enum(['overdue', 'due-soon']).nullish(),
  progress: z.number().int().min(0).max(100).optional(),
});

backlogRouter.post('/items', (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const maxOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS n FROM backlog_items').get() as { n: number }).n;
  db.prepare(`
    INSERT INTO backlog_items (id, title, note, product_id, stage, owner_key, due_date, flag, progress, sort_order)
    VALUES (@id, @title, @note, @product, @stage, @owner, @due, @flag, @progress, @sort_order)
  `).run({
    id: parsed.data.id,
    title: parsed.data.title,
    note: parsed.data.note ?? null,
    product: parsed.data.product,
    stage: parsed.data.stage,
    owner: parsed.data.owner,
    due: parsed.data.due ?? null,
    flag: parsed.data.flag ?? null,
    progress: parsed.data.progress ?? 0,
    sort_order: maxOrder + 1,
  });
  const row = db.prepare(SELECT_BACKLOG + ' WHERE id = ?').get(parsed.data.id);
  res.status(201).json(row);
});

const patchSchema = z.object({
  title: z.string().optional(),
  note: z.string().nullish(),
  product: z.string().optional(),
  stage: stageSchema.optional(),
  owner: z.enum(['D', 'R']).optional(),
  due: z.string().nullish(),
  flag: z.enum(['overdue', 'due-soon']).nullish(),
  progress: z.number().int().min(0).max(100).optional(),
  sortOrder: z.number().int().optional(),
  completed: z.boolean().optional(),
});

backlogRouter.patch('/items/:id', (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const sets: string[] = [];
  const params: Record<string, unknown> = { id: req.params.id };
  const map: Array<[keyof typeof parsed.data, string]> = [
    ['title', 'title = @title'],
    ['note', 'note = @note'],
    ['product', 'product_id = @product'],
    ['stage', 'stage = @stage'],
    ['owner', 'owner_key = @owner'],
    ['due', 'due_date = @due'],
    ['flag', 'flag = @flag'],
    ['progress', 'progress = @progress'],
    ['sortOrder', 'sort_order = @sortOrder'],
  ];
  for (const [k, sql] of map) {
    if (parsed.data[k] !== undefined) {
      sets.push(sql);
      params[k] = parsed.data[k];
    }
  }
  if (parsed.data.completed !== undefined) {
    sets.push(parsed.data.completed ? "completed_at = datetime('now')" : 'completed_at = NULL');
  }
  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
  sets.push("updated_at = datetime('now')");

  const result = db.prepare(`UPDATE backlog_items SET ${sets.join(', ')} WHERE id = @id`).run(params);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  const row = db.prepare(SELECT_BACKLOG + ' WHERE id = ?').get(req.params.id);
  res.json(row);
});

backlogRouter.delete('/items/:id', (req, res) => {
  const result = db.prepare('DELETE FROM backlog_items WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

// Bulk reorder — accept [{ id, stage, sortOrder }]
const reorderSchema = z.array(z.object({
  id: z.string(),
  stage: stageSchema.optional(),
  sortOrder: z.number().int(),
}));

backlogRouter.post('/reorder', (req, res) => {
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const stmt = db.prepare('UPDATE backlog_items SET sort_order = @sortOrder, stage = COALESCE(@stage, stage), updated_at = datetime(\'now\') WHERE id = @id');
  const run = db.transaction((items: typeof parsed.data) => {
    for (const it of items) stmt.run({ id: it.id, sortOrder: it.sortOrder, stage: it.stage ?? null });
  });
  run(parsed.data);
  res.status(204).send();
});
