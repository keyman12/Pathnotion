import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { askJeff, JEFF_MODEL_REPORT } from './jeff.js';
import { getSalesOpportunity, type SalesOpportunity } from './sales-summary.js';

type SalesLinkRow = {
  id: string;
  opportunityId: string;
  linkType: 'doc' | 'drive' | 'url' | 'upload' | 'backlog' | 'task' | 'calendar';
  linkRef: string;
  label: string | null;
  createdAt: string;
};

type LinkedInProfileResult = {
  url: string;
  displayName?: string;
  title?: string;
  location?: string;
  imageUrl?: string;
  email?: string;
  phone?: string;
  website?: string;
  label?: string;
  reason?: string;
};

export interface SalesEnrichmentResult {
  opportunity: SalesOpportunity;
  link?: SalesLinkRow;
  docId?: string;
  summary?: string;
}

export async function findSalesLinkedIn(opportunityId: string): Promise<SalesEnrichmentResult> {
  const opportunity = requireOpportunity(opportunityId);
  const existing = findExistingLink(opportunityId, 'linkedin.com');

  const prompt = `Find the most likely LinkedIn profile URL for this sales opportunity contact.

Contact: ${opportunity.contactName}
Company: ${opportunity.accountName}
Opportunity: ${opportunity.name}
Known website: ${opportunity.website ?? '(none)'}
Known email: ${opportunity.contactEmail ?? '(none)'}
Known phone: ${opportunity.contactPhone ?? '(none)'}
Current LinkedIn link, if any: ${existing?.linkRef ?? '(none)'}

Use web_search. Prefer a personal LinkedIn profile matching both the contact name and company. If you cannot confidently find a personal profile, use the company LinkedIn page.
If the opportunity is missing email, phone, or website, look for verifiable contact/company values from the contact profile, company website, or other official public sources. Do not guess personal email addresses.

Return only compact JSON:
{"url":"https://www.linkedin.com/...","display_name":"Person or company name","title":"job title if known","location":"location if known","image_url":"public profile image URL if directly available","email":"verified email if found","phone":"verified phone if found","website":"verified company/contact website if found","confidence":"high|medium|low","reason":"one short sentence"}
Use null for unknown title, location, image_url, email, phone, or website.
Do not include markdown.`;

  const result = await askJeff({
    message: prompt,
    maxSteps: 4,
    maxTokens: 1200,
  });
  const parsed = parseLinkedInResult(result.text);
  if (!parsed?.url) {
    addSalesActivity(opportunityId, 'Jeff could not find a confident LinkedIn match.', 'jeff');
    throw Object.assign(new Error('Jeff could not find a confident LinkedIn match.'), { status: 404 });
  }

  const label = parsed.displayName || parsed.label || opportunity.contactName || opportunity.accountName;
  const link = existing
    ? updateSalesLink(existing.id, normalizeLinkedInUrl(parsed.url), label)
    : insertSalesLink({
        opportunityId,
        linkType: 'url',
        linkRef: normalizeLinkedInUrl(parsed.url),
        label,
      });
  updateLinkedInProfile(opportunityId, parsed);
  const filledFields = fillMissingContactFields(opportunity, parsed);
  addSalesActivity(opportunityId, `Jeff ${existing ? 'updated' : 'added'} LinkedIn link: ${label}${parsed.title ? ` · ${parsed.title}` : ''}${parsed.location ? ` · ${parsed.location}` : ''}. ${parsed.reason ?? ''}`.trim(), 'jeff');
  if (filledFields.length) {
    addSalesActivity(opportunityId, `Jeff filled missing contact fields: ${filledFields.join(', ')}.`, 'jeff');
  }
  return { opportunity: requireOpportunity(opportunityId), link };
}

export async function createOrRefreshCompanyBrief(opportunityId: string): Promise<SalesEnrichmentResult> {
  const opportunity = requireOpportunity(opportunityId);
  const title = `Jeff brief · ${opportunity.accountName}`;
  const docId = `sales-brief-${opportunity.id.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;

  const prompt = `Create a concise factual account brief for this sales opportunity.

Opportunity:
- Account: ${opportunity.accountName}
- Contact: ${opportunity.contactName || '(unknown)'}
- Opportunity: ${opportunity.name}
- Website: ${opportunity.website ?? '(none)'}
- Value: ${opportunity.currency} ${opportunity.valueAmount}
- Stage: ${opportunity.stage}

Use web_search and web_fetch. Prioritise EMEA-region sources and company/regulatory/press pages first. Look for material press/news items from the last 28 days. If there is not enough material, extend the search window to the last 3 months.

This is an account overview, not a sales recommendation. Do not include opinions, sales angles, suggested next steps, watch-outs, implications for Path, or progress updates about what you searched.

Write no more than one page. Keep it factual and concise. Structure:
1. Account overview: 3-5 factual bullets about the company, region footprint, business model, ownership/listing status, leadership, and relevant products/services where verifiable.
2. Recent press / news: 2-5 factual bullets, each with date if known and source/domain. Prefer EMEA news first; if using global news, say so neutrally.
3. Source notes: one short line listing the main source domains used.

Return markdown only. No preamble.`;

  const result = await askJeff({
    message: prompt,
    model: JEFF_MODEL_REPORT,
    maxTokens: 2200,
    maxSteps: 5,
  });
  const body = cleanBrief(result.text);
  upsertSalesBriefDoc(docId, title, body);

  let link = findDocLink(opportunityId, docId);
  const created = !link;
  if (created) {
    link = insertSalesLink({
      opportunityId,
      linkType: 'doc',
      linkRef: docId,
      label: title,
    });
  }
  addSalesActivity(opportunityId, `Jeff ${created ? 'created' : 'refreshed'} company brief: ${title}`, 'jeff');

  return {
    opportunity: requireOpportunity(opportunityId),
    link,
    docId,
    summary: teaser(body),
  };
}

export async function runInitialSalesEnrichment(opportunityId: string): Promise<void> {
  try {
    await findSalesLinkedIn(opportunityId);
  } catch (err) {
    console.warn(`[sales-enrichment] initial LinkedIn failed for ${opportunityId}:`, (err as Error).message);
  }

  try {
    await createOrRefreshCompanyBrief(opportunityId);
  } catch (err) {
    console.warn(`[sales-enrichment] initial brief failed for ${opportunityId}:`, (err as Error).message);
  }
}

function requireOpportunity(id: string): SalesOpportunity {
  const opportunity = getSalesOpportunity(id);
  if (!opportunity) throw Object.assign(new Error('Opportunity not found'), { status: 404 });
  return opportunity;
}

function findExistingLink(opportunityId: string, needle: string): SalesLinkRow | undefined {
  return db.prepare(`
    SELECT id,
           opportunity_id AS opportunityId,
           link_type AS linkType,
           link_ref AS linkRef,
           label,
           created_at AS createdAt
    FROM sales_links
    WHERE opportunity_id = ?
      AND LOWER(link_ref) LIKE ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(opportunityId, `%${needle.toLowerCase()}%`) as SalesLinkRow | undefined;
}

function findDocLink(opportunityId: string, docId: string): SalesLinkRow | undefined {
  return db.prepare(`
    SELECT id,
           opportunity_id AS opportunityId,
           link_type AS linkType,
           link_ref AS linkRef,
           label,
           created_at AS createdAt
    FROM sales_links
    WHERE opportunity_id = ?
      AND link_type = 'doc'
      AND link_ref = ?
    LIMIT 1
  `).get(opportunityId, docId) as SalesLinkRow | undefined;
}

function insertSalesLink(input: { opportunityId: string; linkType: SalesLinkRow['linkType']; linkRef: string; label: string }) {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO sales_links (id, opportunity_id, link_type, link_ref, label)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, input.opportunityId, input.linkType, input.linkRef, input.label);
  return db.prepare(`
    SELECT id,
           opportunity_id AS opportunityId,
           link_type AS linkType,
           link_ref AS linkRef,
           label,
           created_at AS createdAt
    FROM sales_links
    WHERE id = ?
  `).get(id) as SalesLinkRow;
}

function updateSalesLink(id: string, linkRef: string, label: string) {
  db.prepare(`
    UPDATE sales_links
    SET link_ref = ?,
        label = ?
    WHERE id = ?
  `).run(linkRef, label, id);
  return db.prepare(`
    SELECT id,
           opportunity_id AS opportunityId,
           link_type AS linkType,
           link_ref AS linkRef,
           label,
           created_at AS createdAt
    FROM sales_links
    WHERE id = ?
  `).get(id) as SalesLinkRow;
}

function updateLinkedInProfile(opportunityId: string, profile: LinkedInProfileResult) {
  const profileUrl = normalizeLinkedInUrl(profile.url);
  const photoUrl = validPublicImageUrl(profile.imageUrl) ?? linkedInAvatarFallback(profileUrl);
  db.prepare(`
    UPDATE sales_opportunities
    SET contact_title = COALESCE(?, contact_title),
        contact_location = COALESCE(?, contact_location),
        contact_photo_url = COALESCE(?, contact_photo_url),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    cleanNullable(profile.title),
    cleanNullable(profile.location),
    photoUrl,
    opportunityId,
  );
}

function fillMissingContactFields(opportunity: SalesOpportunity, profile: LinkedInProfileResult): string[] {
  const profileWebsite = cleanWebsite(profile.website);
  const email = cleanEmail(profile.email);
  const phone = cleanPhone(profile.phone);
  const website = profileWebsite;
  const fields: string[] = [];
  if (!opportunity.contactEmail && email) fields.push('email');
  if (!opportunity.contactPhone && phone) fields.push('phone');
  if (!opportunity.website && website) fields.push('website');
  if (!fields.length) return [];

  db.prepare(`
    UPDATE sales_opportunities
    SET contact_email = CASE WHEN (contact_email IS NULL OR contact_email = '') THEN COALESCE(?, contact_email) ELSE contact_email END,
        contact_phone = CASE WHEN (contact_phone IS NULL OR contact_phone = '') THEN COALESCE(?, contact_phone) ELSE contact_phone END,
        website = CASE WHEN (website IS NULL OR website = '') THEN COALESCE(?, website) ELSE website END,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(email, phone, website, opportunity.id);
  return fields;
}

function addSalesActivity(opportunityId: string, body: string, type: 'note' | 'stage' | 'link' | 'jeff') {
  db.prepare(`
    INSERT INTO sales_activities (id, opportunity_id, type, body, author_key)
    VALUES (?, ?, ?, ?, 'J')
  `).run(randomUUID(), opportunityId, type, body);
  db.prepare('UPDATE sales_opportunities SET updated_at = datetime(\'now\') WHERE id = ?').run(opportunityId);
}

function upsertSalesBriefDoc(id: string, title: string, markdown: string) {
  const blocks = markdownToBlocks(markdown);
  const existing = db.prepare('SELECT id FROM docs WHERE id = ?').get(id);
  if (!existing) {
    db.prepare(`
      INSERT INTO docs (id, title, root, product_id, group_name, size_label, tags, created_by, updated_by, updated)
      VALUES (?, ?, 'sales', NULL, 'Briefings', '3 min', ?, 'J', 'J', 'just now')
    `).run(id, title, JSON.stringify(['sales', 'jeff', 'brief']));
  } else {
    db.prepare(`
      UPDATE docs
      SET title = ?,
          group_name = 'Briefings',
          size_label = '3 min',
          tags = ?,
          updated_by = 'J',
          updated = 'just now',
          updated_at = datetime('now')
      WHERE id = ?
    `).run(title, JSON.stringify(['sales', 'jeff', 'brief']), id);
  }
  db.prepare('DELETE FROM doc_blocks WHERE doc_id = ?').run(id);
  const insert = db.prepare('INSERT INTO doc_blocks (doc_id, sort_order, type, data) VALUES (?, ?, ?, ?)');
  blocks.forEach((block, index) => {
    insert.run(id, index, block.type, JSON.stringify(block));
  });
}

function markdownToBlocks(markdown: string): Array<{ type: string; text?: string; items?: string[] }> {
  const blocks: Array<{ type: string; text?: string; items?: string[] }> = [];
  let bullets: string[] = [];
  const flushBullets = () => {
    if (bullets.length) {
      blocks.push({ type: 'ul', items: bullets });
      bullets = [];
    }
  };
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      flushBullets();
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }
    flushBullets();
    if (line.startsWith('### ')) blocks.push({ type: 'h3', text: line.slice(4) });
    else if (line.startsWith('## ')) blocks.push({ type: 'h2', text: line.slice(3) });
    else if (line.startsWith('# ')) blocks.push({ type: 'h1', text: line.slice(2) });
    else blocks.push({ type: 'p', text: line.replace(/^\d+\.\s+/, '') });
  }
  flushBullets();
  return blocks.length ? blocks : [{ type: 'p', text: markdown.trim() || 'Jeff brief pending.' }];
}

function parseLinkedInResult(text: string): LinkedInProfileResult | null {
  const json = extractJson(text);
  if (json) {
    try {
      const parsed = JSON.parse(json) as {
        url?: string;
        display_name?: string | null;
        displayName?: string | null;
        name?: string | null;
        title?: string | null;
        location?: string | null;
        image_url?: string | null;
        imageUrl?: string | null;
        profile_image_url?: string | null;
        email?: string | null;
        contact_email?: string | null;
        phone?: string | null;
        contact_phone?: string | null;
        website?: string | null;
        company_website?: string | null;
        label?: string;
        reason?: string;
      };
      if (parsed.url && /linkedin\.com/i.test(parsed.url)) {
        return {
          url: parsed.url,
          displayName: cleanNullable(parsed.display_name ?? parsed.displayName ?? parsed.name) ?? undefined,
          title: cleanNullable(parsed.title) ?? undefined,
          location: cleanNullable(parsed.location) ?? undefined,
          imageUrl: cleanNullable(parsed.image_url ?? parsed.imageUrl ?? parsed.profile_image_url) ?? undefined,
          email: cleanNullable(parsed.email ?? parsed.contact_email) ?? undefined,
          phone: cleanNullable(parsed.phone ?? parsed.contact_phone) ?? undefined,
          website: cleanNullable(parsed.website ?? parsed.company_website) ?? undefined,
          label: parsed.label,
          reason: parsed.reason,
        };
      }
    } catch { /* fall back to regex */ }
  }
  const match = text.match(/https?:\/\/[^\s"')]+linkedin\.com\/[^\s"')]+/i);
  return match ? { url: match[0] } : null;
}

function normalizeLinkedInUrl(value: string): string {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, '')}`;
}

function validPublicImageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  if (!/\.(?:png|jpe?g|webp|gif)(?:[?#].*)?$/i.test(trimmed) && !/media|image|photo|avatar|profile/i.test(trimmed)) return null;
  return trimmed;
}

function linkedInAvatarFallback(linkedInUrl: string): string | null {
  try {
    const url = new URL(linkedInUrl);
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return null;
    const match = url.pathname.match(/\/in\/([^/?#]+)/i);
    const slug = match?.[1]?.replace(/\/+$/, '');
    if (!slug) return null;
    return `https://unavatar.io/linkedin/${encodeURIComponent(slug)}`;
  } catch {
    return null;
  }
}

function cleanNullable(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || /^null|unknown|n\/a$/i.test(trimmed)) return null;
  return trimmed;
}

function cleanEmail(value: unknown): string | null {
  const email = cleanNullable(value)?.toLowerCase() ?? null;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function cleanPhone(value: unknown): string | null {
  const phone = cleanNullable(value);
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return null;
  return phone;
}

function cleanWebsite(value: unknown): string | null {
  const website = cleanNullable(value);
  if (!website || /\s/.test(website)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
    if (!url.hostname.includes('.')) return null;
    return url.hostname.replace(/^www\./i, 'www.');
  } catch {
    return null;
  }
}

function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return null;
}

function cleanBrief(text: string): string {
  const withoutFences = text
    .replace(/```(?:markdown|md)?\s*/gi, '')
    .replace(/```/g, '')
    .trim();
  const sectionStart = findBriefSectionStart(withoutFences);
  return (sectionStart >= 0 ? withoutFences.slice(sectionStart) : withoutFences).trim();
}

function findBriefSectionStart(text: string): number {
  const patterns = [
    /^#{1,3}\s*Account overview\b/im,
    /^\s*(?:1\.\s*)?Account overview\b/im,
    /^#{1,3}\s*Recent press\s*\/\s*news\b/im,
    /^\s*(?:2\.\s*)?Recent press\s*\/\s*news\b/im,
  ];
  const starts = patterns
    .map((pattern) => text.search(pattern))
    .filter((index) => index >= 0);
  return starts.length ? Math.min(...starts) : -1;
}

function teaser(text: string): string {
  return text.replace(/[#*_`>\-\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
}
