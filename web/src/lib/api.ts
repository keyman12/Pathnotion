import type { AccessGrant, AgentJob, AgentRun, BacklogItem, CalendarEvent, Doc, DocBlock, Product, Task } from './types';

const BASE = '/api';

export type ApiError = Error & { status?: number };

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = new Error(`${res.status} ${res.statusText}`) as ApiError;
    err.status = res.status;
    try { err.message = (await res.json()).error ?? err.message; } catch { /* ignore */ }
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface SessionUser {
  id: number;
  key: string;
  username: string;
  displayName: string;
  email: string | null;
  role: 'admin' | 'member';
  color: string | null;
}

export const api = {
  auth: {
    me: () => fetchJson<SessionUser>('/auth/me'),
    login: (username: string, password: string) =>
      fetchJson<SessionUser>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    logout: () => fetchJson<void>('/auth/logout', { method: 'POST' }),
    changePassword: (current: string, next: string) =>
      fetchJson<void>('/auth/change-password', { method: 'POST', body: JSON.stringify({ current, next }) }),
    users: {
      list: () => fetchJson<SessionUser[]>('/auth/users'),
      create: (body: { key: string; username: string; displayName: string; email?: string | null; password: string; role?: 'admin' | 'member'; color?: string | null }) =>
        fetchJson<SessionUser>('/auth/users', { method: 'POST', body: JSON.stringify(body) }),
      patch: (id: number, body: Partial<Pick<SessionUser, 'displayName' | 'email' | 'role' | 'color'>>) =>
        fetchJson<SessionUser>(`/auth/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
      resetPassword: (id: number, password: string) =>
        fetchJson<void>(`/auth/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) }),
    },
  },
  products: () => fetchJson<Product[]>('/products'),
  productsCrud: {
    create: (body: { id: string; label: string; color: string; accent?: string; sortOrder?: number }) =>
      fetchJson<Product>('/products', { method: 'POST', body: JSON.stringify(body) }),
    patch: (id: string, body: Partial<Pick<Product, 'label' | 'color' | 'accent'>> & { sortOrder?: number }) =>
      fetchJson<Product>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: string) => fetchJson<void>(`/products/${id}`, { method: 'DELETE' }),
  },
  backlog: {
    list: (q: Partial<{ product: string; stage: string; owner: string }> = {}) => {
      const params = new URLSearchParams(q as Record<string, string>).toString();
      return fetchJson<BacklogItem[]>(`/backlog/items${params ? `?${params}` : ''}`);
    },
    create: (body: Partial<BacklogItem> & { id: string; title: string; product: string; stage: BacklogItem['stage']; owner: BacklogItem['owner'] }) =>
      fetchJson<BacklogItem>('/backlog/items', { method: 'POST', body: JSON.stringify(body) }),
    patch: (id: string, body: Partial<BacklogItem>) =>
      fetchJson<BacklogItem>(`/backlog/items/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: string) => fetchJson<void>(`/backlog/items/${id}`, { method: 'DELETE' }),
    reorder: (items: Array<{ id: string; sortOrder: number; stage?: BacklogItem['stage'] }>) =>
      fetchJson<void>('/backlog/reorder', { method: 'POST', body: JSON.stringify(items) }),
  },
  tasks: {
    list: () => fetchJson<Task[]>('/tasks'),
    create: (body: { title: string; owner: 'D' | 'R'; due: string; attachments?: Task['attachments'] }) =>
      fetchJson<Task>('/tasks', { method: 'POST', body: JSON.stringify(body) }),
    patch: (id: number, body: Partial<Task>) =>
      fetchJson<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: number) => fetchJson<void>(`/tasks/${id}`, { method: 'DELETE' }),
  },
  calendar: {
    events: () => fetchJson<CalendarEvent[]>('/calendar/events'),
    create: (body: Omit<CalendarEvent, 'id'>) =>
      fetchJson<CalendarEvent>('/calendar/events', { method: 'POST', body: JSON.stringify(body) }),
    patch: (id: number, body: Partial<CalendarEvent>) =>
      fetchJson<CalendarEvent>(`/calendar/events/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: number) => fetchJson<void>(`/calendar/events/${id}`, { method: 'DELETE' }),
    sync: () => fetchJson<{ ok: boolean }>('/calendar/sync', { method: 'POST' }),
    google: {
      status: () => fetchJson<GoogleCalendarStatus>('/calendar/google/status'),
      connect: () => fetchJson<{ url: string }>('/calendar/google/connect', { method: 'POST' }),
      disconnect: () => fetchJson<{ ok: true }>('/calendar/google/disconnect', { method: 'POST' }),
      test: () => fetchJson<{ ok: boolean; primaryCalendar?: string; error?: string }>('/calendar/google/test', { method: 'POST' }),
    },
  },
  drive: {
    config: () => fetchJson<DriveWorkspaceConfig>('/drive/config'),
    setDrive: (body: { driveId: string; driveName: string }) =>
      fetchJson<DriveWorkspaceConfig>('/drive/config/drive', { method: 'PUT', body: JSON.stringify(body) }),
    sharedDrives: () => fetchJson<SharedDriveSummary[]>('/drive/shared-drives'),
    bootstrapJeff: () => fetchJson<{ folderId: string; name: string }>('/drive/bootstrap-jeff', { method: 'POST' }),
    children: (parent?: string, kind?: 'folders' | 'files') => {
      const q = new URLSearchParams();
      if (parent) q.set('parent', parent);
      if (kind) q.set('kind', kind);
      const suffix = q.toString() ? `?${q.toString()}` : '';
      return fetchJson<DriveEntry[]>(`/drive/children${suffix}`);
    },
    entry: (id: string) => fetchJson<DriveEntry>(`/drive/entry/${id}`),
    createFolder: (body: { parent?: string; name: string }) =>
      fetchJson<DriveEntry>('/drive/folders', { method: 'POST', body: JSON.stringify(body) }),
    rename: (id: string, name: string) =>
      fetchJson<DriveEntry>(`/drive/entry/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
    move: (id: string, parentId: string, fromParentId?: string) =>
      fetchJson<DriveEntry>(`/drive/entry/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ moveTo: { parentId, fromParentId } }),
      }),
    trash: (id: string) => fetchJson<void>(`/drive/entry/${id}`, { method: 'DELETE' }),
    /** Browser-addressable download URL — the server streams the file with a Content-Disposition header,
     *  so the browser handles the save dialog for us. Uploaded files only. */
    downloadUrl: (id: string) => `${BASE}/drive/entry/${id}/download`,
    upload: async (parent: string, file: File): Promise<DriveEntry> => {
      const form = new FormData();
      form.append('parent', parent);
      form.append('file', file);
      const res = await fetch(`${BASE}/drive/upload`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      if (!res.ok) {
        const err = new Error(`${res.status} ${res.statusText}`) as ApiError;
        err.status = res.status;
        try { err.message = (await res.json()).error ?? err.message; } catch { /* ignore */ }
        throw err;
      }
      return res.json() as Promise<DriveEntry>;
    },
  },
  agent: {
    status: () => fetchJson<JeffStatus>('/agent/status'),
    todayFeed: () => fetchJson<JeffTodayFeed>('/agent/today-feed'),
    conversations: () => fetchJson<AgentConversationMessage[]>('/agent/conversations'),
    clearConversations: () => fetchJson<{ removed: number }>('/agent/conversations', { method: 'DELETE' }),
    sendMessage: (text: string) =>
      fetchJson<{ text: string; model: string; toolCalls: JeffToolCall[] }>('/agent/message', { method: 'POST', body: JSON.stringify({ text }) }),
    runs: () => fetchJson<AgentRun[]>('/agent/runs'),
    schedule: () => fetchJson<AgentJob[]>('/agent/schedule'),
    promptDefaults: () => fetchJson<Record<string, string>>('/agent/schedule/prompt-defaults'),
    createJob: (body: { id?: string; name: string; kind: string; schedule: string; description?: string; prompt?: string | null; enabled?: boolean }) =>
      fetchJson<{ id: string }>('/agent/schedule', { method: 'POST', body: JSON.stringify(body) }),
    patchJob: (id: string, body: { enabled?: boolean; schedule?: string; name?: string; description?: string; prompt?: string | null }) =>
      fetchJson<{ ok: true }>(`/agent/schedule/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    deleteJob: (id: string) =>
      fetchJson<void>(`/agent/schedule/${id}`, { method: 'DELETE' }),
    runJobNow: (id: string) =>
      fetchJson<{ status: 'ok' | 'error'; summary: string }>(`/agent/schedule/${id}/run`, { method: 'POST' }),
    memories: (kind?: string, limit?: number) => {
      const q = new URLSearchParams();
      if (kind) q.set('kind', kind);
      if (limit) q.set('limit', String(limit));
      const suffix = q.toString() ? `?${q.toString()}` : '';
      return fetchJson<JeffMemoriesResponse>(`/agent/memories${suffix}`);
    },
    scanMemories: () =>
      fetchJson<{ scanned: number; updated: number; skipped: number }>('/agent/memories/scan', { method: 'POST' }),
    scanDriveFiles: () =>
      fetchJson<{ scanned: number; updated: number; skipped: number; skippedNoKey?: boolean; skippedNoPins?: boolean }>('/agent/memories/scan-drive', { method: 'POST' }),
    clearMemories: (kind?: string) => {
      const q = kind ? `?kind=${encodeURIComponent(kind)}` : '';
      return fetchJson<{ removed: number }>(`/agent/memories${q}`, { method: 'DELETE' });
    },
    runWeeklySummary: () =>
      fetchJson<{ text: string; memoryId: string; driveFileId: string | null }>('/agent/weekly-summary', { method: 'POST' }),
    styleSheet: {
      get: () => fetchJson<{ data: JeffStyleSheet; updatedAt: string; updatedBy: string | null } | null>('/agent/style-sheet'),
      put: (data: JeffStyleSheet) =>
        fetchJson<{ ok: true }>('/agent/style-sheet', { method: 'PUT', body: JSON.stringify({ data }) }),
      uploadLogo: async (variant: 'light' | 'dark', file: File): Promise<{ variant: string; logo: JeffLogoRef }> => {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch(`${BASE}/agent/style-sheet/logo/${variant}`, {
          method: 'POST',
          credentials: 'include',
          body: form,
        });
        if (!res.ok) {
          const err = new Error(`${res.status} ${res.statusText}`) as ApiError;
          err.status = res.status;
          try { err.message = (await res.json()).error ?? err.message; } catch { /* ignore */ }
          throw err;
        }
        return res.json();
      },
      clearLogo: (variant: 'light' | 'dark') =>
        fetchJson<{ ok: true }>(`/agent/style-sheet/logo/${variant}`, { method: 'DELETE' }),
      /** Browser-addressable URL that streams the logo file inline (for <img> previews). */
      logoPreviewUrl: (fileId: string) => `${BASE}/drive/entry/${fileId}/download?inline=1`,
    },
    competitors: {
      list: () => fetchJson<JeffCompetitor[]>('/agent/competitors'),
      create: (body: Omit<JeffCompetitor, 'id'> & { id?: string }) =>
        fetchJson<{ id: string }>('/agent/competitors', { method: 'POST', body: JSON.stringify(body) }),
      patch: (id: string, body: Partial<JeffCompetitor>) =>
        fetchJson<{ ok: true }>(`/agent/competitors/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
      remove: (id: string) => fetchJson<void>(`/agent/competitors/${id}`, { method: 'DELETE' }),
    },
    trackedFeatures: (competitorId?: string) => {
      const q = competitorId ? `?competitorId=${encodeURIComponent(competitorId)}` : '';
      return fetchJson<JeffTrackedFeature[]>(`/agent/tracked-features${q}`);
    },
    pinnedFolders: {
      list: () => fetchJson<JeffPinnedFolder[]>('/agent/pinned-folders'),
      pin: (driveFolderId: string, folderName: string) =>
        fetchJson<{ ok: true }>('/agent/pinned-folders', { method: 'POST', body: JSON.stringify({ driveFolderId, folderName }) }),
      unpin: (driveFolderId: string) =>
        fetchJson<void>(`/agent/pinned-folders/${driveFolderId}`, { method: 'DELETE' }),
    },
    settings: {
      get: () => fetchJson<{ scanCap: number; pinnedCount: number }>('/agent/settings'),
      put: (body: { scanCap: number }) =>
        fetchJson<{ ok: true }>('/agent/settings', { method: 'PUT', body: JSON.stringify(body) }),
    },
    access: () => fetchJson<AccessGrant[]>('/agent/access'),
  },
  businessCategories: {
    list: () => fetchJson<BusinessCategory[]>('/business-categories'),
    create: (body: { id: string; label: string; icon?: string; sortOrder?: number }) =>
      fetchJson<BusinessCategory>('/business-categories', { method: 'POST', body: JSON.stringify(body) }),
    patch: (id: string, body: Partial<Pick<BusinessCategory, 'label' | 'icon' | 'sortOrder'>>) =>
      fetchJson<BusinessCategory>(`/business-categories/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: string) => fetchJson<void>(`/business-categories/${id}`, { method: 'DELETE' }),
  },
  docs: {
    tree: (root: 'product' | 'finance' | 'sales' | 'legal' = 'product') =>
      fetchJson<DocSummary[]>(`/docs/tree?root=${root}`),
    /** Articles by Drive folder. Pass '__all__' (or nothing) for every article. */
    articles: (folder?: string) => {
      const q = folder ? `?folder=${encodeURIComponent(folder)}` : '';
      return fetchJson<DocSummary[]>(`/docs/articles${q}`);
    },
    get: (id: string) => fetchJson<DocWithBlocks>(`/docs/${id}`),
    create: (body: { title: string; root?: 'product' | 'finance' | 'sales' | 'legal'; product?: string | null; group?: string | null; tags?: string[]; driveFolderId?: string | null }) =>
      fetchJson<DocWithBlocks>('/docs', { method: 'POST', body: JSON.stringify(body) }),
    patch: (id: string, body: { title?: string; blocks?: DocBlock[]; driveFolderId?: string | null }) =>
      fetchJson<void>(`/docs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: string) => fetchJson<void>(`/docs/${id}`, { method: 'DELETE' }),
  },
  notifications: {
    prefs: () => fetchJson<NotificationPrefs>('/notifications/prefs'),
    patchPrefs: (body: Partial<Pick<NotificationPrefs, 'enabled' | 'deliveryTime'>> & { sections?: Partial<NotificationPrefs['sections']> }) =>
      fetchJson<NotificationPrefs>('/notifications/prefs', { method: 'PATCH', body: JSON.stringify(body) }),
    sendTest: () => fetchJson<{ ok: true }>('/notifications/send-test', { method: 'POST' }),
  },
};

export interface BusinessCategory {
  id: string;
  label: string;
  icon: string;
  sortOrder: number;
}

export interface DocSummary extends Doc {
  root: 'product' | 'finance' | 'sales' | 'legal';
  createdBy?: string | null;
  updatedBy?: string | null;
  driveFolderId?: string | null;
}

export interface DocWithBlocks extends DocSummary {
  blocks: DocBlock[];
}

export interface GoogleCalendarStatus {
  configured: boolean;
  connected: boolean;
  email?: string | null;
  connectedAt?: string | null;
  lastSyncAt?: string | null;
}

export interface DriveWorkspaceConfig {
  driveId: string | null;
  driveName: string | null;
  jeffFolderId: string | null;
}

export interface SharedDriveSummary {
  id: string;
  name: string;
  colorRgb: string | null;
  createdTime: string | null;
}

export interface DriveEntry {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  modifiedTime: string | null;
  size: number | null;
  iconLink: string | null;
  webViewLink: string | null;
  owners: { displayName: string | null; emailAddress: string | null }[];
  trashed: boolean;
}

/** Shortcut: is this Drive entry a folder? */
export function isFolder(e: DriveEntry): boolean {
  return e.mimeType === 'application/vnd.google-apps.folder';
}

export interface JeffStatus {
  ready: boolean;
  model: string;
  reason?: string;
  memories: { total: number; byKind: Record<string, number> };
}

export interface JeffMemory {
  id: string;
  kind: 'article' | 'drive-file' | 'weekly-summary' | 'daily-news' | 'competitor-features' | 'research-refresh' | 'note';
  sourceId: string | null;
  title: string;
  summary: string;
  tags: string[];
  scope: string | null;
  sourceUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JeffTodayFeedItem {
  id: string;
  kind: string;
  title: string;
  summary: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface JeffTodayFeed {
  dailyNews:          JeffTodayFeedItem | null;
  weeklySummary:      JeffTodayFeedItem | null;
  competitorFeatures: JeffTodayFeedItem | null;
  researchRefresh:    JeffTodayFeedItem | null;
}

export interface JeffMemoriesResponse {
  memories: JeffMemory[];
  counts: { total: number; byKind: Record<string, number> };
}

export interface AgentConversationMessage {
  id: number;
  role: 'user' | 'agent';
  text: string;
  actions: unknown | null;
  createdAt: string;
}

export interface JeffToolCall {
  name: string;
  input: unknown;
  result: string;
  isError?: boolean;
}

export interface JeffLogoRef {
  fileId: string;
  name: string;
  mimeType: string;
}

export interface JeffTypeScale {
  h0?: number;
  h1?: number;
  h2?: number;
  h3?: number;
  h4?: number;
  p1?: number;
  p2?: number;
}

export interface JeffStyleSheet {
  voice?: { tone?: string; avoid?: string[]; prefer?: string[] };
  brand?: {
    name?: string;
    tagline?: string;
    colorPrimary?: string;
    colorPrimaryLight1?: string;
    colorPrimaryLight2?: string;
    colorSecondary?: string;
    colorSecondaryLight1?: string;
    colorSecondaryLight2?: string;
    colorNeutralDark?: string;
    colorNeutralLight?: string;
    fontPrimary?: string;
    fontSecondary?: string;
    typeScale?: JeffTypeScale;
    logoLight?: JeffLogoRef | null;
    logoDark?: JeffLogoRef | null;
    // Legacy aliases kept so old rows still parse. Forms write the new keys.
    primaryColor?: string;
    accentColor?: string;
    neutralDark?: string;
    neutralLight?: string;
    fontMono?: string;
  };
  outputs?: {
    weeklySummary?: string;
    dailyNews?: string;
    competitorBrief?: string;
    presentation?: string;
    researchPdf?: string;
    spreadsheet?: string;
    [k: string]: string | undefined;
  };
}

export type CompetitorRegion = 'uk' | 'de' | 'fr' | 'es-pt' | 'it' | 'benelux' | 'global';

export interface JeffCompetitor {
  id: string;
  name: string;
  homepage: string | null;
  pressPageUrl: string | null;
  notes: string | null;
  focusAreas: string[];
  region: CompetitorRegion | null;
  enabled: boolean;
  sortOrder: number;
}

export interface JeffTrackedFeature {
  id: string;
  competitorId: string;
  name: string;
  summary: string;
  sourceUrl: string | null;
  discoveredAt: string;
}

export interface JeffPinnedFolder {
  driveFolderId: string;
  folderName: string;
  pinnedAt: string;
  pinnedBy: string | null;
}

export interface NotificationPrefs {
  enabled: boolean;
  deliveryTime: string;
  sections: { meetings: boolean; overdue: boolean; tasks: boolean; upcoming: boolean };
  lastSentDate: string | null;
  updatedAt: string;
}
