import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client.js';
import { requireAdmin } from '../middleware/auth.js';

export const productsRouter = Router();

const SELECT = `
  SELECT p.id,
         p.label,
         p.color,
         p.accent,
         p.sort_order AS sortOrder,
         (SELECT COUNT(*) FROM backlog_items WHERE product_id = p.id) AS count
  FROM products p
`;

productsRouter.get('/', (_req, res) => {
  res.json(db.prepare(SELECT + ' ORDER BY p.sort_order').all());
});

const createSchema = z.object({
  id: z.string().min(1).max(24).regex(/^[a-z0-9-]+$/, 'lowercase, digits, hyphens only'),
  label: z.string().min(1),
  color: z.string().min(1),
  accent: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

productsRouter.post('/', requireAdmin, (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const maxOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS n FROM products').get() as { n: number }).n;
  try {
    db.prepare(`
      INSERT INTO products (id, label, color, accent, sort_order)
      VALUES (@id, @label, @color, @accent, @sortOrder)
    `).run({
      id: parsed.data.id,
      label: parsed.data.label,
      color: parsed.data.color,
      accent: parsed.data.accent ?? parsed.data.color,
      sortOrder: parsed.data.sortOrder ?? maxOrder + 1,
    });
    const row = db.prepare(SELECT + ' WHERE p.id = ?').get(parsed.data.id);
    res.status(201).json(row);
  } catch (err: any) {
    if (String(err.code).startsWith('SQLITE_CONSTRAINT')) {
      return res.status(409).json({ error: 'ID already exists' });
    }
    throw err;
  }
});

const patchSchema = z.object({
  label: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
  accent: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

productsRouter.patch('/:id', requireAdmin, (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const sets: string[] = [];
  const params: Record<string, unknown> = { id: req.params.id };
  if (parsed.data.label !== undefined) { sets.push('label = @label'); params.label = parsed.data.label; }
  if (parsed.data.color !== undefined) { sets.push('color = @color'); params.color = parsed.data.color; }
  if (parsed.data.accent !== undefined) { sets.push('accent = @accent'); params.accent = parsed.data.accent; }
  if (parsed.data.sortOrder !== undefined) { sets.push('sort_order = @sortOrder'); params.sortOrder = parsed.data.sortOrder; }
  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
  const result = db.prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = @id`).run(params);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  const row = db.prepare(SELECT + ' WHERE p.id = ?').get(req.params.id);
  res.json(row);
});

productsRouter.delete('/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});
