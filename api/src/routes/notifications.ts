import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/client.js';
import { sendDigestToUser } from '../services/daily-digest.js';

export const notificationsRouter = Router();

const DEFAULT_SECTIONS = { meetings: true, overdue: true, tasks: true, upcoming: true };

function ensurePrefs(userId: number) {
  db.prepare(`
    INSERT INTO notification_prefs (user_id, enabled, delivery_time, sections)
    VALUES (?, 1, '07:00', ?)
    ON CONFLICT(user_id) DO NOTHING
  `).run(userId, JSON.stringify(DEFAULT_SECTIONS));
}

function getPrefs(userId: number) {
  const row = db.prepare(`
    SELECT enabled, delivery_time AS deliveryTime, sections, last_sent_date AS lastSentDate, updated_at AS updatedAt
    FROM notification_prefs
    WHERE user_id = ?
  `).get(userId) as { enabled: number; deliveryTime: string; sections: string; lastSentDate: string | null; updatedAt: string } | undefined;
  if (!row) return null;
  let sections = DEFAULT_SECTIONS;
  try { sections = { ...DEFAULT_SECTIONS, ...JSON.parse(row.sections) }; } catch { /* ignore */ }
  return { enabled: !!row.enabled, deliveryTime: row.deliveryTime, sections, lastSentDate: row.lastSentDate, updatedAt: row.updatedAt };
}

notificationsRouter.get('/prefs', (req, res) => {
  const userId = req.session.userId!;
  ensurePrefs(userId);
  res.json(getPrefs(userId));
});

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  deliveryTime: z.string().regex(/^\d{2}:\d{2}$/, 'HH:MM').optional(),
  sections: z.object({
    meetings: z.boolean().optional(),
    overdue: z.boolean().optional(),
    tasks: z.boolean().optional(),
    upcoming: z.boolean().optional(),
  }).optional(),
});

notificationsRouter.patch('/prefs', (req, res) => {
  const userId = req.session.userId!;
  ensurePrefs(userId);
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const sets: string[] = [];
  const params: Record<string, unknown> = { userId };
  if (parsed.data.enabled !== undefined) { sets.push('enabled = @enabled'); params.enabled = parsed.data.enabled ? 1 : 0; }
  if (parsed.data.deliveryTime !== undefined) { sets.push('delivery_time = @deliveryTime'); params.deliveryTime = parsed.data.deliveryTime; }
  if (parsed.data.sections !== undefined) {
    const current = getPrefs(userId);
    const merged = { ...(current?.sections ?? DEFAULT_SECTIONS), ...parsed.data.sections };
    sets.push('sections = @sections');
    params.sections = JSON.stringify(merged);
  }
  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
  sets.push("updated_at = datetime('now')");
  db.prepare(`UPDATE notification_prefs SET ${sets.join(', ')} WHERE user_id = @userId`).run(params);
  res.json(getPrefs(userId));
});

notificationsRouter.post('/send-test', async (req, res) => {
  const userId = req.session.userId!;
  const result = await sendDigestToUser(userId);
  if (result.ok) return res.json({ ok: true });
  res.status(400).json({ error: result.reason });
});
