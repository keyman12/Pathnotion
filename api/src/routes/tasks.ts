import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/client.js';

export const tasksRouter = Router();

tasksRouter.get('/', async (_req, res) => {
  const rows = await db.select().from(schema.tasks);
  res.json(rows);
});

const createSchema = z.object({
  title: z.string().min(1),
  owner: z.enum(['D', 'R']),
  due: z.string().min(1),
  linkType: z.enum(['doc', 'backlog']).optional(),
  linkRef: z.string().optional(),
});

tasksRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const [row] = await db.insert(schema.tasks).values(parsed.data).returning();
  res.status(201).json(row);
});

const patchSchema = z.object({
  title: z.string().optional(),
  owner: z.enum(['D', 'R']).optional(),
  due: z.string().optional(),
  done: z.boolean().optional(),
});

tasksRouter.patch('/:id', async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const [row] = await db.update(schema.tasks).set(parsed.data).where(eq(schema.tasks.id, req.params.id)).returning();
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

tasksRouter.delete('/:id', async (req, res) => {
  await db.delete(schema.tasks).where(eq(schema.tasks.id, req.params.id));
  res.status(204).send();
});
