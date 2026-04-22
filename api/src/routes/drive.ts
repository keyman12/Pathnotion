import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { db } from '../db/client.js';
import { decryptToken } from '../services/token-vault.js';
import { type GoogleTokens } from '../services/google-calendar.js';
import {
  downloadFile,
  ensureFolder,
  ensureJeffFolder,
  getEntry,
  listChildren,
  listSharedDrives,
  moveFile,
  renameFile,
  trashFile,
  uploadFile,
} from '../services/google-drive.js';

export const driveRouter = Router();

// 50MB cap keeps memory usage bounded. Big uploads should go via Drive's web UI for now.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ─── Helpers ────────────────────────────────────────────────────────────────

function requireUser(req: any): { key: string } {
  const key = req.session?.userKey;
  if (!key) throw Object.assign(new Error('Not authenticated'), { status: 401 });
  return { key };
}

function requireGoogleTokens(userKey: string): GoogleTokens {
  const row = db.prepare(
    "SELECT access_token, refresh_token, token_expiry, scope FROM calendar_sources WHERE user_key = ? AND provider = 'google' LIMIT 1",
  ).get(userKey) as { access_token: string | null; refresh_token: string | null; token_expiry: number | null; scope: string | null } | undefined;
  if (!row) throw Object.assign(new Error('Google not connected'), { status: 404 });
  return {
    access_token: decryptToken(row.access_token),
    refresh_token: decryptToken(row.refresh_token),
    expiry_date: row.token_expiry ?? null,
    scope: row.scope,
  };
}

function readConfig(): { driveId: string | null; driveName: string | null; jeffFolderId: string | null } {
  const row = db.prepare('SELECT drive_id, drive_name, jeff_folder_id FROM workspace_config WHERE id = 1').get() as
    | { drive_id: string | null; drive_name: string | null; jeff_folder_id: string | null }
    | undefined;
  return {
    driveId: row?.drive_id ?? null,
    driveName: row?.drive_name ?? null,
    jeffFolderId: row?.jeff_folder_id ?? null,
  };
}

// ─── Workspace config ───────────────────────────────────────────────────────

driveRouter.get('/config', (req, res) => {
  try {
    requireUser(req);
    res.json(readConfig());
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Server error' });
  }
});

const setDriveSchema = z.object({
  driveId: z.string().min(1),
  driveName: z.string().min(1),
});

driveRouter.put('/config/drive', async (req, res) => {
  try {
    const { key } = requireUser(req);
    const parsed = setDriveSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());

    // Upsert workspace config.
    db.prepare(`
      INSERT INTO workspace_config (id, drive_id, drive_name, jeff_folder_id, updated_at, updated_by)
      VALUES (1, @driveId, @driveName, NULL, datetime('now'), @by)
      ON CONFLICT(id) DO UPDATE SET
        drive_id = excluded.drive_id,
        drive_name = excluded.drive_name,
        jeff_folder_id = CASE WHEN workspace_config.drive_id = excluded.drive_id THEN workspace_config.jeff_folder_id ELSE NULL END,
        updated_at = datetime('now'),
        updated_by = excluded.updated_by
    `).run({ driveId: parsed.data.driveId, driveName: parsed.data.driveName, by: key });

    // Bootstrap the Jeff folder under the chosen shared drive (uses the calling user's tokens).
    try {
      const tokens = requireGoogleTokens(key);
      const jeff = await ensureJeffFolder(tokens, parsed.data.driveId);
      db.prepare("UPDATE workspace_config SET jeff_folder_id = ? WHERE id = 1").run(jeff.id);
    } catch (err) {
      console.warn('[drive/config] Could not bootstrap Jeff folder:', (err as Error).message);
    }

    res.json(readConfig());
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Server error' });
  }
});

// ─── Drive API proxy ────────────────────────────────────────────────────────

driveRouter.get('/shared-drives', async (req, res) => {
  try {
    const { key } = requireUser(req);
    const tokens = requireGoogleTokens(key);
    const drives = await listSharedDrives(tokens);
    res.json(drives);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Server error' });
  }
});

driveRouter.get('/children', async (req, res) => {
  try {
    const { key } = requireUser(req);
    const tokens = requireGoogleTokens(key);
    const cfg = readConfig();
    if (!cfg.driveId) return res.status(400).json({ error: 'No shared drive chosen yet.' });

    const parentId = typeof req.query.parent === 'string' && req.query.parent ? req.query.parent : cfg.driveId;
    const foldersOnly = req.query.kind === 'folders';
    const filesOnly = req.query.kind === 'files';
    const entries = await listChildren(tokens, {
      driveId: cfg.driveId,
      parentId,
      foldersOnly,
      filesOnly,
    });
    res.json(entries);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Server error' });
  }
});

driveRouter.get('/entry/:id', async (req, res) => {
  try {
    const { key } = requireUser(req);
    const tokens = requireGoogleTokens(key);
    const entry = await getEntry(tokens, req.params.id);
    if (!entry) return res.status(404).json({ error: 'Not found' });
    res.json(entry);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Server error' });
  }
});

// Rename and/or move a file in one call. Body:
//   { name?: string, moveTo?: { parentId: string, fromParentId?: string } }
const patchEntrySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  moveTo: z.object({
    parentId: z.string().min(1),
    fromParentId: z.string().optional(),
  }).optional(),
});

driveRouter.patch('/entry/:id', async (req, res) => {
  try {
    const { key } = requireUser(req);
    const tokens = requireGoogleTokens(key);
    const parsed = patchEntrySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());

    let latest = await getEntry(tokens, req.params.id);
    if (!latest) return res.status(404).json({ error: 'Not found' });

    if (parsed.data.name && parsed.data.name !== latest.name) {
      latest = await renameFile(tokens, req.params.id, parsed.data.name);
    }
    if (parsed.data.moveTo) {
      const remove = parsed.data.moveTo.fromParentId
        ? [parsed.data.moveTo.fromParentId]
        : latest.parents ?? [];
      latest = await moveFile(tokens, req.params.id, {
        addParent: parsed.data.moveTo.parentId,
        removeParents: remove,
      });
    }
    res.json(latest);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Server error' });
  }
});

// Soft delete — Drive trash. Restore from Google Drive's UI if needed.
driveRouter.delete('/entry/:id', async (req, res) => {
  try {
    const { key } = requireUser(req);
    const tokens = requireGoogleTokens(key);
    await trashFile(tokens, req.params.id);
    res.status(204).send();
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Server error' });
  }
});

// Binary download for uploaded (non-Google-native) files.
// Pass ?inline=1 for images previews etc. — serves the bytes without forcing a Save dialog.
driveRouter.get('/entry/:id/download', async (req, res) => {
  try {
    const { key } = requireUser(req);
    const tokens = requireGoogleTokens(key);
    const { stream, name, mimeType } = await downloadFile(tokens, req.params.id);
    const inline = req.query.inline === '1';
    // HTTP headers only allow ASCII. Drop anything else from the filename (em-dashes, accents, etc.)
    // and collapse any runs of whitespace that this leaves behind.
    const safeName = name.replace(/[^\x20-\x7E]/g, '').replace(/"/g, '').replace(/\s+/g, ' ').trim() || 'download';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`);
    stream.pipe(res);
    stream.on('error', (err) => {
      console.error('[drive/download] stream error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
      else res.end();
    });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Server error' });
  }
});

// Upload a single file into a Drive folder. Expects multipart with `file` + `parent` form field.
driveRouter.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { key } = requireUser(req);
    const tokens = requireGoogleTokens(key);
    const cfg = readConfig();
    if (!cfg.driveId) return res.status(400).json({ error: 'No shared drive chosen yet.' });

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: 'Missing file.' });

    const parent = typeof req.body?.parent === 'string' && req.body.parent ? req.body.parent : cfg.driveId;

    const entry = await uploadFile(tokens, {
      parentId: parent,
      name: file.originalname,
      mimeType: file.mimetype,
      data: file.buffer,
    });
    res.status(201).json(entry);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Server error' });
  }
});

// Create a new sub-folder inside the given parent. Re-used if a folder with the same name
// already exists (so the button is idempotent).
const newFolderSchema = z.object({ parent: z.string().optional(), name: z.string().min(1).max(100) });
driveRouter.post('/folders', async (req, res) => {
  try {
    const { key } = requireUser(req);
    const tokens = requireGoogleTokens(key);
    const cfg = readConfig();
    if (!cfg.driveId) return res.status(400).json({ error: 'No shared drive chosen yet.' });
    const parsed = newFolderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    const folder = await ensureFolder(tokens, {
      driveId: cfg.driveId,
      parentId: parsed.data.parent ?? cfg.driveId,
      name: parsed.data.name.trim(),
    });
    res.status(201).json(folder);
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Server error' });
  }
});

driveRouter.post('/bootstrap-jeff', async (req, res) => {
  try {
    const { key } = requireUser(req);
    const tokens = requireGoogleTokens(key);
    const cfg = readConfig();
    if (!cfg.driveId) return res.status(400).json({ error: 'No shared drive chosen yet.' });
    const jeff = await ensureJeffFolder(tokens, cfg.driveId);
    db.prepare("UPDATE workspace_config SET jeff_folder_id = ? WHERE id = 1").run(jeff.id);
    res.json({ folderId: jeff.id, name: jeff.name });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Server error' });
  }
});
