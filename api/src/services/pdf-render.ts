// PDF renderer for Jeff. Replicates the reportlab-based "Path product sheet" visual system
// in Node with pdfkit. Callers hand in a title, subtitle, and a list of content blocks;
// the renderer draws a branded A4 page (or pages) and returns the bytes.
//
// Visual system matches `build_commission_sheet.py` and `path_pdf_template.py`:
//  - 32mm grey header bar, green accent line at the very top, logo top-right
//  - Green H2 section headings, charcoal body, grey feature descriptions
//  - Tables with coloured header row (green or coral) + zebra data rows
//  - Icon bullets (big circle with a single glyph, green title, body below)
//  - Hero images full-width with grey caption
//  - Copyright + URL footer with a thin rule

import type PDFKitType from 'pdfkit';
import { db } from '../db/client.js';
import { decryptToken } from './token-vault.js';
import { type GoogleTokens } from './google-calendar.js';
import { fetchFileContent, getEntry } from './google-drive.js';
import { stripNearWhite } from './image-utils.js';

// ─── Content blocks Jeff produces ──────────────────────────────────────────

export type PdfBlock =
  | { kind: 'paragraph';   text: string }
  | { kind: 'h2';          text: string; accent?: 'primary' | 'secondary' }
  | { kind: 'bullet';      text: string }
  | { kind: 'bullets';     items: string[] }
  | { kind: 'feature';     title: string; description: string }
  | { kind: 'icon-bullet'; icon: string; title: string; body: string }
  | { kind: 'table';       headers: string[]; rows: string[][]; accent?: 'primary' | 'secondary' }
  | { kind: 'hero-image';  driveFileId: string; caption?: string }
  | { kind: 'spacer';      size?: number }
  | { kind: 'page-break' };

export interface ProductPdfInput {
  title: string;
  subtitle?: string;
  blocks: PdfBlock[];
  author?: string;
}

export interface RenderedPdf {
  buffer: Buffer;
  filename: string;
}

// ─── Style sheet + tokens ──────────────────────────────────────────────────

function loadStyleSheet(): any {
  const row = db.prepare('SELECT data FROM jeff_style_sheet WHERE id = 1').get() as { data: string } | undefined;
  if (!row) return {};
  try { return JSON.parse(row.data); } catch { return {}; }
}

function firstGoogleTokens(): GoogleTokens | null {
  const row = db.prepare(
    "SELECT access_token, refresh_token, token_expiry, scope FROM calendar_sources WHERE provider = 'google' ORDER BY connected_at DESC LIMIT 1",
  ).get() as { access_token: string | null; refresh_token: string | null; token_expiry: number | null; scope: string | null } | undefined;
  if (!row) return null;
  return {
    access_token: decryptToken(row.access_token),
    refresh_token: decryptToken(row.refresh_token),
    expiry_date: row.token_expiry ?? null,
    scope: row.scope,
  };
}

async function loadLogoBytes(fileId: string | undefined): Promise<Buffer | null> {
  if (!fileId) return null;
  const tokens = firstGoogleTokens();
  if (!tokens) return null;
  try {
    const entry = await getEntry(tokens, fileId);
    if (!entry) return null;
    const content = await fetchFileContent(tokens, entry, { maxBytes: 2 * 1024 * 1024 });
    if (!content || content.kind !== 'binary') return null;
    // Strip near-white pixels so the logo blends onto the grey header / any backdrop.
    try { return await stripNearWhite(content.data); }
    catch { return content.data; }
  } catch {
    return null;
  }
}

async function loadDriveImage(fileId: string): Promise<Buffer | null> {
  const tokens = firstGoogleTokens();
  if (!tokens) return null;
  try {
    const entry = await getEntry(tokens, fileId);
    if (!entry) return null;
    const content = await fetchFileContent(tokens, entry, { maxBytes: 10 * 1024 * 1024 });
    if (!content || content.kind !== 'binary' || !content.mediaType.startsWith('image/')) return null;
    return content.data;
  } catch {
    return null;
  }
}

// pdfkit uses pt units internally. A4 is 595.28 × 841.89 pt.
const MM = 2.8346456693;

// ─── Main renderer ─────────────────────────────────────────────────────────

export async function renderProductPdf(input: ProductPdfInput): Promise<RenderedPdf> {
  const style   = loadStyleSheet();
  const brand   = style.brand ?? {};

  // Colour palette sourced from the style sheet. Falls back to the historical Path values
  // if anything is missing so there's always something sensible to draw with.
  const cPrimary      = brand.colorPrimary       ?? '#297D2D';
  const cPrimaryMid   = brand.colorPrimaryLight1 ?? '#3B9F40';
  const cSecondary    = brand.colorSecondary     ?? '#FF5252';
  const cCharcoal     = '#231F20';
  const cMidGrey      = '#919191';
  const cLightGrey    = '#F5F5F5';
  const cHeaderBg     = '#F2F2F2';
  const cBorderGrey   = '#E0E0E0';
  const cWhite        = '#FFFFFF';

  // Load light logo for the header. Missing → header still renders, just without a logo.
  const logoBuffer = await loadLogoBytes(brand.logoLight?.fileId);

  const mod: any = await import('pdfkit');
  const PDFDocument: typeof PDFKitType = mod.default?.default ?? mod.default ?? mod;
  // Top margin sits below the header band so auto-flowed text starts at the right place.
  // Bottom margin sits above the footer so content never collides with the copyright line.
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 35 * MM, bottom: 20 * MM, left: 18 * MM, right: 18 * MM },
    // bufferPages lets us revisit each page at the end to stamp the header/footer
    // without interleaving furniture drawing with the main content flow.
    bufferPages: true,
    info: {
      Title: input.title,
      Author: input.author || brand.name || 'Path',
      Subject: input.subtitle,
      Creator: 'PathNotion',
    },
  });

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const margin = 18 * MM;
  const contentW = pageW - 2 * margin;

  // ── Page furniture (drawn in a post-pass, never during text flow) ──────

  function drawHeader() {
    doc.save().rect(0, 0, pageW, 32 * MM).fill(cHeaderBg).restore();
    doc.save().rect(0, 0, pageW, 1 * MM).fill(cPrimaryMid).restore();
    doc.save()
      .moveTo(0, 32 * MM).lineTo(pageW, 32 * MM)
      .lineWidth(0.5).strokeColor(cBorderGrey).stroke()
      .restore();
    if (logoBuffer) {
      try {
        // pdfkit's image() positions from the given (x, y) — the alignment options here are
        // only used when the image is smaller than `fit`. 'center' is the sensible default for
        // both axes so the logo sits nicely inside the reserved slot.
        doc.image(logoBuffer, pageW - 48 * MM, 7 * MM, {
          fit: [38 * MM, 16 * MM],
          align: 'center',
          valign: 'center',
        });
      } catch { /* non-fatal */ }
    }
    doc.fillColor(cCharcoal).font('Helvetica-Bold').fontSize(18)
      .text(input.title, margin, 16 * MM, {
        width: contentW - 50 * MM,
        height: 10 * MM,
        lineBreak: false,
        ellipsis: true,
      });
    if (input.subtitle) {
      doc.fillColor(cMidGrey).font('Helvetica').fontSize(9)
        .text(input.subtitle, margin, 24 * MM, {
          width: contentW - 50 * MM,
          height: 6 * MM,
          lineBreak: false,
          ellipsis: true,
        });
    }
  }

  function drawFooter() {
    doc.save()
      .moveTo(margin, pageH - 14 * MM).lineTo(pageW - margin, pageH - 14 * MM)
      .lineWidth(0.5).strokeColor(cBorderGrey).stroke()
      .restore();
    doc.fillColor(cMidGrey).font('Helvetica').fontSize(7);
    doc.text('Proprietary + Confidential. © DJIL, LTD. All rights reserved',
      margin, pageH - 11 * MM,
      { width: contentW / 2, height: 4 * MM, lineBreak: false });
    doc.text('https://path2ai.tech',
      margin + contentW / 2, pageH - 11 * MM,
      { width: contentW / 2, height: 4 * MM, align: 'right', lineBreak: false });
  }

  // ── Block renderers ────────────────────────────────────────────────────

  function moveDown(mmAmount: number) {
    doc.y += mmAmount * MM;
  }

  function ensureSpaceFor(mmNeeded: number) {
    const footerTop = pageH - 18 * MM;
    if (doc.y + mmNeeded * MM > footerTop) {
      doc.addPage();
    }
  }

  function drawParagraph(text: string) {
    ensureSpaceFor(15);
    doc.fillColor(cCharcoal).font('Helvetica').fontSize(9)
      .text(text, margin, doc.y, { width: contentW, align: 'justify' });
    moveDown(3);
  }

  function drawH2(text: string, accent: 'primary' | 'secondary' = 'primary') {
    ensureSpaceFor(14);
    moveDown(3);
    doc.fillColor(accent === 'secondary' ? cSecondary : cPrimary)
      .font('Helvetica-Bold').fontSize(13)
      .text(text, margin, doc.y, { width: contentW });
    moveDown(2);
  }

  function drawBullet(text: string) {
    ensureSpaceFor(10);
    doc.fillColor(cCharcoal).font('Helvetica').fontSize(9)
      .text(`•  ${text}`, margin + 4 * MM, doc.y, { width: contentW - 4 * MM });
    moveDown(1);
  }

  function drawFeature(title: string, description: string) {
    ensureSpaceFor(14);
    doc.fillColor(cCharcoal).font('Helvetica-Bold').fontSize(9.5)
      .text(title, margin, doc.y, { width: contentW });
    moveDown(0.5);
    doc.fillColor(cMidGrey).font('Helvetica').fontSize(8.5)
      .text(description, margin, doc.y, { width: contentW, align: 'left' });
    moveDown(2.5);
  }

  function drawIconBullet(icon: string, title: string, body: string) {
    ensureSpaceFor(22);
    const startY = doc.y;
    // Large circular icon badge (filled circle in light green tint with icon glyph)
    const cx = margin + 6 * MM;
    const cy = startY + 5 * MM;
    const r  = 4.5 * MM;
    doc.save()
      .circle(cx, cy, r)
      .fillColor(cPrimary).fillOpacity(0.12).fill()
      .restore();
    doc.fillColor(cPrimary).font('Helvetica-Bold').fontSize(14)
      .text(icon, cx - 2.5 * MM, cy - 3 * MM, { width: 5 * MM, align: 'center', lineBreak: false });

    const textX = margin + 16 * MM;
    const textW = contentW - 16 * MM;
    doc.fillColor(cPrimary).font('Helvetica-Bold').fontSize(11)
      .text(title, textX, startY, { width: textW });
    moveDown(0.5);
    doc.fillColor(cCharcoal).font('Helvetica').fontSize(9)
      .text(body, textX, doc.y, { width: textW, align: 'left' });
    moveDown(3);
  }

  function drawTable(headers: string[], rows: string[][], accent: 'primary' | 'secondary' = 'primary') {
    if (!headers.length || !rows.length) return;
    const headerColor = accent === 'secondary' ? cSecondary : cPrimary;
    const cols = headers.length;
    const colW = contentW / cols;
    const cellPadX = 3 * MM;
    const cellPadY = 2.5 * MM;

    // Measure row heights using pdfkit's heightOfString so wrapping doesn't clip.
    const lineH = (text: string, font: string, size: number) => {
      doc.font(font).fontSize(size);
      return doc.heightOfString(text, { width: colW - cellPadX * 2 });
    };

    const headerRowH = Math.max(
      cellPadY * 2 + 4 * MM,
      ...headers.map((h) => lineH(h, 'Helvetica-Bold', 8) + cellPadY * 2),
    );
    const rowHeights = rows.map((row) =>
      Math.max(
        cellPadY * 2 + 4 * MM,
        ...row.map((c) => lineH(String(c ?? ''), 'Helvetica', 8) + cellPadY * 2),
      ),
    );

    ensureSpaceFor(((headerRowH + rowHeights.reduce((a, b) => a + b, 0)) / MM) + 2);

    // Header row
    const startY = doc.y;
    doc.save().rect(margin, startY, contentW, headerRowH).fill(headerColor).restore();
    headers.forEach((h, i) => {
      doc.fillColor(cWhite).font('Helvetica-Bold').fontSize(8)
        .text(h, margin + i * colW + cellPadX, startY + cellPadY,
          { width: colW - cellPadX * 2, lineBreak: true });
    });

    let y = startY + headerRowH;
    rows.forEach((row, rowIdx) => {
      const rowH = rowHeights[rowIdx];
      // Zebra fill
      if (rowIdx % 2 === 0) {
        doc.save().rect(margin, y, contentW, rowH).fill(cLightGrey).restore();
      }
      row.forEach((cell, i) => {
        doc.fillColor(cCharcoal).font('Helvetica').fontSize(8)
          .text(String(cell ?? ''), margin + i * colW + cellPadX, y + cellPadY,
            { width: colW - cellPadX * 2, lineBreak: true });
      });
      y += rowH;
    });

    // Cell grid
    doc.save().lineWidth(0.3).strokeColor(cBorderGrey);
    // Outer frame
    doc.rect(margin, startY, contentW, y - startY).stroke();
    // Verticals
    for (let i = 1; i < cols; i++) {
      doc.moveTo(margin + i * colW, startY).lineTo(margin + i * colW, y).stroke();
    }
    doc.restore();

    doc.x = margin;
    doc.y = y + 3 * MM;
  }

  async function drawHeroImage(driveFileId: string, caption?: string) {
    const imgBuffer = await loadDriveImage(driveFileId);
    if (!imgBuffer) {
      drawParagraph(`[image missing: ${driveFileId}]`);
      return;
    }
    // Cap hero height at ~72mm, width fills the content area.
    const maxW = contentW;
    const maxH = 72 * MM;
    ensureSpaceFor(maxH / MM + (caption ? 8 : 3));
    try {
      doc.image(imgBuffer, margin, doc.y, { fit: [maxW, maxH] });
      // pdfkit doesn't expose the rendered height cleanly when using `fit`. Advance by maxH
      // and rely on ensureSpaceFor above; slightly conservative but safe.
      doc.y += maxH;
    } catch {
      drawParagraph(`[image unsupported: ${driveFileId}]`);
      return;
    }
    moveDown(1);
    if (caption) {
      doc.fillColor(cMidGrey).font('Helvetica').fontSize(7.5)
        .text(caption, margin, doc.y, { width: contentW, align: 'left' });
      moveDown(2);
    }
  }

  // ── Run the blocks ─────────────────────────────────────────────────────
  // Content flows down the page. When text overflows, pdfkit adds a page automatically and
  // resumes at the top margin (35mm). Header/footer are drawn in a post-pass so they never
  // participate in the flow and can't trigger recursive pagination.

  for (const block of input.blocks) {
    switch (block.kind) {
      case 'paragraph':   drawParagraph(block.text); break;
      case 'h2':          drawH2(block.text, block.accent ?? 'primary'); break;
      case 'bullet':      drawBullet(block.text); break;
      case 'bullets':     block.items.forEach(drawBullet); break;
      case 'feature':     drawFeature(block.title, block.description); break;
      case 'icon-bullet': drawIconBullet(block.icon, block.title, block.body); break;
      case 'table':       drawTable(block.headers, block.rows, block.accent ?? 'primary'); break;
      case 'hero-image':  await drawHeroImage(block.driveFileId, block.caption); break;
      case 'spacer':      moveDown(block.size ?? 3); break;
      case 'page-break':  doc.addPage(); break;
    }
  }

  // ── Header + footer post-pass ──────────────────────────────────────────
  // Walk every page that was produced and overlay the header band, logo, and footer.
  // Done here (after all text has flowed) so the furniture drawing can't kick off pagination.
  const pageCount = (doc as any).bufferedPageRange
    ? (doc as any).bufferedPageRange().count
    : (doc as any)._pageBuffer?.length ?? 1;
  for (let i = 0; i < pageCount; i++) {
    if (typeof (doc as any).switchToPage === 'function') {
      (doc as any).switchToPage(i);
    }
    drawHeader();
    drawFooter();
  }

  // ── Collect output ─────────────────────────────────────────────────────

  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.end();
  const buffer = await finished;

  const stamp = new Date().toISOString().slice(0, 10);
  const safeTitle = input.title.replace(/[^\w \-.]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Document';
  const filename = `${safeTitle} - ${stamp}.pdf`;

  return { buffer, filename };
}
