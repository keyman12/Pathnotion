// Let .env win over the parent shell. Some environments (Claude Code, some CI runners)
// pre-set ANTHROPIC_API_KEY to an empty string as a safety measure — without `override`
// dotenv silently leaves those empties in place and Jeff sees "key not set".
import dotenv from 'dotenv';
dotenv.config({ override: true });
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SqliteSessionStore } from './middleware/session-store.js';
import { requireAuth } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { backlogRouter } from './routes/backlog.js';
import { tasksRouter } from './routes/tasks.js';
import { calendarRouter } from './routes/calendar.js';
import { docsRouter } from './routes/docs.js';
import { agentRouter } from './routes/agent.js';
import { productsRouter } from './routes/products.js';
import { businessCategoriesRouter } from './routes/business-categories.js';
import { driveRouter } from './routes/drive.js';
import { notificationsRouter } from './routes/notifications.js';
import { startDigestScheduler } from './services/daily-digest.js';
import { startCalendarSyncScheduler } from './services/calendar-sync.js';
import { startScheduler as startJeffScheduler } from './services/jeff-scheduler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

const isProd = process.env.NODE_ENV === 'production';
// In dev Vite runs on 5173 and needs cross-origin with credentials. In prod nginx proxies both
// /api/* and the static bundle from one hostname, so there's no cross-origin and no CORS needed.
const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';

app.set('trust proxy', 1);
if (!isProd) {
  app.use(cors({ origin: webOrigin, credentials: true }));
}
app.use(express.json({ limit: '2mb' }));

app.use(session({
  name: 'pn.sid',
  store: new SqliteSessionStore(),
  secret: process.env.SESSION_SECRET ?? 'dev-only-replace-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
}));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);

// All data routes require an authenticated session
app.use('/api/products', requireAuth, productsRouter);
app.use('/api/backlog', requireAuth, backlogRouter);
app.use('/api/tasks', requireAuth, tasksRouter);
app.use('/api/calendar', requireAuth, calendarRouter);
app.use('/api/docs', requireAuth, docsRouter);
app.use('/api/agent', requireAuth, agentRouter);
app.use('/api/business-categories', requireAuth, businessCategoriesRouter);
app.use('/api/drive', requireAuth, driveRouter);
app.use('/api/notifications', requireAuth, notificationsRouter);

// In prod, serve the built web bundle from this same server. Nginx proxies everything to us
// on one upstream, which keeps the deploy story simple (one process, one nginx location).
// Dev runs Vite separately on :5173 so this block is skipped.
if (isProd) {
  const webDist = path.resolve(__dirname, '../../web/dist');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    // SPA fallback — any unmatched route that isn't an /api/* call returns index.html so the
    // client router can take over.
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(webDist, 'index.html'));
    });
  } else {
    console.warn(`[pathnotion] web/dist not found at ${webDist} — static serving disabled.`);
  }
}

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal error' });
});

const port = Number(process.env.PORT ?? 4000);
// 127.0.0.1 in prod (nginx is the public face). 0.0.0.0 in dev so other devices on the LAN
// can point at the Vite dev server for mobile testing, etc.
const host = process.env.HOST ?? (isProd ? '127.0.0.1' : '0.0.0.0');
app.listen(port, host, () => {
  console.log(`PathNotion API listening on ${host}:${port}`);
  startDigestScheduler();
  startCalendarSyncScheduler(5);
  startJeffScheduler();
});
