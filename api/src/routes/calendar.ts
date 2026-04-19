import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/client.js';

export const calendarRouter = Router();

calendarRouter.get('/events', async (_req, res) => {
  const rows = await db.select().from(schema.calendarEvents);
  res.json(rows.map((r) => ({
    id: r.id,
    day: r.dayOfWeek,
    start: r.startHour,
    end: r.endHour,
    title: r.title,
    who: r.who,
    kind: r.kind,
    flag: r.flag ?? undefined,
  })));
});

const createSchema = z.object({
  title: z.string().min(1),
  who: z.enum(['D', 'R', 'SHARED']),
  kind: z.enum(['shared', 'meet', 'deep', 'personal']),
  dayOfWeek: z.number().int().min(0).max(6),
  startHour: z.number(),
  endHour: z.number(),
});

calendarRouter.post('/events', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const [row] = await db.insert(schema.calendarEvents).values(parsed.data).returning();
  res.status(201).json(row);
});

calendarRouter.post('/sync', async (_req, res) => {
  // Stub — CalDAV adapter lives in services/caldav.ts. Returns immediately for now.
  res.json({ ok: true, queued: 0 });
});
