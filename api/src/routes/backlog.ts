import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/client.js';

export const backlogRouter = Router();

const stageSchema = z.enum(['now', 'next', 'later']);

backlogRouter.get('/items', async (req, res) => {
  const { product, stage, owner } = req.query;
  const where = [];
  if (typeof product === 'string') where.push(eq(schema.backlogItems.product, product));
  if (typeof stage === 'string' && stageSchema.safeParse(stage).success) where.push(eq(schema.backlogItems.stage, stage));
  if (typeof owner === 'string') where.push(eq(schema.backlogItems.owner, owner));
  const rows = await db.select().from(schema.backlogItems).where(where.length ? and(...where) : undefined);
  res.json(rows);
});

const createSchema = z.object({
  id: z.string().min(1).max(16),
  title: z.string().min(1),
  product: z.string().min(1),
  stage: stageSchema,
  owner: z.enum(['D', 'R']),
  note: z.string().optional(),
  due: z.string().nullish(),
});

backlogRouter.post('/items', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const [row] = await db.insert(schema.backlogItems).values(parsed.data).returning();
  res.status(201).json(row);
});

const patchSchema = z.object({
  title: z.string().optional(),
  note: z.string().nullish(),
  product: z.string().optional(),
  stage: stageSchema.optional(),
  owner: z.enum(['D', 'R']).optional(),
  due: z.string().nullish(),
  flag: z.string().nullish(),
});

backlogRouter.patch('/items/:id', async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const [row] = await db
    .update(schema.backlogItems)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(schema.backlogItems.id, req.params.id))
    .returning();
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

backlogRouter.delete('/items/:id', async (req, res) => {
  await db.delete(schema.backlogItems).where(eq(schema.backlogItems.id, req.params.id));
  res.status(204).send();
});
