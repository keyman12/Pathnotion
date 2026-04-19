import { Router } from 'express';
import { db } from '../db/client.js';

export const docsRouter = Router();

const SELECT_DOC = `
  SELECT id,
         slug,
         title,
         root,
         product_id AS product,
         group_name AS "group",
         size_label AS size,
         tags,
         created_by AS createdBy,
         updated_by AS updatedBy,
         updated
  FROM docs
`;

docsRouter.get('/tree', (req, res) => {
  const root = (req.query.root as string) || 'product';
  const rows = db.prepare(SELECT_DOC + ' WHERE root = ? ORDER BY updated_at DESC').all(root) as Array<{ tags: string | null }>;
  res.json(rows.map((r) => ({ ...r, tags: r.tags ? JSON.parse(r.tags) : [] })));
});

docsRouter.get('/:id', (req, res) => {
  const doc = db.prepare(SELECT_DOC + ' WHERE id = ?').get(req.params.id) as any;
  if (!doc) return res.status(404).json({ error: 'Not found' });
  const blocks = db.prepare('SELECT data FROM doc_blocks WHERE doc_id = ? ORDER BY sort_order').all(req.params.id) as Array<{ data: string }>;
  res.json({
    ...doc,
    tags: doc.tags ? JSON.parse(doc.tags) : [],
    blocks: blocks.map((b) => JSON.parse(b.data)),
  });
});

docsRouter.patch('/:id', (req, res) => {
  const { title, blocks } = req.body as { title?: string; blocks?: unknown[] };
  const run = db.transaction(() => {
    if (title) {
      db.prepare("UPDATE docs SET title = ?, updated_at = datetime('now') WHERE id = ?").run(title, req.params.id);
    }
    if (Array.isArray(blocks)) {
      db.prepare('DELETE FROM doc_blocks WHERE doc_id = ?').run(req.params.id);
      const insert = db.prepare('INSERT INTO doc_blocks (doc_id, sort_order, type, data) VALUES (?, ?, ?, ?)');
      for (const [i, b] of blocks.entries()) {
        const type = (b as any)?.type ?? 'p';
        insert.run(req.params.id, i, type, JSON.stringify(b));
      }
    }
  });
  run();
  res.status(204).send();
});

docsRouter.post('/:id/attachments', (_req, res) => {
  res.status(501).json({ error: 'Attachments upload wire-up pending' });
});
