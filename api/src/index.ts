import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { SqliteSessionStore } from './middleware/session-store.js';
import { requireAuth } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { backlogRouter } from './routes/backlog.js';
import { tasksRouter } from './routes/tasks.js';
import { calendarRouter } from './routes/calendar.js';
import { docsRouter } from './routes/docs.js';
import { agentRouter } from './routes/agent.js';
import { productsRouter } from './routes/products.js';

const app = express();

const isProd = process.env.NODE_ENV === 'production';
const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';

app.set('trust proxy', 1);
app.use(cors({ origin: webOrigin, credentials: true }));
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

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal error' });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`PathNotion API listening on :${port}`);
});
