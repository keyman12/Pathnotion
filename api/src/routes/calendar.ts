import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client.js';

export const calendarRouter = Router();

const SELECT_EVENT = `
  SELECT id,
         title,
         day_of_week AS day,
         start_hour AS start,
         end_hour AS end,
         who,
         kind,
         flag,
         source
  FROM calendar_events
`;

calendarRouter.get('/events', (_req, res) => {
  const rows = db.prepare(SELECT_EVENT + ' ORDER BY day_of_week, start_hour').all();
  res.json(rows);
});

const createSchema = z.object({
  title: z.string().min(1),
  who: z.enum(['D', 'R', 'SHARED']),
  kind: z.enum(['shared', 'meet', 'deep', 'personal']).optional(),
  day: z.number().int().min(0).max(6),
  start: z.number(),
  end: z.number(),
  flag: z.string().nullish(),
});

calendarRouter.post('/events', (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const info = db.prepare(`
    INSERT INTO calendar_events (title, day_of_week, start_hour, end_hour, who, kind, flag, source)
    VALUES (@title, @day, @start, @end, @who, @kind, @flag, 'local')
  `).run({
    title: parsed.data.title,
    day: parsed.data.day,
    start: parsed.data.start,
    end: parsed.data.end,
    who: parsed.data.who,
    kind: parsed.data.kind ?? null,
    flag: parsed.data.flag ?? null,
  });
  const row = db.prepare(SELECT_EVENT + ' WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

const patchSchema = z.object({
  title: z.string().optional(),
  who: z.enum(['D', 'R', 'SHARED']).optional(),
  kind: z.enum(['shared', 'meet', 'deep', 'personal']).nullish(),
  day: z.number().int().min(0).max(6).optional(),
  start: z.number().optional(),
  end: z.number().optional(),
  flag: z.string().nullish(),
});

calendarRouter.patch('/events/:id', (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const sets: string[] = [];
  const params: Record<string, unknown> = { id: req.params.id };
  const map: Record<string, string> = {
    title: 'title = @title',
    who: 'who = @who',
    kind: 'kind = @kind',
    day: 'day_of_week = @day',
    start: 'start_hour = @start',
    end: 'end_hour = @end',
    flag: 'flag = @flag',
  };
  for (const [k, sql] of Object.entries(map)) {
    const v = (parsed.data as any)[k];
    if (v !== undefined) { sets.push(sql); params[k] = v; }
  }
  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
  const result = db.prepare(`UPDATE calendar_events SET ${sets.join(', ')} WHERE id = @id`).run(params);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  const row = db.prepare(SELECT_EVENT + ' WHERE id = ?').get(req.params.id);
  res.json(row);
});

calendarRouter.delete('/events/:id', (req, res) => {
  const result = db.prepare('DELETE FROM calendar_events WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

calendarRouter.post('/sync', (_req, res) => {
  // CalDAV adapter stub — returns immediately.
  res.json({ ok: true, queued: 0 });
});
