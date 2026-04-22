import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
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
         drive_folder_id AS driveFolderId,
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

// Articles are PathNotion-native docs that point at a Drive folder (or float unassigned).
// This endpoint powers the Drive-browse view's merged folder listing + the "All articles" virtual view.
docsRouter.get('/articles', (req, res) => {
  const folder = typeof req.query.folder === 'string' ? req.query.folder : null;
  let rows;
  if (folder === '__all__' || !folder) {
    rows = db.prepare(SELECT_DOC + ' ORDER BY updated_at DESC').all() as Array<{ tags: string | null }>;
  } else {
    rows = db.prepare(SELECT_DOC + ' WHERE drive_folder_id = ? ORDER BY updated_at DESC').all(folder) as Array<{ tags: string | null }>;
  }
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

const rootSchema = z.enum(['product', 'finance', 'sales', 'legal']);

const createSchema = z.object({
  title: z.string().min(1).max(200),
  root: rootSchema.optional(),
  product: z.string().nullish(),
  group: z.string().nullish(),
  tags: z.array(z.string()).optional(),
  driveFolderId: z.string().nullish(),
});

docsRouter.post('/', (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const id = `doc_${randomUUID().slice(0, 8)}`;
  const me = (req as any).session?.userKey ?? null;

  db.prepare(`
    INSERT INTO docs (id, title, root, product_id, group_name, size_label, tags, drive_folder_id, created_by, updated_by, updated)
    VALUES (@id, @title, @root, @product, @group, @size, @tags, @driveFolderId, @by, @by, 'just now')
  `).run({
    id,
    title: parsed.data.title,
    // When placed inside a Drive folder, `root` is optional — default to 'product' if not given.
    root: parsed.data.root ?? 'product',
    product: parsed.data.product ?? null,
    group: parsed.data.group ?? null,
    size: '1 min',
    tags: JSON.stringify(parsed.data.tags ?? []),
    driveFolderId: parsed.data.driveFolderId ?? null,
    by: me,
  });

  // Seed one empty paragraph block so the editor has something to place the cursor in.
  db.prepare('INSERT INTO doc_blocks (doc_id, sort_order, type, data) VALUES (?, 0, ?, ?)').run(
    id,
    'p',
    JSON.stringify({ type: 'p', text: '' }),
  );

  const doc = db.prepare(SELECT_DOC + ' WHERE id = ?').get(id) as any;
  res.status(201).json({
    ...doc,
    tags: doc.tags ? JSON.parse(doc.tags) : [],
    blocks: [{ type: 'p', text: '' }],
  });
});

docsRouter.patch('/:id', (req, res) => {
  const { title, blocks, driveFolderId } = req.body as { title?: string; blocks?: unknown[]; driveFolderId?: string | null };
  const run = db.transaction(() => {
    if (title) {
      db.prepare("UPDATE docs SET title = ?, updated_at = datetime('now') WHERE id = ?").run(title, req.params.id);
    }
    if (driveFolderId !== undefined) {
      db.prepare("UPDATE docs SET drive_folder_id = ?, updated_at = datetime('now') WHERE id = ?").run(driveFolderId ?? null, req.params.id);
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

docsRouter.delete('/:id', (req, res) => {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM doc_blocks WHERE doc_id = ?').run(req.params.id);
    const result = db.prepare('DELETE FROM docs WHERE id = ?').run(req.params.id);
    if (!result.changes) throw Object.assign(new Error('Not found'), { status: 404 });
  });
  try { tx(); res.status(204).send(); }
  catch (err: any) { res.status(err.status ?? 500).json({ error: err.message ?? 'Server error' }); }
});

docsRouter.post('/:id/attachments', (_req, res) => {
  res.status(501).json({ error: 'Attachments upload wire-up pending' });
});
