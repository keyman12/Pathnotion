import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client.js';
import { requireAdmin } from '../middleware/auth.js';

export const businessCategoriesRouter = Router();

const SELECT = `
  SELECT id, label, icon, sort_order AS sortOrder
  FROM business_categories
  ORDER BY sort_order, id
`;

businessCategoriesRouter.get('/', (_req, res) => {
  res.json(db.prepare(SELECT).all());
});

const createSchema = z.object({
  id: z.string().min(1).max(24).regex(/^[a-z0-9-]+$/, 'lowercase, digits, hyphens only'),
  label: z.string().min(1),
  icon: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

businessCategoriesRouter.post('/', requireAdmin, (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const maxOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS n FROM business_categories').get() as { n: number }).n;
  try {
    db.prepare(`
      INSERT INTO business_categories (id, label, icon, sort_order)
      VALUES (@id, @label, @icon, @sortOrder)
    `).run({
      id: parsed.data.id,
      label: parsed.data.label,
      icon: parsed.data.icon ?? 'money',
      sortOrder: parsed.data.sortOrder ?? maxOrder + 1,
    });
    const row = db.prepare('SELECT id, label, icon, sort_order AS sortOrder FROM business_categories WHERE id = ?').get(parsed.data.id);
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
  icon: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

businessCategoriesRouter.patch('/:id', requireAdmin, (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const sets: string[] = [];
  const params: Record<string, unknown> = { id: req.params.id };
  if (parsed.data.label !== undefined) { sets.push('label = @label'); params.label = parsed.data.label; }
  if (parsed.data.icon !== undefined) { sets.push('icon = @icon'); params.icon = parsed.data.icon; }
  if (parsed.data.sortOrder !== undefined) { sets.push('sort_order = @sortOrder'); params.sortOrder = parsed.data.sortOrder; }
  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
  const result = db.prepare(`UPDATE business_categories SET ${sets.join(', ')} WHERE id = @id`).run(params);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  const row = db.prepare('SELECT id, label, icon, sort_order AS sortOrder FROM business_categories WHERE id = ?').get(req.params.id);
  res.json(row);
});

businessCategoriesRouter.delete('/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM business_categories WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});
