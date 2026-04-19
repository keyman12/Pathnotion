import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client.js';

export const agentRouter = Router();

agentRouter.get('/conversations', (_req, res) => {
  const rows = db.prepare(`
    SELECT id, role, text, actions, created_at AS createdAt
    FROM agent_messages
    ORDER BY id DESC
    LIMIT 50
  `).all() as Array<{ actions: string | null }>;
  res.json(rows
    .map((r: any) => ({ ...r, actions: r.actions ? JSON.parse(r.actions) : null }))
    .reverse());
});

const messageSchema = z.object({ text: z.string().min(1) });

agentRouter.post('/message', async (req, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  db.prepare("INSERT INTO agent_messages (role, text) VALUES ('user', ?)").run(parsed.data.text);

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
  db.prepare("INSERT INTO agent_messages (role, text) VALUES ('agent', ?)").run(full);
  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

agentRouter.get('/schedule', (_req, res) => {
  const rows = db.prepare(`
    SELECT id, name, schedule, enabled, description, last_run_at AS lastRunAt
    FROM agent_jobs
  `).all() as Array<{ enabled: number }>;
  res.json(rows.map((r: any) => ({ ...r, enabled: Boolean(r.enabled) })));
});

agentRouter.patch('/schedule/:jobId', (req, res) => {
  const body = z.object({ enabled: z.boolean().optional(), schedule: z.string().optional() }).safeParse(req.body);
  if (!body.success) return res.status(400).json(body.error.flatten());
  const sets: string[] = [];
  const params: Record<string, unknown> = { id: req.params.jobId };
  if (body.data.enabled !== undefined) { sets.push('enabled = @enabled'); params.enabled = body.data.enabled ? 1 : 0; }
  if (body.data.schedule !== undefined) { sets.push('schedule = @schedule'); params.schedule = body.data.schedule; }
  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
  const result = db.prepare(`UPDATE agent_jobs SET ${sets.join(', ')} WHERE id = @id`).run(params);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

agentRouter.get('/runs', (_req, res) => {
  const rows = db.prepare(`
    SELECT id, job_id AS jobId, status, summary, changes, diff, ran_at AS ranAt
    FROM agent_runs
    ORDER BY ran_at DESC
    LIMIT 100
  `).all() as Array<{ diff: string | null }>;
  res.json(rows.map((r: any) => ({ ...r, diff: r.diff ? JSON.parse(r.diff) : null })));
});

agentRouter.get('/access', (_req, res) => {
  const rows = db.prepare(`
    SELECT module, can_read AS "read", can_write AS "write", last_touched AS lastTouched
    FROM access_grants
  `).all() as Array<{ read: number; write: number }>;
  res.json(rows.map((r: any) => ({ ...r, read: Boolean(r.read), write: Boolean(r.write) })));
});

agentRouter.patch('/access', (req, res) => {
  const body = z.object({
    module: z.enum(['calendar', 'docs', 'backlog', 'tasks']),
    read: z.boolean().optional(),
    write: z.boolean().optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json(body.error.flatten());
  const sets: string[] = [];
  const params: Record<string, unknown> = { module: body.data.module };
  if (body.data.read !== undefined) { sets.push('can_read = @read'); params.read = body.data.read ? 1 : 0; }
  if (body.data.write !== undefined) { sets.push('can_write = @write'); params.write = body.data.write ? 1 : 0; }
  sets.push("last_touched = datetime('now')");
  const result = db.prepare(`UPDATE access_grants SET ${sets.join(', ')} WHERE module = @module`).run(params);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});
