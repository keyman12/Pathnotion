// Thin wrapper around the Google Drive API for the PathNotion integration.
// - Lists shared drives the user can access (for the picker in Settings).
// - Lists folders and files under a given parent (for the browse UI).
// - Ensures a "Jeff" folder exists at the chosen shared drive's root (for agent outputs).
//
// Scopes required: drive.readonly (browse) + drive.file (create/rename/move/delete files we own).
// The OAuth client is shared with google-calendar.ts via `makeOAuthClient`.

import { Readable } from 'node:stream';
import { google, type drive_v3 } from 'googleapis';
import { makeOAuthClient, type GoogleTokens } from './google-calendar.js';

export const JEFF_FOLDER_NAME = 'Jeff';

export type DriveMimeType =
  | 'application/vnd.google-apps.folder'
  | 'application/vnd.google-apps.document'
  | 'application/vnd.google-apps.spreadsheet'
  | 'application/vnd.google-apps.presentation'
  | string;

export interface DriveEntry {
  id: string;
  name: string;
  mimeType: DriveMimeType;
  parents: string[];
  modifiedTime: string | null;
  size: number | null;
  iconLink: string | null;
  webViewLink: string | null;
  owners: { displayName: string | null; emailAddress: string | null }[];
  trashed: boolean;
}

export interface SharedDriveSummary {
  id: string;
  name: string;
  colorRgb: string | null;
  createdTime: string | null;
}

function driveApi(tokens: GoogleTokens): drive_v3.Drive {
  const client = makeOAuthClient(tokens);
  return google.drive({ version: 'v3', auth: client });
}

function toEntry(f: drive_v3.Schema$File): DriveEntry {
  return {
    id: f.id ?? '',
    name: f.name ?? '',
    mimeType: (f.mimeType ?? '') as DriveMimeType,
    parents: f.parents ?? [],
    modifiedTime: f.modifiedTime ?? null,
    size: f.size ? Number(f.size) : null,
    iconLink: f.iconLink ?? null,
    webViewLink: f.webViewLink ?? null,
    owners: (f.owners ?? []).map((o) => ({ displayName: o.displayName ?? null, emailAddress: o.emailAddress ?? null })),
    trashed: !!f.trashed,
  };
}

const BASE_FIELDS = 'id,name,mimeType,parents,modifiedTime,size,iconLink,webViewLink,owners(displayName,emailAddress),trashed';

/** Shared drives the user can access. Used by the Settings picker. */
export async function listSharedDrives(tokens: GoogleTokens): Promise<SharedDriveSummary[]> {
  const drive = driveApi(tokens);
  const out: SharedDriveSummary[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.drives.list({
      pageSize: 100,
      pageToken,
      fields: 'nextPageToken,drives(id,name,colorRgb,createdTime)',
    });
    for (const d of res.data.drives ?? []) {
      if (d.id && d.name) {
        out.push({
          id: d.id,
          name: d.name,
          colorRgb: d.colorRgb ?? null,
          createdTime: d.createdTime ?? null,
        });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

/** Top-level folder of a shared drive is the drive itself — pass `driveId` as `parentId`. */
export async function listChildren(
  tokens: GoogleTokens,
  opts: { driveId: string; parentId?: string; foldersOnly?: boolean; filesOnly?: boolean; pageSize?: number },
): Promise<DriveEntry[]> {
  const drive = driveApi(tokens);
  const parent = opts.parentId ?? opts.driveId;
  const clauses = [`'${parent}' in parents`, 'trashed = false'];
  if (opts.foldersOnly) clauses.push("mimeType = 'application/vnd.google-apps.folder'");
  else if (opts.filesOnly) clauses.push("mimeType != 'application/vnd.google-apps.folder'");
  const q = clauses.join(' and ');
  const out: DriveEntry[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q,
      corpora: 'drive',
      driveId: opts.driveId,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      pageSize: opts.pageSize ?? 200,
      pageToken,
      fields: `nextPageToken,files(${BASE_FIELDS})`,
      orderBy: 'folder,name',
    });
    for (const f of res.data.files ?? []) out.push(toEntry(f));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

export async function getEntry(tokens: GoogleTokens, id: string): Promise<DriveEntry | null> {
  try {
    const drive = driveApi(tokens);
    const res = await drive.files.get({ fileId: id, fields: BASE_FIELDS, supportsAllDrives: true });
    return toEntry(res.data);
  } catch {
    return null;
  }
}

/** Create a folder if one with the same name doesn't already exist under the parent. */
export async function ensureFolder(
  tokens: GoogleTokens,
  opts: { driveId: string; parentId?: string; name: string },
): Promise<DriveEntry> {
  const drive = driveApi(tokens);
  const parent = opts.parentId ?? opts.driveId;
  // Look for an existing folder with this name first.
  const existing = await drive.files.list({
    q: `'${parent}' in parents and name = '${opts.name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    corpora: 'drive',
    driveId: opts.driveId,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    fields: `files(${BASE_FIELDS})`,
    pageSize: 1,
  });
  if (existing.data.files?.[0]) return toEntry(existing.data.files[0]);

  const created = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name: opts.name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parent],
    },
    fields: BASE_FIELDS,
  });
  return toEntry(created.data);
}

/** Bootstrap the workspace: ensure a Jeff folder at the root of the shared drive. */
export async function ensureJeffFolder(tokens: GoogleTokens, driveId: string): Promise<DriveEntry> {
  return ensureFolder(tokens, { driveId, parentId: driveId, name: JEFF_FOLDER_NAME });
}

/** Map of output "kinds" to their folder name under Jeff/. Any new scheduled job declares
 *  its kind when it saves a file, and the renderer routes it into the matching subfolder.
 *  Keeps Jeff's desk tidy as new job types land — you never need a new folder decision. */
export const JEFF_SUBFOLDERS = {
  digest:    'Digests',    // periodic recaps (daily, weekly, monthly)
  watch:     'Watch',      // tracking external sources over time (competitors, regulation)
  research:  'Research',   // reference material built up per topic
  generated: 'Generated',  // user-requested one-offs from chat (decks, PDFs, sheets)
} as const;

export type JeffDeskKind = keyof typeof JEFF_SUBFOLDERS;

/** Ensure a subfolder of Jeff/ exists and return it. Optionally nests further — e.g. per-
 *  competitor sub-folders under Research. Idempotent; safe to call on every save. */
export async function ensureJeffSubfolder(
  tokens: GoogleTokens,
  opts: { driveId: string; jeffFolderId: string; kind: JeffDeskKind; subPath?: string[] },
): Promise<DriveEntry> {
  let current = await ensureFolder(tokens, {
    driveId: opts.driveId,
    parentId: opts.jeffFolderId,
    name: JEFF_SUBFOLDERS[opts.kind],
  });
  for (const name of opts.subPath ?? []) {
    // eslint-disable-next-line no-await-in-loop
    current = await ensureFolder(tokens, {
      driveId: opts.driveId,
      parentId: current.id,
      name,
    });
  }
  return current;
}

/** Upload a file into the given Drive folder. Buffer-based — suits the small files our
 *  team will drop from the browser. For big uploads we'd swap this for resumable. */
export async function uploadFile(
  tokens: GoogleTokens,
  opts: { parentId: string; name: string; mimeType: string; data: Buffer },
): Promise<DriveEntry> {
  const drive = driveApi(tokens);
  const res = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name: opts.name,
      parents: [opts.parentId],
    },
    media: {
      mimeType: opts.mimeType || 'application/octet-stream',
      body: Readable.from(opts.data),
    },
    fields: BASE_FIELDS,
  });
  return toEntry(res.data);
}

/** Rename a file. Drive keeps the same id, so the row position won't jump. */
export async function renameFile(tokens: GoogleTokens, id: string, name: string): Promise<DriveEntry> {
  const drive = driveApi(tokens);
  const res = await drive.files.update({
    fileId: id,
    supportsAllDrives: true,
    requestBody: { name },
    fields: BASE_FIELDS,
  });
  return toEntry(res.data);
}

/** Move a file between folders. Caller tells us the old parents so we can remove them cleanly. */
export async function moveFile(
  tokens: GoogleTokens,
  id: string,
  opts: { addParent: string; removeParents?: string[] },
): Promise<DriveEntry> {
  const drive = driveApi(tokens);
  const res = await drive.files.update({
    fileId: id,
    supportsAllDrives: true,
    addParents: opts.addParent,
    removeParents: (opts.removeParents ?? []).join(','),
    fields: BASE_FIELDS,
  });
  return toEntry(res.data);
}

/** Move a file to Drive's trash. Users can restore it from Google Drive's UI. */
export async function trashFile(tokens: GoogleTokens, id: string): Promise<void> {
  const drive = driveApi(tokens);
  await drive.files.update({
    fileId: id,
    supportsAllDrives: true,
    requestBody: { trashed: true },
    fields: 'id',
  });
}

/** Pull the usable content of a Drive entry for Jeff to reason over.
 *  - Google Docs -> plain text export
 *  - Google Sheets -> CSV export
 *  - Google Slides -> plain text export
 *  - PDF / images -> raw bytes (for Anthropic's document / image content blocks)
 *  - text / markdown / CSV -> raw text
 *  Returns null for anything we don't know how to summarise (ZIP, video, etc.). Caps size at
 *  `maxBytes` for text and binary separately so a single huge file can't stall the whole scan. */
export async function fetchFileContent(
  tokens: GoogleTokens,
  entry: DriveEntry,
  opts: { maxTextChars?: number; maxBytes?: number } = {},
): Promise<
  | { kind: 'text'; text: string }
  | { kind: 'binary'; data: Buffer; mediaType: 'application/pdf' | `image/${string}` }
  | null
> {
  const drive = driveApi(tokens);
  const mime = entry.mimeType;
  const maxTextChars = opts.maxTextChars ?? 30_000;
  const maxBytes = opts.maxBytes ?? 10 * 1024 * 1024;

  if (mime === 'application/vnd.google-apps.document') {
    const res = await drive.files.export({ fileId: entry.id, mimeType: 'text/plain' }, { responseType: 'text' });
    return { kind: 'text', text: String(res.data ?? '').slice(0, maxTextChars) };
  }
  if (mime === 'application/vnd.google-apps.spreadsheet') {
    const res = await drive.files.export({ fileId: entry.id, mimeType: 'text/csv' }, { responseType: 'text' });
    return { kind: 'text', text: String(res.data ?? '').slice(0, maxTextChars) };
  }
  if (mime === 'application/vnd.google-apps.presentation') {
    const res = await drive.files.export({ fileId: entry.id, mimeType: 'text/plain' }, { responseType: 'text' });
    return { kind: 'text', text: String(res.data ?? '').slice(0, maxTextChars) };
  }
  if (mime === 'application/pdf' || mime.startsWith('image/')) {
    if (entry.size != null && entry.size > maxBytes) return null;
    const res = await drive.files.get(
      { fileId: entry.id, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' },
    );
    const buffer = Buffer.from(res.data as ArrayBuffer);
    return {
      kind: 'binary',
      data: buffer,
      mediaType: (mime === 'application/pdf' ? 'application/pdf' : mime) as any,
    };
  }
  if (mime === 'text/plain' || mime === 'text/markdown' || mime === 'text/csv') {
    const res = await drive.files.get(
      { fileId: entry.id, alt: 'media', supportsAllDrives: true },
      { responseType: 'text' },
    );
    return { kind: 'text', text: String(res.data ?? '').slice(0, maxTextChars) };
  }
  return null;
}

/** Recursive-but-bounded walk of a shared drive. Returns files (not folders) across all
 *  nested folders up to `maxDepth`, capped at `maxFiles`. Used by the drive-file scan.
 *  Walks folders wider-first so we cover more of the tree before hitting the file cap. */
export async function walkFiles(
  tokens: GoogleTokens,
  opts: { driveId: string; rootId?: string; maxDepth?: number; maxFiles?: number; acceptedMimes?: (mime: string) => boolean },
): Promise<DriveEntry[]> {
  const maxDepth = opts.maxDepth ?? 4;
  const maxFiles = opts.maxFiles ?? 50;
  const accepted = opts.acceptedMimes ?? (() => true);
  const root = opts.rootId ?? opts.driveId;

  const queue: Array<{ id: string; depth: number }> = [{ id: root, depth: 0 }];
  const out: DriveEntry[] = [];
  while (queue.length && out.length < maxFiles) {
    const { id, depth } = queue.shift()!;
    // eslint-disable-next-line no-await-in-loop
    const children = await listChildren(tokens, { driveId: opts.driveId, parentId: id });
    for (const c of children) {
      if (c.mimeType === 'application/vnd.google-apps.folder') {
        if (depth < maxDepth) queue.push({ id: c.id, depth: depth + 1 });
      } else if (accepted(c.mimeType)) {
        out.push(c);
        if (out.length >= maxFiles) break;
      }
    }
  }
  return out;
}

/** Download an uploaded (non-Google-native) file as a binary stream, so the browser can save it. */
export async function downloadFile(
  tokens: GoogleTokens,
  id: string,
): Promise<{ stream: NodeJS.ReadableStream; name: string; mimeType: string }> {
  const drive = driveApi(tokens);
  const meta = await drive.files.get({ fileId: id, fields: 'id,name,mimeType', supportsAllDrives: true });
  const name = meta.data.name ?? 'download';
  const mimeType = meta.data.mimeType ?? 'application/octet-stream';
  if (mimeType.startsWith('application/vnd.google-apps.')) {
    throw Object.assign(new Error('Google-native files open in Drive — use the preview link.'), { status: 400 });
  }
  const res = await drive.files.get(
    { fileId: id, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' },
  );
  return { stream: res.data as unknown as NodeJS.ReadableStream, name, mimeType };
}
