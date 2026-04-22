// Jeff's in-process scheduler.
// Wakes on a 60-second tick, looks at `agent_jobs.next_run_at`, and fires anything that's due.
// Runs in the API process — no separate worker. We keep the schedule expression tiny
// (cron-ish with a couple of aliases) so we don't need a full cron lib.
//
// Schedule expressions supported:
//   '@hourly'           — every 60 minutes from first run
//   '@daily'            — every 24 hours from first run
//   '@weekly'           — every 7 days from first run
//   'NN m'              — every NN minutes (e.g. '5 m')
//   '<minute> <hour> * * <dow>' — classic 5-field cron, only minute + hour + day-of-week used
//                                 (e.g. '0 7 * * 1' for Monday 07:00)
//
// Anything else just falls back to "@daily" so a typo doesn't hang the job forever.

import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { runJob, type JobKind } from './jeff.js';

const TICK_MS = 60 * 1000;

interface JobRow {
  id: string;
  name: string;
  schedule: string | null;
  enabled: number;
  kind: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
}

/** Parse a schedule into the next-run timestamp, relative to `from`. */
function nextFiringAfter(schedule: string, from: Date): Date {
  const expr = (schedule ?? '').trim();
  if (!expr) return new Date(from.getTime() + 24 * 60 * 60 * 1000);

  if (expr === '@hourly') return new Date(from.getTime() + 60 * 60 * 1000);
  if (expr === '@daily')  return new Date(from.getTime() + 24 * 60 * 60 * 1000);
  if (expr === '@weekly') return new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);

  const mPerMin = /^(\d+)\s*m$/.exec(expr);
  if (mPerMin) return new Date(from.getTime() + Number(mPerMin[1]) * 60 * 1000);

  // Classic cron (minute hour * * dow) — only we use the first two + fifth field.
  const parts = expr.split(/\s+/);
  if (parts.length === 5) {
    const minute = Number(parts[0]);
    const hour   = Number(parts[1]);
    const dowRaw = parts[4];
    const targetDow = dowRaw === '*' ? null : Number(dowRaw);  // 0 = Sun … 6 = Sat
    if (Number.isFinite(minute) && Number.isFinite(hour)) {
      // Walk forward day by day until we hit a day whose minute/hour is after `from`.
      const d = new Date(from);
      for (let i = 0; i < 8; i++) {
        const candidate = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i, hour, minute, 0, 0);
        if (candidate <= from) continue;
        if (targetDow != null && candidate.getDay() !== targetDow) continue;
        return candidate;
      }
    }
  }
  // Unknown format — default to daily so we don't spin forever.
  return new Date(from.getTime() + 24 * 60 * 60 * 1000);
}

function writeRun(jobId: string, status: 'ok' | 'error', summary: string, changes: number): void {
  db.prepare(`
    INSERT INTO agent_runs (id, job_id, status, summary, changes, ran_at)
    VALUES (@id, @jobId, @status, @summary, @changes, datetime('now'))
  `).run({
    id: `run_${randomUUID().slice(0, 10)}`,
    jobId,
    status,
    summary,
    changes,
  });
}

function setNextRun(jobId: string, schedule: string | null): string {
  const next = nextFiringAfter(schedule ?? '', new Date()).toISOString();
  db.prepare("UPDATE agent_jobs SET next_run_at = ? WHERE id = ?").run(next, jobId);
  return next;
}

/** Execute a single job. Returns the run summary. Caller handles logging. */
export async function runJobNow(jobId: string): Promise<{ status: 'ok' | 'error'; summary: string }> {
  const row = db.prepare('SELECT * FROM agent_jobs WHERE id = ?').get(jobId) as JobRow | undefined;
  if (!row) throw Object.assign(new Error(`Job ${jobId} not found`), { status: 404 });
  if (!row.kind) {
    writeRun(row.id, 'error', 'No job kind wired up — skipping.', 0);
    return { status: 'error', summary: 'no kind' };
  }
  try {
    const result = await runJob(row.kind as JobKind, row.id);
    writeRun(row.id, 'ok', result.summary, result.changes);
    db.prepare("UPDATE agent_jobs SET last_run_at = datetime('now') WHERE id = ?").run(row.id);
    setNextRun(row.id, row.schedule ?? null);
    return { status: 'ok', summary: result.summary };
  } catch (err) {
    const msg = (err as Error).message;
    writeRun(row.id, 'error', msg, 0);
    db.prepare("UPDATE agent_jobs SET last_run_at = datetime('now') WHERE id = ?").run(row.id);
    setNextRun(row.id, row.schedule ?? null);
    console.warn(`[jeff-scheduler] ${row.id} failed:`, msg);
    return { status: 'error', summary: msg };
  }
}

async function tick(): Promise<void> {
  const now = new Date();
  const dueRows = db.prepare(`
    SELECT * FROM agent_jobs
    WHERE enabled = 1
      AND (next_run_at IS NULL OR next_run_at <= ?)
  `).all(now.toISOString()) as JobRow[];

  for (const row of dueRows) {
    // If next_run_at is NULL (freshly seeded job), set it first — we skip the current tick so
    // we don't fire every job at once on boot.
    if (!row.next_run_at) {
      setNextRun(row.id, row.schedule ?? null);
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    await runJobNow(row.id);
  }
}

let handle: ReturnType<typeof setInterval> | null = null;

/** Start the scheduler. Safe to call multiple times — subsequent calls are no-ops. */
export function startScheduler(): void {
  if (handle) return;
  // Initial tick on a short delay so the server can finish boot first.
  setTimeout(() => { tick().catch((e) => console.warn('[jeff-scheduler] initial tick failed:', e)); }, 5_000);
  handle = setInterval(() => {
    tick().catch((e) => console.warn('[jeff-scheduler] tick failed:', e));
  }, TICK_MS);
  console.log('[jeff-scheduler] started (tick every 60s)');
}

export function stopScheduler(): void {
  if (handle) { clearInterval(handle); handle = null; }
}
