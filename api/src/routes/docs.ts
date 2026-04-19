import { Router } from 'express';
import { and, asc, eq } from 'drizzle-orm';
import { db, schema } from '../db/client.js';

export const docsRouter = Router();

docsRouter.get('/tree', async (req, res) => {
  const root = (req.query.root as string) || 'product';
  const rows = await db
    .select()
    .from(schema.docs)
    .where(eq(schema.docs.root, root));
  res.json(rows);
});

docsRouter.get('/:id', async (req, res) => {
  const [doc] = await db.select().from(schema.docs).where(eq(schema.docs.id, req.params.id));
  if (!doc) return res.status(404).json({ error: 'Not found' });
  const blocks = await db
    .select()
    .from(schema.docBlocks)
    .where(eq(schema.docBlocks.docId, doc.id))
    .orderBy(asc(schema.docBlocks.sortOrder));
  res.json({ ...doc, blocks: blocks.map((b) => b.data) });
});

docsRouter.patch('/:id', async (req, res) => {
  const { title, blocks } = req.body as { title?: string; blocks?: unknown[] };
  if (title) {
    await db.update(schema.docs).set({ title, updatedAt: new Date() }).where(eq(schema.docs.id, req.params.id));
  }
  if (Array.isArray(blocks)) {
    await db.delete(schema.docBlocks).where(eq(schema.docBlocks.docId, req.params.id));
    for (const [i, b] of blocks.entries()) {
      await db.insert(schema.docBlocks).values({ docId: req.params.id, sortOrder: i, data: b as any });
    }
  }
  res.status(204).send();
});

docsRouter.post('/:id/attachments', async (_req, res) => {
  // Stub — wire to S3 presigned uploads.
  res.status(501).json({ error: 'Attachments upload wire-up pending' });
});
