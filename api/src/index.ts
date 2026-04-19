import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { backlogRouter } from './routes/backlog.js';
import { tasksRouter } from './routes/tasks.js';
import { calendarRouter } from './routes/calendar.js';
import { docsRouter } from './routes/docs.js';
import { agentRouter } from './routes/agent.js';
import { productsRouter } from './routes/products.js';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/products', productsRouter);
app.use('/api/backlog', backlogRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/docs', docsRouter);
app.use('/api/agent', agentRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal error' });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`PathNotion API listening on :${port}`);
});
