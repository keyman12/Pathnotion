import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { ApiError, BusinessCategory, NotificationPrefs } from './api';
import type { BacklogItem, CalendarEvent, Task } from './types';

// Every hook assumes the session is authed (App gates on it).
// On 401 mid-session, clear the session cache so the AuthGate redirects back to /login.

function handle401(err: unknown, qc: ReturnType<typeof useQueryClient>) {
  if ((err as ApiError).status === 401) qc.setQueryData(['auth', 'me'], null);
}

// Products
export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: () => api.products(),
    staleTime: 5 * 60_000,
  });
}

// Backlog
export function useBacklog(productId?: string) {
  return useQuery({
    queryKey: ['backlog', productId ?? 'all'],
    queryFn: () => api.backlog.list(productId ? { product: productId } : {}),
    staleTime: 30_000,
  });
}

export function useCreateBacklog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.backlog.create>[0]) => api.backlog.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backlog'] }),
    onError: (err) => handle401(err, qc),
  });
}

export function usePatchBacklog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; patch: Partial<BacklogItem> }) => api.backlog.patch(args.id, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backlog'] }),
    onError: (err) => handle401(err, qc),
  });
}

export function useDeleteBacklog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.backlog.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['backlog'] }),
    onError: (err) => handle401(err, qc),
  });
}

// Tasks
export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.tasks.list(),
    staleTime: 30_000,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.tasks.create>[0]) => api.tasks.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
    onError: (err) => handle401(err, qc),
  });
}

export function usePatchTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; patch: Partial<Task> }) => api.tasks.patch(args.id, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
    onError: (err) => handle401(err, qc),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.tasks.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
    onError: (err) => handle401(err, qc),
  });
}

// Calendar
export function useCalendar() {
  return useQuery({
    queryKey: ['calendar'],
    queryFn: () => api.calendar.events(),
    staleTime: 30_000,
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<CalendarEvent, 'id'>) => api.calendar.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar'] }),
    onError: (err) => handle401(err, qc),
  });
}

export function usePatchEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; patch: Partial<CalendarEvent> }) => api.calendar.patch(args.id, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar'] }),
    onError: (err) => handle401(err, qc),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.calendar.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar'] }),
    onError: (err) => handle401(err, qc),
  });
}

export function useSyncCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.calendar.sync(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['calendar', 'google', 'status'] });
    },
    onError: (err) => handle401(err, qc),
  });
}

// Agent / Jeff
export function useJeffStatus() {
  return useQuery({ queryKey: ['agent', 'status'], queryFn: () => api.agent.status(), staleTime: 30_000 });
}
export function useJeffTodayFeed() {
  return useQuery({ queryKey: ['agent', 'today-feed'], queryFn: () => api.agent.todayFeed(), staleTime: 60_000 });
}
export function useJeffConversation() {
  return useQuery({ queryKey: ['agent', 'conversations'], queryFn: () => api.agent.conversations() });
}
export function useSendJeffMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { text: string; deep?: boolean }) =>
      api.agent.sendMessage(args.text, { deep: args.deep }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', 'conversations'] }),
  });
}
export function useClearJeffConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.agent.clearConversations(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', 'conversations'] }),
  });
}
export function useAgentRuns() {
  return useQuery({ queryKey: ['agent', 'runs'], queryFn: () => api.agent.runs(), staleTime: 15_000 });
}
export function useAgentJobs() {
  return useQuery({ queryKey: ['agent', 'jobs'], queryFn: () => api.agent.schedule(), staleTime: 15_000 });
}
export function useJobPromptDefaults() {
  return useQuery({ queryKey: ['agent', 'prompt-defaults'], queryFn: () => api.agent.promptDefaults(), staleTime: 5 * 60_000 });
}
export function usePatchAgentJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; patch: Parameters<typeof api.agent.patchJob>[1] }) =>
      api.agent.patchJob(args.id, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', 'jobs'] }),
  });
}
export function useCreateAgentJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.agent.createJob>[0]) => api.agent.createJob(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', 'jobs'] }),
  });
}
export function useDeleteAgentJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.agent.deleteJob(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', 'jobs'] }),
  });
}
export function useRunAgentJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.agent.runJobNow(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent', 'jobs'] });
      qc.invalidateQueries({ queryKey: ['agent', 'runs'] });
      qc.invalidateQueries({ queryKey: ['agent', 'memories'] });
      qc.invalidateQueries({ queryKey: ['agent', 'status'] });
      qc.invalidateQueries({ queryKey: ['agent', 'today-feed'] });
    },
  });
}
export function useCancelAgentJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.agent.cancelJob(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', 'running'] }),
  });
}
/** Polls every 3s while any job is running so the spinner clears the moment the run ends.
 *  When nothing is running, polling stops. */
export function useRunningJobs() {
  return useQuery({
    queryKey: ['agent', 'running'],
    queryFn: () => api.agent.runningJobs(),
    refetchInterval: (q) => (q.state.data?.running?.length ? 3000 : false),
    staleTime: 1000,
  });
}
export function useJeffMemories(kind?: string, limit?: number) {
  return useQuery({
    queryKey: ['agent', 'memories', kind ?? 'all', limit ?? 'default'],
    queryFn: () => api.agent.memories(kind, limit),
    staleTime: 30_000,
  });
}
export function useScanMemories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.agent.scanMemories(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent', 'memories'] });
      qc.invalidateQueries({ queryKey: ['agent', 'status'] });
    },
  });
}
export function useScanDriveFiles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.agent.scanDriveFiles(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent', 'memories'] });
      qc.invalidateQueries({ queryKey: ['agent', 'status'] });
    },
  });
}
export function useClearMemories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (kind?: string) => api.agent.clearMemories(kind),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent', 'memories'] });
      qc.invalidateQueries({ queryKey: ['agent', 'status'] });
    },
  });
}
export function useAccess() {
  return useQuery({ queryKey: ['agent', 'access'], queryFn: () => api.agent.access() });
}

// Jeff — pinned folders (scan scope)
export function usePinnedFolders() {
  return useQuery({ queryKey: ['agent', 'pinned-folders'], queryFn: () => api.agent.pinnedFolders.list(), staleTime: 30_000 });
}
export function usePinFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { driveFolderId: string; folderName: string }) =>
      api.agent.pinnedFolders.pin(args.driveFolderId, args.folderName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent', 'pinned-folders'] });
      qc.invalidateQueries({ queryKey: ['agent', 'settings'] });
    },
  });
}
export function useUnpinFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (driveFolderId: string) => api.agent.pinnedFolders.unpin(driveFolderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent', 'pinned-folders'] });
      qc.invalidateQueries({ queryKey: ['agent', 'settings'] });
    },
  });
}

// Jeff — operational settings (scan cap)
export function useJeffSettings() {
  return useQuery({ queryKey: ['agent', 'settings'], queryFn: () => api.agent.settings.get(), staleTime: 30_000 });
}
export function useSaveJeffSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.agent.settings.put>[0]) => api.agent.settings.put(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', 'settings'] }),
  });
}

// Jeff style sheet
export function useJeffStyleSheet() {
  return useQuery({ queryKey: ['agent', 'style-sheet'], queryFn: () => api.agent.styleSheet.get(), staleTime: 60_000 });
}
export function useSaveJeffStyleSheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof api.agent.styleSheet.put>[0]) => api.agent.styleSheet.put(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', 'style-sheet'] }),
  });
}
export function useUploadJeffLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ variant, file }: { variant: 'light' | 'dark'; file: File }) =>
      api.agent.styleSheet.uploadLogo(variant, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', 'style-sheet'] }),
  });
}
export function useClearJeffLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (variant: 'light' | 'dark') => api.agent.styleSheet.clearLogo(variant),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', 'style-sheet'] }),
  });
}

// Competitors
export function useCompetitors() {
  return useQuery({ queryKey: ['agent', 'competitors'], queryFn: () => api.agent.competitors.list(), staleTime: 30_000 });
}
export function useCreateCompetitor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.agent.competitors.create>[0]) => api.agent.competitors.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', 'competitors'] }),
  });
}
export function usePatchCompetitor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; patch: Parameters<typeof api.agent.competitors.patch>[1] }) =>
      api.agent.competitors.patch(args.id, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', 'competitors'] }),
  });
}
export function useDeleteCompetitor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.agent.competitors.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent', 'competitors'] }),
  });
}
export function useTrackedFeatures(competitorId?: string) {
  return useQuery({
    queryKey: ['agent', 'tracked-features', competitorId ?? 'all'],
    queryFn: () => api.agent.trackedFeatures(competitorId),
  });
}

// Users (admin)
export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: () => api.auth.users.list() });
}
export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.auth.users.create>[0]) => api.auth.users.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
export function usePatchUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; patch: Parameters<typeof api.auth.users.patch>[1] }) => api.auth.users.patch(args.id, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
export function useResetUserPassword() {
  return useMutation({
    mutationFn: (args: { id: number; password: string }) => api.auth.users.resetPassword(args.id, args.password),
  });
}

// Products CRUD
export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.productsCrud.create>[0]) => api.productsCrud.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}
export function usePatchProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; patch: Parameters<typeof api.productsCrud.patch>[1] }) => api.productsCrud.patch(args.id, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}
export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.productsCrud.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['backlog'] });
    },
  });
}

// Business categories
export function useBusinessCategories() {
  return useQuery({ queryKey: ['business-categories'], queryFn: () => api.businessCategories.list(), staleTime: 5 * 60_000 });
}
export function useCreateBusinessCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.businessCategories.create>[0]) => api.businessCategories.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['business-categories'] }),
  });
}
export function usePatchBusinessCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; patch: Parameters<typeof api.businessCategories.patch>[1] }) => api.businessCategories.patch(args.id, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['business-categories'] }),
  });
}
export function useDeleteBusinessCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.businessCategories.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['business-categories'] }),
  });
}

// Docs
type DocRoot = 'product' | 'finance' | 'sales' | 'legal';

export function useDocsTree(root: DocRoot = 'product') {
  return useQuery({
    queryKey: ['docs', 'tree', root],
    queryFn: () => api.docs.tree(root),
    staleTime: 30_000,
  });
}

export function useDoc(id: string | null | undefined) {
  return useQuery({
    queryKey: ['docs', 'one', id],
    queryFn: () => api.docs.get(id as string),
    enabled: !!id,
    staleTime: 10_000,
  });
}

export function useCreateDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.docs.create>[0]) => api.docs.create(body),
    onSuccess: (doc) => {
      qc.invalidateQueries({ queryKey: ['docs', 'tree'] });
      qc.invalidateQueries({ queryKey: ['docs', 'articles'] });
      qc.setQueryData(['docs', 'one', doc.id], doc);
    },
  });
}

export function useArticlesInFolder(folder: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['docs', 'articles', folder ?? '__all__'],
    queryFn: () => api.docs.articles(folder),
    staleTime: 20_000,
    enabled,
  });
}

export function useDeleteDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.docs.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['docs', 'tree'] });
      qc.invalidateQueries({ queryKey: ['docs', 'articles'] });
    },
  });
}

export function usePatchDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; patch: Parameters<typeof api.docs.patch>[1] }) => api.docs.patch(args.id, args.patch),
    onSuccess: (_, vars) => {
      // Title changes affect the tree list; content changes may too (updated timestamp).
      qc.invalidateQueries({ queryKey: ['docs', 'tree'] });
      qc.invalidateQueries({ queryKey: ['docs', 'one', vars.id] });
    },
  });
}

// Google Drive — workspace-wide config + shared drive picker
export function useDriveConfig() {
  return useQuery({
    queryKey: ['drive', 'config'],
    queryFn: () => api.drive.config(),
    staleTime: 30_000,
  });
}
export function useSharedDrives() {
  return useQuery({
    queryKey: ['drive', 'shared-drives'],
    queryFn: () => api.drive.sharedDrives(),
    staleTime: 60_000,
  });
}
export function useSetWorkspaceDrive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.drive.setDrive>[0]) => api.drive.setDrive(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drive'] }),
  });
}

/** Fetch children of a Drive folder (or of the shared-drive root if `parent` is undefined).
 *  `kind` narrows to folders-only or files-only. Lazy-loading the tree uses folders-only. */
export function useDriveChildren(parent?: string, kind?: 'folders' | 'files', enabled = true) {
  return useQuery({
    queryKey: ['drive', 'children', parent ?? '__root__', kind ?? 'all'],
    queryFn: () => api.drive.children(parent, kind),
    staleTime: 20_000,
    enabled,
  });
}

/** Fetch metadata for a single Drive entry. Used by the preview drawer and the selection toolbar. */
export function useDriveEntry(id: string | null | undefined) {
  return useQuery({
    queryKey: ['drive', 'entry', id],
    queryFn: () => api.drive.entry(id as string),
    enabled: !!id,
    staleTime: 20_000,
  });
}

/** Create a new Drive sub-folder under `parent`. Returns the new folder entry. */
export function useCreateDriveFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.drive.createFolder>[0]) => api.drive.createFolder(body),
    onSuccess: (_entry, vars) => {
      qc.invalidateQueries({ queryKey: ['drive', 'children', vars.parent ?? '__root__'] });
      // Folders-only query is keyed separately; invalidate broadly.
      qc.invalidateQueries({ queryKey: ['drive', 'children'] });
    },
  });
}

/** Upload a file into a Drive folder, then refresh the listing for that folder. */
export function useUploadToDriveFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { parent: string; file: File }) => api.drive.upload(args.parent, args.file),
    onSuccess: (_entry, vars) => {
      qc.invalidateQueries({ queryKey: ['drive', 'children', vars.parent] });
    },
  });
}

/** Rename a Drive file. We broadly invalidate the children cache — name ordering may shift. */
export function useRenameDriveEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; name: string }) => api.drive.rename(args.id, args.name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drive', 'children'] });
    },
  });
}

/** Trash a Drive file. Refresh both source folder and the generic cache. */
export function useTrashDriveEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.drive.trash(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drive', 'children'] });
    },
  });
}

/** Move a Drive file to another folder. */
export function useMoveDriveEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; parentId: string; fromParentId?: string }) =>
      api.drive.move(args.id, args.parentId, args.fromParentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drive', 'children'] });
    },
  });
}

// Google Calendar connection
export function useGoogleCalendarStatus() {
  return useQuery({
    queryKey: ['calendar', 'google', 'status'],
    queryFn: () => api.calendar.google.status(),
    staleTime: 30_000,
  });
}
export function useConnectGoogleCalendar() {
  return useMutation({
    mutationFn: () => api.calendar.google.connect(),
  });
}
export function useDisconnectGoogleCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.calendar.google.disconnect(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar', 'google'] }),
  });
}
export function useTestGoogleCalendar() {
  return useMutation({
    mutationFn: () => api.calendar.google.test(),
  });
}

// Notification preferences
export function useNotificationPrefs() {
  return useQuery({ queryKey: ['notifications', 'prefs'], queryFn: () => api.notifications.prefs() });
}
export function usePatchNotificationPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.notifications.patchPrefs>[0]) => api.notifications.patchPrefs(body),
    onSuccess: (data) => qc.setQueryData(['notifications', 'prefs'], data),
  });
}
export function useSendDigestTest() {
  return useMutation({ mutationFn: () => api.notifications.sendTest() });
}
