import { Router } from 'express';
import { db } from '../db/client.js';

export const productsRouter = Router();

productsRouter.get('/', (_req, res) => {
  const rows = db.prepare(`
    SELECT p.id,
           p.label,
           p.color,
           p.accent,
           p.sort_order AS sortOrder,
           (SELECT COUNT(*) FROM backlog_items WHERE product_id = p.id) AS count
    FROM products p
    ORDER BY p.sort_order
  `).all();
  res.json(rows);
});
