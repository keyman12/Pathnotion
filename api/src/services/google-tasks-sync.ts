// Two-way Google Tasks sync for PathNotion tasks.
// Local writes push to the task owner's Google account. Scheduler/manual sync pulls
// Google-created/edited tasks back into PathNotion.

import { db } from '../db/client.js';
import { deleteTask, fromGoogleDue, insertTask, listAllTasks, listTaskLists, patchTask, type GoogleTaskPayload } from './google-tasks.js';
import { type GoogleTokens } from './google-calendar.js';
import { decryptToken, encryptToken } from './token-vault.js';

const GOOGLE_TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks';

interface SourceRow {
  id: number;
  user_key: string;
  email: string | null;
  provider: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expiry: number | null;
  scope: string | null;
  connected_at: string | null;
  tasks_last_sync_at: string | null;
}

interface TaskRow {
  id: number;
  title: string;
  owner: string;
  due: string | null;
  done: number;
  priority: string | null;
  attachmentsJson: string | null;
  googleTaskId: string | null;
  googleTaskListId: string | null;
  googleOwnerKey: string | null;
}

function friendlyGoogleTasksError(err: any): string {
  const message = String(err?.message ?? '');
  const status = err?.code ?? err?.response?.status;
  if (status === 403 && /tasks.googleapis.com|Google Tasks API has not been used|disabled/i.test(message)) {
    return 'Google Tasks API is disabled for this Google Cloud project. Enable the Google Tasks API for project 924801111527, wait a minute, then sync again.';
  }
  if (status === 403 && /insufficient|permission|scope/i.test(message)) {
    return 'Google Tasks permission missing. Reconnect Google in Settings to grant Tasks access.';
  }
  return message || 'Google Tasks sync failed';
}

const SELECT_TASK_FOR_SYNC = `
  SELECT id,
         title,
         owner_key AS owner,
         due,
         done,
         priority,
         attachments AS attachmentsJson,
         google_task_id AS googleTaskId,
         google_task_list_id AS googleTaskListId,
         google_owner_key AS googleOwnerKey
  FROM tasks
`;

function sourceToTokens(row: SourceRow): GoogleTokens {
  return {
    access_token: decryptToken(row.access_token),
    refresh_token: decryptToken(row.refresh_token),
    expiry_date: row.token_expiry ?? null,
    scope: row.scope,
  };
}

function persistRefreshedTokens(sourceId: number, tokens: GoogleTokens | null) {
  if (!tokens) return;
  db.prepare(`
    UPDATE calendar_sources
    SET access_token = @accessToken,
        refresh_token = COALESCE(@refreshToken, refresh_token),
        token_expiry = @expiry,
        scope = COALESCE(@scope, scope)
    WHERE id = @id
  `).run({
    id: sourceId,
    accessToken: encryptToken(tokens.access_token),
    refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
    expiry: tokens.expiry_date,
    scope: tokens.scope,
  });
}

function connectedSourceForUser(userKey: string): SourceRow | undefined {
  return db.prepare(
    "SELECT * FROM calendar_sources WHERE user_key = ? AND provider = 'google' LIMIT 1",
  ).get(userKey) as SourceRow | undefined;
}

function hasTasksScope(source: SourceRow): boolean {
  return !!source.scope?.split(/\s+/).includes(GOOGLE_TASKS_SCOPE);
}

function taskPayload(row: TaskRow): GoogleTaskPayload {
  const notes: string[] = [];
  if (row.priority) notes.push(`Priority: ${row.priority}`);
  if (row.attachmentsJson) {
    try {
      const attachments = JSON.parse(row.attachmentsJson);
      if (Array.isArray(attachments) && attachments.length) {
        notes.push(`${attachments.length} attachment${attachments.length === 1 ? '' : 's'} in PathNotion`);
      }
    } catch { /* ignore malformed */ }
  }
  notes.push('Synced from PathNotion');
  return {
    title: row.title,
    due: row.due || null,
    status: row.done ? 'completed' : 'needsAction',
    notes: notes.join('\n'),
  };
}

async function defaultTaskListId(source: SourceRow): Promise<string | null> {
  const result = await listTaskLists(sourceToTokens(source));
  persistRefreshedTokens(source.id, result.refreshedTokens);
  return result.lists[0]?.id ?? null;
}

async function deleteRemoteTask(ownerKey: string | null, taskListId: string | null, taskId: string | null) {
  if (!ownerKey || !taskListId || !taskId) return;
  const source = connectedSourceForUser(ownerKey);
  if (!source) return;
  try {
    const result = await deleteTask(sourceToTokens(source), taskListId, taskId);
    persistRefreshedTokens(source.id, result.refreshedTokens);
  } catch (err: any) {
    const status = err?.code ?? err?.response?.status;
    if (status !== 404) throw err;
  }
}

function storeGoogleFields(localTaskId: number, ownerKey: string, taskListId: string, task: { id?: string | null; etag?: string | null; updated?: string | null; webViewLink?: string | null }) {
  db.prepare(`
    UPDATE tasks
    SET google_task_id = @googleTaskId,
        google_task_list_id = @googleTaskListId,
        google_owner_key = @googleOwnerKey,
        google_etag = @googleEtag,
        google_updated_at = @googleUpdatedAt,
        google_web_link = @googleWebLink,
        last_synced_at = datetime('now')
    WHERE id = @id
  `).run({
    id: localTaskId,
    googleTaskId: task.id ?? null,
    googleTaskListId: taskListId,
    googleOwnerKey: ownerKey,
    googleEtag: task.etag ?? null,
    googleUpdatedAt: task.updated ?? null,
    googleWebLink: task.webViewLink ?? null,
  });
}

export async function pushTaskToGoogle(localTaskId: number, previousOwnerKey?: string | null): Promise<{ ok: boolean; synced: boolean; error?: string }> {
  const row = db.prepare(SELECT_TASK_FOR_SYNC + ' WHERE id = ?').get(localTaskId) as TaskRow | undefined;
  if (!row) return { ok: false, synced: false, error: 'Task not found' };

  if (previousOwnerKey && previousOwnerKey !== row.owner) {
    await deleteRemoteTask(previousOwnerKey, row.googleTaskListId, row.googleTaskId);
    db.prepare(`
      UPDATE tasks
      SET google_task_id = NULL,
          google_task_list_id = NULL,
          google_owner_key = NULL,
          google_etag = NULL,
          google_updated_at = NULL,
          google_web_link = NULL,
          last_synced_at = NULL
      WHERE id = ?
    `).run(localTaskId);
    row.googleTaskId = null;
    row.googleTaskListId = null;
    row.googleOwnerKey = null;
  }

  const source = connectedSourceForUser(row.owner);
  if (!source) return { ok: true, synced: false };
  if (!hasTasksScope(source)) {
    return { ok: false, synced: false, error: 'Google Tasks permission missing. Reconnect Google in Settings to grant Tasks access.' };
  }
  const tokens = sourceToTokens(source);
  const payload = taskPayload(row);

  try {
    if (row.googleTaskId && row.googleTaskListId && row.googleOwnerKey === row.owner) {
      const result = await patchTask(tokens, row.googleTaskListId, row.googleTaskId, payload);
      persistRefreshedTokens(source.id, result.refreshedTokens);
      storeGoogleFields(row.id, row.owner, row.googleTaskListId, result.task);
      return { ok: true, synced: true };
    }

    const taskListId = row.googleTaskListId ?? await defaultTaskListId(source);
    if (!taskListId) return { ok: false, synced: false, error: 'No Google task list found' };
    const result = await insertTask(tokens, taskListId, payload);
    persistRefreshedTokens(source.id, result.refreshedTokens);
    storeGoogleFields(row.id, row.owner, taskListId, result.task);
    return { ok: true, synced: true };
  } catch (err: any) {
    const status = err?.code ?? err?.response?.status;
    if (status === 404 && row.googleTaskId) {
      const taskListId = await defaultTaskListId(source);
      if (!taskListId) return { ok: false, synced: false, error: 'No Google task list found' };
      const result = await insertTask(tokens, taskListId, payload);
      persistRefreshedTokens(source.id, result.refreshedTokens);
      storeGoogleFields(row.id, row.owner, taskListId, result.task);
      return { ok: true, synced: true };
    }
    return { ok: false, synced: false, error: friendlyGoogleTasksError(err) };
  }
}

export async function removeTaskFromGoogle(row: { owner: string; googleTaskId?: string | null; googleTaskListId?: string | null; googleOwnerKey?: string | null }) {
  await deleteRemoteTask(row.googleOwnerKey ?? row.owner, row.googleTaskListId ?? null, row.googleTaskId ?? null);
}

async function pushPendingLocalTasks(userKey: string, source: SourceRow): Promise<{ ok: boolean; pushed: number; error?: string }> {
  const rows = db.prepare(`
    ${SELECT_TASK_FOR_SYNC}
    WHERE owner_key = ?
      AND (google_task_id IS NULL OR google_task_list_id IS NULL)
      AND (
        ? IS NULL
        OR datetime(created_at) >= datetime(?)
        OR datetime(updated_at) >= datetime(?)
      )
    ORDER BY sort_order, id
  `).all(userKey, source.connected_at, source.connected_at, source.connected_at) as TaskRow[];

  let pushed = 0;
  for (const row of rows) {
    const result = await pushTaskToGoogle(row.id);
    if (!result.ok) return { ok: false, pushed, error: result.error };
    if (result.synced) pushed++;
  }
  return { ok: true, pushed };
}

export async function syncGoogleTasksForUser(userKey: string): Promise<{ ok: boolean; pushed: number; inserted: number; updated: number; deleted: number; error?: string }> {
  const source = connectedSourceForUser(userKey);
  if (!source) return { ok: false, pushed: 0, inserted: 0, updated: 0, deleted: 0, error: 'Not connected' };
  if (!hasTasksScope(source)) {
    return {
      ok: false,
      pushed: 0,
      inserted: 0,
      updated: 0,
      deleted: 0,
      error: 'Google Tasks permission missing. Reconnect Google in Settings to grant Tasks access.',
    };
  }

  const pushResult = await pushPendingLocalTasks(userKey, source);
  if (!pushResult.ok) {
    return { ok: false, pushed: pushResult.pushed, inserted: 0, updated: 0, deleted: 0, error: pushResult.error };
  }

  let result;
  try {
    result = await listAllTasks(sourceToTokens(source));
    persistRefreshedTokens(source.id, result.refreshedTokens);
  } catch (err: any) {
    return { ok: false, pushed: pushResult.pushed, inserted: 0, updated: 0, deleted: 0, error: friendlyGoogleTasksError(err) };
  }

  let inserted = 0;
  let updated = 0;
  let deleted = 0;
  const maxOrder = () => (db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS n FROM tasks').get() as { n: number }).n;

  const upsert = db.transaction(() => {
    for (const task of result.tasks) {
      if (!task.id) continue;
      const existing = db.prepare(
        'SELECT id FROM tasks WHERE google_task_list_id = ? AND google_task_id = ?',
      ).get(task.taskListId, task.id) as { id: number } | undefined;

      if (task.deleted) {
        if (existing) {
          const info = db.prepare('DELETE FROM tasks WHERE id = ?').run(existing.id);
          deleted += info.changes;
        }
        continue;
      }

      const values = {
        title: task.title || '(untitled task)',
        owner: userKey,
        due: fromGoogleDue(task.due) ?? '',
        done: task.status === 'completed' ? 1 : 0,
        googleTaskId: task.id,
        googleTaskListId: task.taskListId,
        googleOwnerKey: userKey,
        googleEtag: task.etag ?? null,
        googleUpdatedAt: task.updated ?? null,
        googleWebLink: task.webViewLink ?? null,
      };

      if (existing) {
        const info = db.prepare(`
          UPDATE tasks
          SET title = @title,
              owner_key = @owner,
              due = @due,
              done = @done,
              google_owner_key = @googleOwnerKey,
              google_etag = @googleEtag,
              google_updated_at = @googleUpdatedAt,
              google_web_link = @googleWebLink,
              last_synced_at = datetime('now'),
              updated_at = datetime('now')
          WHERE id = @id
        `).run({ ...values, id: existing.id });
        updated += info.changes;
      } else {
        db.prepare(`
          INSERT INTO tasks (
            title, owner_key, due, done, sort_order,
            google_task_id, google_task_list_id, google_owner_key, google_etag, google_updated_at, google_web_link, last_synced_at
          )
          VALUES (
            @title, @owner, @due, @done, @sortOrder,
            @googleTaskId, @googleTaskListId, @googleOwnerKey, @googleEtag, @googleUpdatedAt, @googleWebLink, datetime('now')
          )
        `).run({ ...values, sortOrder: maxOrder() + 1 });
        inserted++;
      }
    }
    db.prepare("UPDATE calendar_sources SET tasks_last_sync_at = datetime('now') WHERE id = ?").run(source.id);
  });
  upsert();

  return { ok: true, pushed: pushResult.pushed, inserted, updated, deleted };
}

export async function syncAllGoogleTasks(): Promise<{ sources: number; pushed: number; inserted: number; updated: number; deleted: number; errors: string[] }> {
  const rows = db.prepare(
    "SELECT * FROM calendar_sources WHERE provider = 'google'",
  ).all() as SourceRow[];
  let pushed = 0;
  let inserted = 0;
  let updated = 0;
  let deleted = 0;
  const errors: string[] = [];

  for (const source of rows) {
    const result = await syncGoogleTasksForUser(source.user_key);
    if (result.ok) {
      pushed += result.pushed;
      inserted += result.inserted;
      updated += result.updated;
      deleted += result.deleted;
    } else {
      errors.push(`${source.user_key}: ${result.error ?? 'unknown'}`);
    }
  }

  return { sources: rows.length, pushed, inserted, updated, deleted, errors };
}

let schedulerTimer: NodeJS.Timeout | null = null;

export function startGoogleTasksSyncScheduler(intervalMinutes = 5) {
  if (schedulerTimer) return;
  const period = Math.max(1, intervalMinutes) * 60_000;
  const tick = async () => {
    try {
      const { sources, pushed, inserted, updated, deleted, errors } = await syncAllGoogleTasks();
      if (sources) {
        console.log(`[tasks-sync] synced ${sources} source(s) · pushed ${pushed} · +${inserted} ~${updated} -${deleted}` + (errors.length ? ` · errors: ${errors.join('; ')}` : ''));
      }
    } catch (err) {
      console.error('[tasks-sync] scheduler tick failed:', err);
    }
  };
  setTimeout(tick, 20_000);
  schedulerTimer = setInterval(tick, period);
}
