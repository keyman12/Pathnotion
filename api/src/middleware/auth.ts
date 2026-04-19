import type { NextFunction, Request, Response } from 'express';

declare module 'express-session' {
  interface SessionData {
    userId?: number;
    userKey?: string;
    role?: 'admin' | 'member';
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) return res.status(401).json({ error: 'Unauthorized' });
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  next();
}
