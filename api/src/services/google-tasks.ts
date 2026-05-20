// Thin wrapper around Google Tasks. The OAuth client and stored tokens are shared with
// the Calendar/Drive connection so users grant Google access once in Settings.

import { google, type tasks_v1 } from 'googleapis';
import { makeOAuthClient, type GoogleTokens } from './google-calendar.js';

export interface GoogleTaskList {
  id: string;
  title: string;
}

export interface GoogleTaskPayload {
  title: string;
  due?: string | null;
  status?: 'needsAction' | 'completed';
  notes?: string | null;
}

export interface GoogleTaskResult {
  task: tasks_v1.Schema$Task;
  refreshedTokens: GoogleTokens | null;
}

export interface GoogleTasksListResult {
  tasks: Array<tasks_v1.Schema$Task & { taskListId: string }>;
  refreshedTokens: GoogleTokens | null;
}

function makeTasksClient(tokens: GoogleTokens) {
  const client = makeOAuthClient(tokens);
  let refreshed: GoogleTokens | null = null;
  client.on('tokens', (t) => {
    refreshed = {
      access_token: t.access_token ?? tokens.access_token,
      refresh_token: t.refresh_token ?? tokens.refresh_token,
      expiry_date: t.expiry_date ?? tokens.expiry_date,
      scope: t.scope ?? tokens.scope,
    };
  });
  return { tasks: google.tasks({ version: 'v1', auth: client }), getRefreshed: () => refreshed };
}

function toGoogleDue(due: string | null | undefined): string | undefined {
  if (!due) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return undefined;
  return `${due}T00:00:00.000Z`;
}

export function fromGoogleDue(due: string | null | undefined): string | null {
  if (!due) return null;
  return due.slice(0, 10);
}

function toGoogleBody(body: Partial<GoogleTaskPayload>): tasks_v1.Schema$Task {
  const out: tasks_v1.Schema$Task = {};
  if (body.title !== undefined) out.title = body.title;
  if (body.due !== undefined) out.due = body.due === null ? null : toGoogleDue(body.due);
  if (body.status !== undefined) out.status = body.status;
  if (body.notes !== undefined) out.notes = body.notes ?? undefined;
  return out;
}

export async function listTaskLists(tokens: GoogleTokens): Promise<{ lists: GoogleTaskList[]; refreshedTokens: GoogleTokens | null }> {
  const { tasks, getRefreshed } = makeTasksClient(tokens);
  const lists: GoogleTaskList[] = [];
  let pageToken: string | undefined;
  for (;;) {
    const res = await tasks.tasklists.list({ maxResults: 1000, pageToken });
    for (const item of res.data.items ?? []) {
      if (item.id) lists.push({ id: item.id, title: item.title ?? 'Tasks' });
    }
    pageToken = res.data.nextPageToken ?? undefined;
    if (!pageToken) break;
  }
  return { lists, refreshedTokens: getRefreshed() };
}

export async function listAllTasks(tokens: GoogleTokens): Promise<GoogleTasksListResult> {
  const { tasks, getRefreshed } = makeTasksClient(tokens);
  const taskLists = await listTaskLists(tokens);
  const rows: Array<tasks_v1.Schema$Task & { taskListId: string }> = [];

  for (const list of taskLists.lists) {
    let pageToken: string | undefined;
    for (;;) {
      const res = await tasks.tasks.list({
        tasklist: list.id,
        maxResults: 100,
        pageToken,
        showCompleted: true,
        showDeleted: true,
        showHidden: true,
        showAssigned: true,
      });
      for (const item of res.data.items ?? []) {
        if (item.id) rows.push({ ...item, taskListId: list.id });
      }
      pageToken = res.data.nextPageToken ?? undefined;
      if (!pageToken) break;
    }
  }

  return { tasks: rows, refreshedTokens: getRefreshed() ?? taskLists.refreshedTokens };
}

export async function insertTask(tokens: GoogleTokens, taskListId: string, body: GoogleTaskPayload): Promise<GoogleTaskResult> {
  const { tasks, getRefreshed } = makeTasksClient(tokens);
  const res = await tasks.tasks.insert({
    tasklist: taskListId,
    requestBody: toGoogleBody(body),
  });
  return { task: res.data, refreshedTokens: getRefreshed() };
}

export async function patchTask(tokens: GoogleTokens, taskListId: string, taskId: string, body: Partial<GoogleTaskPayload>): Promise<GoogleTaskResult> {
  const { tasks, getRefreshed } = makeTasksClient(tokens);
  const res = await tasks.tasks.patch({
    tasklist: taskListId,
    task: taskId,
    requestBody: toGoogleBody(body),
  });
  return { task: res.data, refreshedTokens: getRefreshed() };
}

export async function deleteTask(tokens: GoogleTokens, taskListId: string, taskId: string): Promise<{ refreshedTokens: GoogleTokens | null }> {
  const { tasks, getRefreshed } = makeTasksClient(tokens);
  await tasks.tasks.delete({ tasklist: taskListId, task: taskId });
  return { refreshedTokens: getRefreshed() };
}
