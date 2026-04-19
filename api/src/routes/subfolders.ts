import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client.js';

export const subfoldersRouter = Router();

const SELECT = `
  SELECT id, product_id AS productId, name, sort_order AS sortOrder
  FROM subfolders
`;

subfoldersRouter.get('/', (req, res) => {
  const product = req.query.product;
  if (typeof product === 'string' && product) {
    res.json(db.prepare(SELECT + ' WHERE product_id = ? ORDER BY sort_order, name').all(product));
  } else {
    res.json(db.prepare(SELECT + ' ORDER BY product_id, sort_order, name').all());
  }
});

const createSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1),
  sortOrder: z.number().int().optional(),
});

subfoldersRouter.post('/', (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const maxOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS n FROM subfolders WHERE product_id = ?').get(parsed.data.productId) as { n: number }).n;
  const info = db.prepare(`
    INSERT INTO subfolders (product_id, name, sort_order)
    VALUES (@productId, @name, @sortOrder)
  `).run({
    productId: parsed.data.productId,
    name: parsed.data.name,
    sortOrder: parsed.data.sortOrder ?? maxOrder + 1,
  });
  const row = db.prepare(SELECT + ' WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
});

subfoldersRouter.patch('/:id', (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const sets: string[] = [];
  const params: Record<string, unknown> = { id: req.params.id };
  if (parsed.data.name !== undefined) { sets.push('name = @name'); params.name = parsed.data.name; }
  if (parsed.data.sortOrder !== undefined) { sets.push('sort_order = @sortOrder'); params.sortOrder = parsed.data.sortOrder; }
  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
  const result = db.prepare(`UPDATE subfolders SET ${sets.join(', ')} WHERE id = @id`).run(params);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  const row = db.prepare(SELECT + ' WHERE id = ?').get(req.params.id);
  res.json(row);
});

subfoldersRouter.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM subfolders WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});
