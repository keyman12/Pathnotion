import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { db } from '../db/client.js';
import { type GoogleTokens } from '../services/google-calendar.js';
import { decryptToken } from '../services/token-vault.js';
import { ensureFolder, getEntry, uploadFile } from '../services/google-drive.js';
import { createOrRefreshCompanyBrief, findMeetingNotesForOpportunity, findSalesLinkedIn, runInitialSalesEnrichment } from '../services/sales-enrichment.js';
import {
  defaultForecastProbability,
  getSalesOpportunity,
  listSalesOpportunities,
  mapSalesOpportunity,
  SELECT_SALES_OPPORTUNITY,
  buildSalesSummary,
  type SalesForecastLabel,
  type SalesStage,
} from '../services/sales-summary.js';

export const salesRouter = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const SALES_UPLOAD_DIR = path.resolve(__dirname, '../../data/sales_uploads');

const stageSchema = z.enum(['lead', 'qualified', 'proposal', 'negotiation', 'commit', 'won', 'lost']);
const statusSchema = z.enum(['active', 'won', 'lost', 'parked']);
const forecastLabelSchema = z.enum(['pipeline', 'best_case', 'commit']);
const linkTypeSchema = z.enum(['doc', 'drive', 'url', 'upload', 'backlog', 'task', 'calendar']);

const createSchema = z.object({
  name: z.string().min(1),
  accountName: z.string().min(1),
  contactName: z.string().min(1),
  contactPhone: z.string().nullish(),
  contactEmail: z.string().nullish(),
  website: z.string().nullish(),
  ownerKey: z.enum(['D', 'R']).default('D'),
  stage: stageSchema.default('lead'),
  status: statusSchema.default('active'),
  valueAmount: z.number().min(0).default(0),
  currency: z.string().min(1).default('GBP'),
  forecastLabel: forecastLabelSchema.default('pipeline'),
  forecastProbability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.string().nullish(),
  nextAction: z.string().nullish(),
  nextActionDate: z.string().nullish(),
  notes: z.string().nullish(),
  document: z.object({
    linkType: linkTypeSchema.default('url'),
    linkRef: z.string().min(1),
    label: z.string().nullish(),
  }).optional(),
});

salesRouter.get('/opportunities', (_req, res) => {
  res.json(listSalesOpportunities());
});

salesRouter.get('/opportunities/:id', (req, res) => {
  const opportunity = getSalesOpportunity(req.params.id);
  if (!opportunity) return res.status(404).json({ error: 'Not found' });
  res.json(opportunity);
});

salesRouter.post('/opportunities/:id/enrich/linkedin', async (req, res) => {
  try {
    res.json(await findSalesLinkedIn(String(req.params.id)));
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'LinkedIn enrichment failed' });
  }
});

salesRouter.post('/opportunities/:id/enrich/brief', async (req, res) => {
  try {
    res.json(await createOrRefreshCompanyBrief(String(req.params.id)));
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Company brief failed' });
  }
});

salesRouter.post('/opportunities/:id/enrich/meeting-notes', async (req, res) => {
  try {
    const userKey = req.session?.userKey;
    if (!userKey) return res.status(401).json({ error: 'Not authenticated' });
    res.json(await findMeetingNotesForOpportunity(String(req.params.id), requireGoogleTokens(userKey)));
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Meeting notes scan failed' });
  }
});

salesRouter.post('/opportunities', (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const data = parsed.data;
  const last = db.prepare(`
    SELECT id FROM sales_opportunities
    WHERE id GLOB 'CRM-[0-9][0-9][0-9]*'
    ORDER BY CAST(substr(id, 5) AS INTEGER) DESC
    LIMIT 1
  `).get() as { id: string } | undefined;
  const nextNumber = last ? Number(last.id.slice(4)) + 1 : 1;
  const id = `CRM-${String(nextNumber).padStart(3, '0')}`;
  const sortOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS n FROM sales_opportunities').get() as { n: number }).n + 1;
  const probability = data.forecastProbability ?? defaultForecastProbability(data.stage, data.forecastLabel);

  const insert = db.transaction(() => {
    db.prepare(`
      INSERT INTO sales_opportunities (
        id, name, account_name, contact_name, contact_phone, contact_email, website,
        owner_key, stage, status, value_amount, currency, forecast_label, forecast_probability,
        expected_close_date, next_action, next_action_date, notes, sort_order
      )
      VALUES (
        @id, @name, @accountName, @contactName, @contactPhone, @contactEmail, @website,
        @ownerKey, @stage, @status, @valueAmount, @currency, @forecastLabel, @forecastProbability,
        @expectedCloseDate, @nextAction, @nextActionDate, @notes, @sortOrder
      )
    `).run({
      ...data,
      id,
      contactPhone: data.contactPhone ?? null,
      contactEmail: data.contactEmail ?? null,
      website: data.website ?? null,
      forecastProbability: probability,
      expectedCloseDate: data.expectedCloseDate ?? null,
      nextAction: data.nextAction ?? null,
      nextActionDate: data.nextActionDate ?? null,
      notes: data.notes ?? null,
      sortOrder,
    });
    if (data.notes) insertActivity(id, 'note', data.notes, data.ownerKey);
    if (data.document) {
      db.prepare(`
        INSERT INTO sales_links (id, opportunity_id, link_type, link_ref, label)
        VALUES (?, ?, ?, ?, ?)
      `).run(randomUUID(), id, data.document.linkType, data.document.linkRef, data.document.label ?? data.document.linkRef);
      insertActivity(id, 'link', `Linked ${data.document.label ?? data.document.linkRef}`, data.ownerKey);
    }
  });
  insert();

  const row = db.prepare(`${SELECT_SALES_OPPORTUNITY} WHERE id = ?`).get(id) as any;
  res.status(201).json(mapSalesOpportunity(row));
  const userKey = req.session?.userKey;
  void runInitialSalesEnrichment(id, userKey ? requireGoogleTokens(userKey) : undefined);
});

salesRouter.post('/opportunities/:id/attachments', upload.single('file'), (req, res) => {
  const opportunityId = String(req.params.id);
  const opportunity = getSalesOpportunity(opportunityId);
  if (!opportunity) return res.status(404).json({ error: 'Opportunity not found' });
  if (!req.file) return res.status(400).json({ error: 'file is required' });

  fs.mkdirSync(SALES_UPLOAD_DIR, { recursive: true });
  const originalName = req.file.originalname || 'attachment';
  const storedName = `${opportunityId}-${randomUUID()}-${safeFilename(originalName)}`;
  fs.writeFileSync(path.join(SALES_UPLOAD_DIR, storedName), req.file.buffer);

  const id = randomUUID();
  db.prepare(`
    INSERT INTO sales_links (id, opportunity_id, link_type, link_ref, label)
    VALUES (?, ?, 'upload', ?, ?)
  `).run(id, opportunityId, storedName, originalName);
  insertActivity(opportunityId, 'link', `Attached ${originalName}`, opportunity.ownerKey);
  const row = db.prepare(`
    SELECT id,
           opportunity_id AS opportunityId,
           link_type AS linkType,
           link_ref AS linkRef,
           source_ref AS sourceRef,
           label,
           created_at AS createdAt
    FROM sales_links
    WHERE id = ?
  `).get(id);
  res.status(201).json(row);
});

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  accountName: z.string().min(1).optional(),
  contactName: z.string().min(1).optional(),
  contactPhone: z.string().nullish(),
  contactEmail: z.string().nullish(),
  website: z.string().nullish(),
  ownerKey: z.enum(['D', 'R']).optional(),
  stage: stageSchema.optional(),
  status: statusSchema.optional(),
  valueAmount: z.number().min(0).optional(),
  currency: z.string().min(1).optional(),
  forecastLabel: forecastLabelSchema.optional(),
  forecastProbability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.string().nullish(),
  nextAction: z.string().nullish(),
  nextActionDate: z.string().nullish(),
  notes: z.string().nullish(),
  note: z.string().nullish(),
  noteActionDate: z.string().nullish(),
});

salesRouter.patch('/opportunities/:id', (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const before = getSalesOpportunity(req.params.id);
  if (!before) return res.status(404).json({ error: 'Not found' });

  const sets: string[] = [];
  const params: Record<string, unknown> = { id: req.params.id };
  const fieldMap: Array<[keyof typeof parsed.data, string, string]> = [
    ['name', 'name', 'name'],
    ['accountName', 'account_name', 'accountName'],
    ['contactName', 'contact_name', 'contactName'],
    ['contactPhone', 'contact_phone', 'contactPhone'],
    ['contactEmail', 'contact_email', 'contactEmail'],
    ['website', 'website', 'website'],
    ['ownerKey', 'owner_key', 'ownerKey'],
    ['stage', 'stage', 'stage'],
    ['status', 'status', 'status'],
    ['valueAmount', 'value_amount', 'valueAmount'],
    ['currency', 'currency', 'currency'],
    ['forecastLabel', 'forecast_label', 'forecastLabel'],
    ['forecastProbability', 'forecast_probability', 'forecastProbability'],
    ['expectedCloseDate', 'expected_close_date', 'expectedCloseDate'],
    ['nextAction', 'next_action', 'nextAction'],
    ['nextActionDate', 'next_action_date', 'nextActionDate'],
    ['notes', 'notes', 'notes'],
  ];
  for (const [key, column, param] of fieldMap) {
    if (parsed.data[key] !== undefined) {
      sets.push(`${column} = @${param}`);
      params[param] = parsed.data[key] ?? null;
    }
  }
  if (!sets.length && !parsed.data.note) return res.status(400).json({ error: 'No fields to update' });

  const run = db.transaction(() => {
    if (sets.length) {
      sets.push("updated_at = datetime('now')");
      db.prepare(`UPDATE sales_opportunities SET ${sets.join(', ')} WHERE id = @id`).run(params);
    }
    const note = parsed.data.note?.trim();
    const noteActionDate = parsed.data.noteActionDate?.trim();
    if (note) {
      insertActivity(req.params.id, 'note', note, parsed.data.ownerKey ?? before.ownerKey);
      if (noteActionDate) {
        db.prepare(`
          UPDATE sales_opportunities
          SET next_action = ?,
              next_action_date = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(note, noteActionDate, req.params.id);
      }
    }
    if (parsed.data.stage && parsed.data.stage !== before.stage) {
      insertActivity(req.params.id, 'stage', `Stage moved to ${stageLabel(parsed.data.stage)}`, parsed.data.ownerKey ?? before.ownerKey);
    }
  });
  run();

  const row = getSalesOpportunity(req.params.id);
  res.json(row);
});

salesRouter.delete('/opportunities/:id', (req, res) => {
  const result = db.prepare('DELETE FROM sales_opportunities WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

const reorderSchema = z.array(z.object({
  id: z.string(),
  stage: stageSchema.optional(),
  sortOrder: z.number().int(),
}));

salesRouter.post('/opportunities/reorder', (req, res) => {
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const stmt = db.prepare(`
    UPDATE sales_opportunities
    SET sort_order = @sortOrder,
        stage = COALESCE(@stage, stage),
        status = CASE WHEN @stage = 'won' THEN 'won' WHEN @stage = 'lost' THEN 'lost' ELSE status END,
        updated_at = datetime('now')
    WHERE id = @id
  `);
  const run = db.transaction((items: typeof parsed.data) => {
    for (const it of items) stmt.run({ id: it.id, sortOrder: it.sortOrder, stage: it.stage ?? null });
  });
  run(parsed.data);
  res.status(204).send();
});

salesRouter.get('/summary', (_req, res) => {
  res.json(buildSalesSummary());
});

const activitySchema = z.object({
  opportunityId: z.string().min(1),
  type: z.enum(['note', 'stage', 'link', 'jeff']).default('note'),
  body: z.string().min(1),
  authorKey: z.enum(['D', 'R']).nullish(),
});

salesRouter.get('/activities', (req, res) => {
  const opportunityId = String(req.query.opportunity ?? '');
  if (!opportunityId) return res.status(400).json({ error: 'opportunity is required' });
  const rows = db.prepare(`
    SELECT id,
           opportunity_id AS opportunityId,
           type,
           body,
           author_key AS authorKey,
           activity_date AS activityDate,
           created_at AS createdAt
    FROM sales_activities
    WHERE opportunity_id = ?
    ORDER BY activity_date DESC, rowid DESC
  `).all(opportunityId);
  res.json(rows);
});

salesRouter.post('/activities', (req, res) => {
  const parsed = activitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const id = insertActivity(parsed.data.opportunityId, parsed.data.type, parsed.data.body, parsed.data.authorKey ?? null);
  const row = db.prepare(`
    SELECT id,
           opportunity_id AS opportunityId,
           type,
           body,
           author_key AS authorKey,
           activity_date AS activityDate,
           created_at AS createdAt
    FROM sales_activities
    WHERE id = ?
  `).get(id);
  res.status(201).json(row);
});

const linkSchema = z.object({
  opportunityId: z.string().min(1),
  linkType: linkTypeSchema,
  linkRef: z.string().min(1),
  label: z.string().nullish(),
});

salesRouter.post('/links', (req, res) => {
  const parsed = linkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const id = randomUUID();
  db.prepare(`
    INSERT INTO sales_links (id, opportunity_id, link_type, link_ref, label)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, parsed.data.opportunityId, parsed.data.linkType, parsed.data.linkRef, parsed.data.label ?? null);
  insertActivity(parsed.data.opportunityId, 'link', `Linked ${parsed.data.label ?? parsed.data.linkRef}`, null);
  const row = db.prepare(`
    SELECT id,
           opportunity_id AS opportunityId,
           link_type AS linkType,
           link_ref AS linkRef,
           source_ref AS sourceRef,
           label,
           created_at AS createdAt
    FROM sales_links
    WHERE id = ?
  `).get(id);
  res.status(201).json(row);
});

salesRouter.post('/links/:id/open', async (req, res) => {
  try {
    const userKey = req.session?.userKey;
    if (!userKey) return res.status(401).json({ error: 'Not authenticated' });
    const id = String(req.params.id);
    const link = readSalesLink(id);
    if (!link) return res.status(404).json({ error: 'Not found' });

    if (link.linkType === 'url') {
      return res.json({ url: normalizeUrl(link.linkRef), link });
    }

    if (link.linkType === 'drive') {
      const tokens = requireGoogleTokens(userKey);
      const entry = await getEntry(tokens, link.linkRef);
      if (!entry?.webViewLink) return res.status(404).json({ error: 'Drive file not found' });
      return res.json({ url: entry.webViewLink, link });
    }

    if (link.linkType === 'upload') {
      const promoted = await promoteUploadToDrive(userKey, link);
      return res.json(promoted);
    }

    return res.status(400).json({ error: 'This file type opens inside PathNotion.' });
  } catch (err: any) {
    res.status(err.status ?? 500).json({ error: err.message ?? 'Server error' });
  }
});

salesRouter.delete('/links/:id', (req, res) => {
  const id = String(req.params.id);
  const link = db.prepare(`
    SELECT id,
           opportunity_id AS opportunityId,
           link_type AS linkType,
           link_ref AS linkRef,
           source_ref AS sourceRef,
           label
    FROM sales_links
    WHERE id = ?
  `).get(id) as { id: string; opportunityId: string; linkType: string; linkRef: string; label: string | null } | undefined;
  if (!link) return res.status(404).json({ error: 'Not found' });
  const result = db.prepare('DELETE FROM sales_links WHERE id = ?').run(id);
  if (link.linkType === 'upload') {
    try { fs.unlinkSync(path.join(SALES_UPLOAD_DIR, link.linkRef)); } catch { /* already gone */ }
  }
  if (result.changes) insertActivity(link.opportunityId, 'link', `Removed ${link.label ?? link.linkRef}`, null);
  res.status(204).send();
});

function insertActivity(opportunityId: string, type: 'note' | 'stage' | 'link' | 'jeff', body: string, authorKey: string | null) {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO sales_activities (id, opportunity_id, type, body, author_key)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, opportunityId, type, body, authorKey);
  return id;
}

function readSalesLink(id: string) {
  return db.prepare(`
    SELECT id,
           opportunity_id AS opportunityId,
           link_type AS linkType,
           link_ref AS linkRef,
           source_ref AS sourceRef,
           label,
           created_at AS createdAt
    FROM sales_links
    WHERE id = ?
  `).get(id) as {
    id: string;
    opportunityId: string;
    linkType: string;
    linkRef: string;
    sourceRef: string | null;
    label: string | null;
    createdAt: string;
  } | undefined;
}

function requireGoogleTokens(userKey: string): GoogleTokens {
  const row = db.prepare(
    "SELECT access_token, refresh_token, token_expiry, scope FROM calendar_sources WHERE user_key = ? AND provider = 'google' LIMIT 1",
  ).get(userKey) as { access_token: string | null; refresh_token: string | null; token_expiry: number | null; scope: string | null } | undefined;
  if (!row) throw Object.assign(new Error('Google Drive is not connected for this user.'), { status: 404 });
  return {
    access_token: decryptToken(row.access_token),
    refresh_token: decryptToken(row.refresh_token),
    expiry_date: row.token_expiry ?? null,
    scope: row.scope,
  };
}

function readDriveConfig(): { driveId: string | null } {
  const row = db.prepare('SELECT drive_id AS driveId FROM workspace_config WHERE id = 1').get() as { driveId: string | null } | undefined;
  return { driveId: row?.driveId ?? null };
}

async function promoteUploadToDrive(userKey: string, link: NonNullable<ReturnType<typeof readSalesLink>>) {
  const cfg = readDriveConfig();
  if (!cfg.driveId) throw Object.assign(new Error('No Google shared drive is configured.'), { status: 400 });

  const filePath = path.resolve(SALES_UPLOAD_DIR, link.linkRef);
  if (!filePath.startsWith(SALES_UPLOAD_DIR + path.sep)) throw Object.assign(new Error('Invalid file path'), { status: 400 });
  if (!fs.existsSync(filePath)) throw Object.assign(new Error('File not found'), { status: 404 });

  const tokens = requireGoogleTokens(userKey);
  const folder = await ensureFolder(tokens, {
    driveId: cfg.driveId,
    parentId: cfg.driveId,
    name: 'Sales CRM attachments',
  });
  const label = link.label ?? path.basename(link.linkRef);
  const entry = await uploadFile(tokens, {
    parentId: folder.id,
    name: label,
    mimeType: mimeTypeForFile(label),
    data: fs.readFileSync(filePath),
  });
  if (!entry.webViewLink) throw Object.assign(new Error('Google Drive did not return an open link.'), { status: 502 });

  db.prepare(`
    UPDATE sales_links
    SET link_type = 'drive',
        link_ref = ?
    WHERE id = ?
  `).run(entry.id, link.id);
  try { fs.unlinkSync(filePath); } catch { /* keep going */ }
  insertActivity(link.opportunityId, 'link', `Moved ${label} to Google Drive`, userKey);

  const updated = readSalesLink(link.id);
  return { url: entry.webViewLink, link: updated };
}

function stageLabel(stage: SalesStage | SalesForecastLabel): string {
  return String(stage)
    .replace('_', ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function safeFilename(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160) || 'attachment';
}

function mimeTypeForFile(name: string): string {
  const ext = path.extname(name).toLowerCase();
  const types: Record<string, string> = {
    '.csv': 'text/csv',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.md': 'text/markdown; charset=utf-8',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain; charset=utf-8',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return types[ext] ?? 'application/octet-stream';
}

function normalizeUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}
