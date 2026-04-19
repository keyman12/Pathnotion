import { Store, SessionData } from 'express-session';
import { db } from '../db/client.js';

// Minimal express-session store backed by the app's SQLite connection.
// No extra deps; uses the sessions table defined in schema.sql.
export class SqliteSessionStore extends Store {
  private getStmt = db.prepare('SELECT sess, expire FROM sessions WHERE sid = ?');
  private setStmt = db.prepare('INSERT OR REPLACE INTO sessions (sid, sess, expire) VALUES (?, ?, ?)');
  private delStmt = db.prepare('DELETE FROM sessions WHERE sid = ?');
  private touchStmt = db.prepare('UPDATE sessions SET expire = ? WHERE sid = ?');
  private cleanupStmt = db.prepare('DELETE FROM sessions WHERE expire < ?');

  constructor() {
    super();
    setInterval(() => this.cleanupStmt.run(nowSec()), 60_000).unref?.();
  }

  get(sid: string, cb: (err?: any, session?: SessionData | null) => void): void {
    try {
      const row = this.getStmt.get(sid) as { sess: string; expire: number } | undefined;
      if (!row) return cb(null, null);
      if (row.expire < nowSec()) { this.delStmt.run(sid); return cb(null, null); }
      cb(null, JSON.parse(row.sess));
    } catch (err) { cb(err); }
  }

  set(sid: string, session: SessionData, cb?: (err?: any) => void): void {
    try {
      const expire = expireFor(session);
      this.setStmt.run(sid, JSON.stringify(session), expire);
      cb?.();
    } catch (err) { cb?.(err); }
  }

  destroy(sid: string, cb?: (err?: any) => void): void {
    try { this.delStmt.run(sid); cb?.(); } catch (err) { cb?.(err); }
  }

  touch(sid: string, session: SessionData, cb?: () => void): void {
    try { this.touchStmt.run(expireFor(session), sid); } catch {}
    cb?.();
  }
}

function nowSec(): number { return Math.floor(Date.now() / 1000); }

function expireFor(session: SessionData): number {
  const maxAgeMs = session.cookie?.maxAge ?? 30 * 24 * 60 * 60 * 1000;
  return nowSec() + Math.floor(maxAgeMs / 1000);
}
