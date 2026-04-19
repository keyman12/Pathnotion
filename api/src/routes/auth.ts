import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { db } from '../db/client.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

const SELECT_USER_PUBLIC = `
  SELECT id, key, username, display_name AS displayName, email, role, color
  FROM users
`;

authRouter.get('/me', (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Unauthorized' });
  const row = db.prepare(SELECT_USER_PUBLIC + ' WHERE id = ?').get(req.session.userId);
  if (!row) { req.session.destroy(() => {}); return res.status(401).json({ error: 'Unauthorized' }); }
  res.json(row);
});

const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const user = db.prepare(`
    SELECT id, key, username, display_name AS displayName, email, password_hash AS passwordHash, role, color
    FROM users
    WHERE username = ?
  `).get(parsed.data.username) as
    | { id: number; key: string; username: string; displayName: string; email: string | null; passwordHash: string; role: 'admin' | 'member'; color: string | null }
    | undefined;

  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  req.session.userId = user.id;
  req.session.userKey = user.key;
  req.session.role = user.role;

  const { passwordHash: _ph, ...publicUser } = user;
  res.json(publicUser);
});

authRouter.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Could not end session' });
    res.clearCookie('pn.sid');
    res.status(204).send();
  });
});

// Admin: user management
authRouter.get('/users', requireAdmin, (_req, res) => {
  const rows = db.prepare(SELECT_USER_PUBLIC + ' ORDER BY id').all();
  res.json(rows);
});

const createUserSchema = z.object({
  key: z.string().min(1).max(8),
  username: z.string().min(1),
  displayName: z.string().min(1),
  email: z.string().email().nullish(),
  password: z.string().min(8),
  role: z.enum(['admin', 'member']).default('member'),
  color: z.string().nullish(),
});

authRouter.post('/users', requireAdmin, async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const hash = await bcrypt.hash(parsed.data.password, 10);
  try {
    const info = db.prepare(`
      INSERT INTO users (key, username, display_name, email, password_hash, role, color)
      VALUES (@key, @username, @displayName, @email, @hash, @role, @color)
    `).run({
      key: parsed.data.key,
      username: parsed.data.username,
      displayName: parsed.data.displayName,
      email: parsed.data.email ?? null,
      hash,
      role: parsed.data.role,
      color: parsed.data.color ?? null,
    });
    const row = db.prepare(SELECT_USER_PUBLIC + ' WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (err: any) {
    if (String(err.code).startsWith('SQLITE_CONSTRAINT')) {
      return res.status(409).json({ error: 'Username or key already exists' });
    }
    throw err;
  }
});

const patchUserSchema = z.object({
  displayName: z.string().optional(),
  email: z.string().email().nullish(),
  role: z.enum(['admin', 'member']).optional(),
  color: z.string().nullish(),
});

authRouter.patch('/users/:id', requireAdmin, (req, res) => {
  const parsed = patchUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const sets: string[] = [];
  const params: Record<string, unknown> = { id: req.params.id };
  if (parsed.data.displayName !== undefined) { sets.push('display_name = @displayName'); params.displayName = parsed.data.displayName; }
  if (parsed.data.email !== undefined) { sets.push('email = @email'); params.email = parsed.data.email; }
  if (parsed.data.role !== undefined) { sets.push('role = @role'); params.role = parsed.data.role; }
  if (parsed.data.color !== undefined) { sets.push('color = @color'); params.color = parsed.data.color; }
  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
  const result = db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = @id`).run(params);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  const row = db.prepare(SELECT_USER_PUBLIC + ' WHERE id = ?').get(req.params.id);
  res.json(row);
});

authRouter.post('/users/:id/reset-password', requireAdmin, async (req, res) => {
  const parsed = z.object({ password: z.string().min(8) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const hash = await bcrypt.hash(parsed.data.password, 10);
  const result = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

// Self: change own password
authRouter.post('/change-password', requireAuth, async (req, res) => {
  const parsed = z.object({
    current: z.string().min(1),
    next: z.string().min(8),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.session.userId!) as { password_hash: string } | undefined;
  if (!row) return res.status(401).json({ error: 'Unauthorized' });

  const ok = await bcrypt.compare(parsed.data.current, row.password_hash);
  if (!ok) return res.status(403).json({ error: 'Current password is incorrect' });

  const hash = await bcrypt.hash(parsed.data.next, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.session.userId!);
  res.status(204).send();
});
