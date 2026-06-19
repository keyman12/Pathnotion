import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';

export const reportsRouter = Router();

// Bearer-token auth for the external ingest endpoint (the daily Mac job). This is deliberately
// separate from session auth: the job has no browser session, it presents REPORTS_INGEST_TOKEN.
function requireIngestToken(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.REPORTS_INGEST_TOKEN;
  if (!expected) {
    res.status(503).json({ error: 'reports ingest not configured (REPORTS_INGEST_TOKEN unset)' });
    return;
  }
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token !== expected) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}

// POST /api/reports — ingest (upsert) one day's report. Token-authed.
reportsRouter.post('/', requireIngestToken, (req: Request, res: Response): void => {
  const { date, title, html, summary, counts, dataJson } = req.body ?? {};
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    return;
  }
  if (typeof html !== 'string' || !html.trim()) {
    res.status(400).json({ error: 'html is required' });
    return;
  }
  const countsStr = counts != null ? JSON.stringify(counts) : null;
  const dataStr =
    dataJson != null ? (typeof dataJson === 'string' ? dataJson : JSON.stringify(dataJson)) : null;
  db.prepare(`
    INSERT INTO reports (date, title, html, summary, counts, data_json, updated_at)
    VALUES (@date, @title, @html, @summary, @counts, @dataJson, datetime('now'))
    ON CONFLICT(date) DO UPDATE SET
      title=excluded.title, html=excluded.html, summary=excluded.summary,
      counts=excluded.counts, data_json=excluded.data_json, updated_at=datetime('now')
  `).run({
    date,
    title: typeof title === 'string' && title.trim() ? title : `UK Payment Providers — ${date}`,
    html,
    summary: typeof summary === 'string' ? summary : null,
    counts: countsStr,
    dataJson: dataStr,
  });
  res.json({ ok: true, date });
});

// GET /api/reports — the archive list (metadata only, newest first). Session-authed.
reportsRouter.get('/', requireAuth, (_req: Request, res: Response): void => {
  const rows = db
    .prepare(`SELECT date, title, summary, counts, created_at, updated_at FROM reports ORDER BY date DESC`)
    .all() as Array<{ counts: string | null }>;
  res.json(
    rows.map((r) => ({ ...r, counts: r.counts ? JSON.parse(r.counts) : null })),
  );
});

// GET /api/reports/latest — newest report's metadata (for the main-page card). Session-authed.
reportsRouter.get('/latest', requireAuth, (_req: Request, res: Response): void => {
  const row = db
    .prepare(`SELECT date, title, summary, counts FROM reports ORDER BY date DESC LIMIT 1`)
    .get() as { counts: string | null } | undefined;
  if (!row) {
    res.status(404).json({ error: 'no reports yet' });
    return;
  }
  res.json({ ...row, counts: row.counts ? JSON.parse(row.counts) : null });
});

// GET /api/reports/:date/html — the stored report HTML, served for a sandboxed iframe. Session-authed.
reportsRouter.get('/:date/html', requireAuth, (req: Request, res: Response): void => {
  const row = db.prepare(`SELECT html FROM reports WHERE date = ?`).get(req.params.date) as
    | { html: string }
    | undefined;
  if (!row) {
    res.status(404).send('Report not found');
    return;
  }
  // The HTML contains scraped third-party text. The frontend loads it in an iframe with
  // sandbox="allow-scripts" (no allow-same-origin), so it cannot reach the app, cookies, or
  // same-origin APIs even if a stray script ran. nosniff + the sandbox attribute are the controls.
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('X-Content-Type-Options', 'nosniff');
  res.send(row.html);
});
