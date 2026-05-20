import { db } from '../db/client.js';

export type SalesStage = 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'commit' | 'won' | 'lost';
export type SalesStatus = 'active' | 'won' | 'lost' | 'parked';
export type SalesForecastLabel = 'pipeline' | 'best_case' | 'commit';

export const SALES_STAGES: SalesStage[] = ['lead', 'qualified', 'proposal', 'negotiation', 'commit', 'won', 'lost'];

export const FORECAST_DEFAULTS: Record<SalesStage, Record<SalesForecastLabel, number>> = {
  lead:        { pipeline: 10, best_case: 15, commit: 20 },
  qualified:   { pipeline: 20, best_case: 30, commit: 40 },
  proposal:    { pipeline: 35, best_case: 50, commit: 60 },
  negotiation: { pipeline: 50, best_case: 65, commit: 75 },
  commit:      { pipeline: 70, best_case: 85, commit: 95 },
  won:         { pipeline: 100, best_case: 100, commit: 100 },
  lost:        { pipeline: 0, best_case: 0, commit: 0 },
};

export interface SalesOpportunityRow {
  id: string;
  name: string;
  accountName: string;
  contactName: string;
  contactTitle: string | null;
  contactLocation: string | null;
  contactPhotoUrl: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  website: string | null;
  ownerKey: string;
  stage: SalesStage;
  status: SalesStatus;
  valueAmount: number;
  currency: string;
  forecastLabel: SalesForecastLabel;
  forecastProbability: number;
  expectedCloseDate: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SalesActivity {
  id: string;
  opportunityId: string;
  type: 'note' | 'stage' | 'link' | 'jeff';
  body: string;
  authorKey: string | null;
  activityDate: string;
  createdAt: string;
}

export interface SalesLink {
  id: string;
  opportunityId: string;
  linkType: 'doc' | 'drive' | 'url' | 'upload' | 'backlog' | 'task' | 'calendar';
  linkRef: string;
  label: string | null;
  createdAt: string;
}

export interface SalesOpportunity extends SalesOpportunityRow {
  weightedValue: number;
  attentionFlags: SalesAttentionFlag[];
  activities?: SalesActivity[];
  links?: SalesLink[];
}

export interface SalesAttentionFlag {
  kind: 'overdue' | 'stale' | 'missing-value' | 'missing-contact' | 'past-close' | 'weak-commit';
  label: string;
}

export interface SalesSummary {
  openPipeline: number;
  weightedForecast: number;
  commitRawThisMonth: number;
  commitWeightedThisMonth: number;
  needsAttention: number;
  activeCount: number;
  forecastByMonth: Array<{
    month: string;
    rawPipeline: number;
    weighted: number;
    commitRaw: number;
    commitWeighted: number;
  }>;
  dueToday: SalesOpportunity[];
  overdue: SalesOpportunity[];
  closeSoon: SalesOpportunity[];
  attention: SalesOpportunity[];
}

type RawOpportunityRow = {
  id: string;
  name: string;
  accountName: string;
  contactName: string;
  contactTitle: string | null;
  contactLocation: string | null;
  contactPhotoUrl: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  website: string | null;
  ownerKey: string;
  stage: SalesStage;
  status: SalesStatus;
  valueAmount: number;
  currency: string;
  forecastLabel: SalesForecastLabel;
  forecastProbability: number;
  expectedCloseDate: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export const SELECT_SALES_OPPORTUNITY = `
  SELECT id,
         name,
         account_name AS accountName,
         contact_name AS contactName,
         contact_title AS contactTitle,
         contact_location AS contactLocation,
         contact_photo_url AS contactPhotoUrl,
         contact_phone AS contactPhone,
         contact_email AS contactEmail,
         website,
         owner_key AS ownerKey,
         stage,
         status,
         value_amount AS valueAmount,
         currency,
         forecast_label AS forecastLabel,
         forecast_probability AS forecastProbability,
         expected_close_date AS expectedCloseDate,
         next_action AS nextAction,
         next_action_date AS nextActionDate,
         notes,
         sort_order AS sortOrder,
         created_at AS createdAt,
         updated_at AS updatedAt
  FROM sales_opportunities
`;

export interface ListSalesOptions {
  stage?: SalesStage;
  status?: SalesStatus;
  ownerKey?: string;
  query?: string;
  limit?: number;
}

export function listSalesOpportunities(options: ListSalesOptions = {}): SalesOpportunity[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (options.stage) {
    clauses.push('stage = ?');
    params.push(options.stage);
  }
  if (options.status) {
    clauses.push('status = ?');
    params.push(options.status);
  }
  if (options.ownerKey) {
    clauses.push('owner_key = ?');
    params.push(options.ownerKey);
  }
  if (options.query?.trim()) {
    clauses.push(`(
      name LIKE ? OR account_name LIKE ? OR contact_name LIKE ? OR contact_phone LIKE ? OR contact_email LIKE ? OR website LIKE ?
    )`);
    const like = `%${options.query.trim()}%`;
    params.push(like, like, like, like, like, like);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = options.limit ? `LIMIT ${Math.max(1, Math.min(200, Math.floor(options.limit)))}` : '';
  const rows = db.prepare(`
    ${SELECT_SALES_OPPORTUNITY}
    ${where}
    ORDER BY
      CASE status WHEN 'active' THEN 0 WHEN 'parked' THEN 1 WHEN 'won' THEN 2 ELSE 3 END,
      sort_order,
      updated_at DESC
    ${limit}
  `).all(...params) as RawOpportunityRow[];
  return rows.map(mapSalesOpportunity);
}

export function getSalesOpportunity(id: string): SalesOpportunity | null {
  const row = db.prepare(`${SELECT_SALES_OPPORTUNITY} WHERE id = ?`).get(id) as RawOpportunityRow | undefined;
  if (!row) return null;
  const opportunity = mapSalesOpportunity(row);
  opportunity.activities = db.prepare(`
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
  `).all(id) as SalesActivity[];
  opportunity.links = db.prepare(`
    SELECT id,
           opportunity_id AS opportunityId,
           link_type AS linkType,
           link_ref AS linkRef,
           label,
           created_at AS createdAt
    FROM sales_links
    WHERE opportunity_id = ?
    ORDER BY created_at DESC
  `).all(id) as SalesLink[];
  return opportunity;
}

export function mapSalesOpportunity(row: RawOpportunityRow): SalesOpportunity {
  const value = Number(row.valueAmount || 0);
  const probability = clampProbability(row.forecastProbability);
  return {
    ...row,
    valueAmount: value,
    forecastProbability: probability,
    weightedValue: Math.round(value * probability / 100),
    attentionFlags: attentionFlags(row),
  };
}

export function buildSalesSummary(today = new Date()): SalesSummary {
  const opportunities = listSalesOpportunities();
  const active = opportunities.filter((o) => o.status === 'active');
  const openPipeline = active.reduce((sum, o) => sum + o.valueAmount, 0);
  const weightedForecast = active.reduce((sum, o) => sum + o.weightedValue, 0);
  const monthKey = today.toISOString().slice(0, 7);
  const commitThisMonth = active.filter((o) => o.forecastLabel === 'commit' && (o.expectedCloseDate ?? '').startsWith(monthKey));
  const attention = active.filter((o) => o.attentionFlags.length > 0);
  return {
    openPipeline,
    weightedForecast,
    commitRawThisMonth: commitThisMonth.reduce((sum, o) => sum + o.valueAmount, 0),
    commitWeightedThisMonth: commitThisMonth.reduce((sum, o) => sum + o.weightedValue, 0),
    needsAttention: attention.length,
    activeCount: active.length,
    forecastByMonth: forecastByMonth(active),
    dueToday: active.filter((o) => isSameDate(o.nextActionDate, today)).slice(0, 5),
    overdue: active.filter((o) => isBeforeDate(o.nextActionDate, today)).slice(0, 5),
    closeSoon: active.filter((o) => isWithinDays(o.expectedCloseDate, today, 30)).slice(0, 5),
    attention: attention.slice(0, 6),
  };
}

export function defaultForecastProbability(stage: SalesStage, label: SalesForecastLabel): number {
  return FORECAST_DEFAULTS[stage]?.[label] ?? 0;
}

function attentionFlags(row: RawOpportunityRow): SalesAttentionFlag[] {
  if (row.status !== 'active') return [];
  const flags: SalesAttentionFlag[] = [];
  const today = new Date();
  if (isBeforeDate(row.nextActionDate, today)) flags.push({ kind: 'overdue', label: 'Overdue next action' });
  if (isBeforeDate(row.expectedCloseDate, today)) flags.push({ kind: 'past-close', label: 'Close date passed' });
  if (daysSince(row.updatedAt, today) >= 14) flags.push({ kind: 'stale', label: 'Stale' });
  if (!row.contactPhone || !row.contactEmail) flags.push({ kind: 'missing-contact', label: 'Missing contact detail' });
  if (['qualified', 'proposal', 'negotiation', 'commit'].includes(row.stage) && !Number(row.valueAmount)) {
    flags.push({ kind: 'missing-value', label: 'Missing value' });
  }
  if (row.stage === 'commit' && row.forecastProbability < 70) flags.push({ kind: 'weak-commit', label: 'Weak commit' });
  return flags;
}

function forecastByMonth(opportunities: SalesOpportunity[]) {
  const map = new Map<string, { rawPipeline: number; weighted: number; commitRaw: number; commitWeighted: number }>();
  for (const o of opportunities) {
    const key = (o.expectedCloseDate ?? '').slice(0, 7) || 'No date';
    const current = map.get(key) ?? { rawPipeline: 0, weighted: 0, commitRaw: 0, commitWeighted: 0 };
    current.rawPipeline += o.valueAmount;
    current.weighted += o.weightedValue;
    if (o.forecastLabel === 'commit') {
      current.commitRaw += o.valueAmount;
      current.commitWeighted += o.weightedValue;
    }
    map.set(key, current);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, values]) => ({ month, ...values }));
}

function clampProbability(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function isSameDate(value: string | null | undefined, date: Date): boolean {
  if (!value) return false;
  return value.slice(0, 10) === date.toISOString().slice(0, 10);
}

function isBeforeDate(value: string | null | undefined, date: Date): boolean {
  if (!value) return false;
  return value.slice(0, 10) < date.toISOString().slice(0, 10);
}

function isWithinDays(value: string | null | undefined, date: Date, days: number): boolean {
  if (!value) return false;
  const target = new Date(value + 'T00:00:00');
  const start = new Date(date.toISOString().slice(0, 10) + 'T00:00:00');
  const diff = target.getTime() - start.getTime();
  return diff >= 0 && diff <= days * 86400_000;
}

function daysSince(value: string | null | undefined, date: Date): number {
  if (!value) return 999;
  const parsed = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  if (Number.isNaN(parsed.getTime())) return 999;
  return Math.floor((date.getTime() - parsed.getTime()) / 86400_000);
}
