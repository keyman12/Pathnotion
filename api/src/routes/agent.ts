import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/client.js';

export const agentRouter = Router();

agentRouter.get('/conversations', async (_req, res) => {
  const rows = await db.select().from(schema.agentMessages).orderBy(desc(schema.agentMessages.createdAt)).limit(50);
  res.json(rows.reverse());
});

const messageSchema = z.object({ text: z.string().min(1) });

agentRouter.post('/message', async (req, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  await db.insert(schema.agentMessages).values({ role: 'user', text: parsed.data.text });

  // For v1: a stub, non-streaming echo. Real streaming via SSE lives in services/jeff.ts.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const tokens = "On it. I'll draft a proposal and flag the diff for your review.".split(' ');
  let full = '';
  for (const t of tokens) {
    full += (full ? ' ' : '') + t;
    res.write(`data: ${JSON.stringify({ delta: (full === t ? '' : ' ') + t })}\n\n`);
    await new Promise((r) => setTimeout(r, 40));
  }
  await db.insert(schema.agentMessages).values({ role: 'agent', text: full });
  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

agentRouter.get('/schedule', async (_req, res) => {
  const rows = await db.select().from(schema.agentJobs);
  res.json(rows);
});

agentRouter.patch('/schedule/:jobId', async (req, res) => {
  const body = z.object({ enabled: z.boolean().optional(), schedule: z.string().optional() }).safeParse(req.body);
  if (!body.success) return res.status(400).json(body.error.flatten());
  const [row] = await db.update(schema.agentJobs).set(body.data).where(eq(schema.agentJobs.id, req.params.jobId)).returning();
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

agentRouter.get('/runs', async (_req, res) => {
  const rows = await db.select().from(schema.agentRuns).orderBy(desc(schema.agentRuns.ranAt)).limit(100);
  res.json(rows);
});

agentRouter.get('/access', async (_req, res) => {
  const rows = await db.select().from(schema.accessGrants);
  res.json(rows);
});

agentRouter.patch('/access', async (req, res) => {
  const body = z.object({
    module: z.enum(['calendar', 'docs', 'backlog', 'tasks']),
    read: z.boolean().optional(),
    write: z.boolean().optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json(body.error.flatten());
  const [row] = await db
    .update(schema.accessGrants)
    .set({ read: body.data.read, write: body.data.write, lastTouchedAt: new Date() })
    .where(eq(schema.accessGrants.module, body.data.module))
    .returning();
  res.json(row);
});
