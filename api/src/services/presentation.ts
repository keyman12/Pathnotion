// PowerPoint renderer for Jeff. Produces a .pptx buffer styled with the workspace style sheet —
// brand colours, fonts, type scale and logos. Callers hand in a structured deck (title + content
// slides); the renderer adds the title slide, applies the house style, and returns the bytes.

// pptxgenjs ships both CJS and ESM entry points. Different runtimes (tsx, node, bundlers) resolve
// the default export differently — one gives you the class, the other gives you a namespace. Using
// dynamic import inside the function + the `.default ?? module` pattern sidesteps the whole mess.
import type PptxGenJSType from 'pptxgenjs';
import { db } from '../db/client.js';
import { decryptToken } from './token-vault.js';
import { type GoogleTokens } from './google-calendar.js';
import { fetchFileContent, getEntry } from './google-drive.js';
import { stripNearWhite } from './image-utils.js';

export interface PresentationSlide {
  heading: string;
  subtitle?: string;
  bullets?: string[];
}

export interface PresentationInput {
  title: string;
  subject?: string;
  author?: string;
  slides: PresentationSlide[];
}

export interface RenderedPresentation {
  buffer: Buffer;
  filename: string;
}

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

async function loadLogoDataUrl(fileId: string): Promise<string | null> {
  const tokens = firstGoogleTokens();
  if (!tokens) return null;
  try {
    const entry = await getEntry(tokens, fileId);
    if (!entry) return null;
    const content = await fetchFileContent(tokens, entry, { maxBytes: 2 * 1024 * 1024 });
    if (!content || content.kind !== 'binary' || !content.mediaType.startsWith('image/')) return null;
    // Strip near-white pixels so the same logo works on dark title slides and white content slides.
    let bytes: Buffer = content.data;
    let mediaType = content.mediaType;
    try { bytes = await stripNearWhite(content.data); mediaType = 'image/png'; } catch { /* keep original */ }
    return `data:${mediaType};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

/** pptxgenjs expects colours as 6-char hex without the leading `#`. */
function hex(value: string | undefined, fallback: string): string {
  const v = (value ?? fallback).replace('#', '');
  return /^[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : fallback.replace('#', '').toUpperCase();
}

export async function renderPresentation(input: PresentationInput): Promise<RenderedPresentation> {
  const style = loadStyleSheet();
  const brand = style.brand ?? {};

  const cPrimary      = hex(brand.colorPrimary,       '#297D2D');
  const cPrimaryLight = hex(brand.colorPrimaryLight2, '#49BC4E');
  const cSecondary    = hex(brand.colorSecondary,     '#FF5252');
  const cDark         = hex(brand.colorNeutralDark,   '#0F171A');
  const cLight        = hex(brand.colorNeutralLight,  '#F6F7F8');

  const fontPrimary   = brand.fontPrimary || 'Poppins';
  const fontSecondary = brand.fontSecondary || brand.fontMono || 'Roboto';
  const ts = brand.typeScale ?? {};

  const [logoLight, logoDark] = await Promise.all([
    brand.logoLight?.fileId ? loadLogoDataUrl(brand.logoLight.fileId) : Promise.resolve(null),
    brand.logoDark?.fileId  ? loadLogoDataUrl(brand.logoDark.fileId)  : Promise.resolve(null),
  ]);

  const mod: any = await import('pptxgenjs');
  const PptxGenJS: typeof PptxGenJSType = mod.default?.default ?? mod.default ?? mod;
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';                 // 13.333 × 7.5 inches
  pres.author  = input.author || brand.name || 'Path';
  pres.title   = input.title;
  pres.company = brand.name || 'Path';

  const W = 13.333;
  const H = 7.5;

  // ── Title slide ────────────────────────────────────────────────
  const title = pres.addSlide();
  title.background = { color: cDark };
  title.addShape('rect' as any, { x: 0, y: 0, w: W, h: 0.35, fill: { color: cPrimary } });
  if (logoDark) {
    title.addImage({ data: logoDark, x: 0.7, y: 0.8, w: 2.6, h: 0.9, sizing: { type: 'contain', w: 2.6, h: 0.9 } });
  }
  title.addText(input.title, {
    x: 0.7, y: H / 2 - 1.2, w: W - 1.4, h: 1.6,
    fontSize: ts.h0 ?? 60,
    fontFace: fontPrimary,
    color: 'FFFFFF',
    bold: true,
    valign: 'bottom',
  });
  if (input.subject) {
    title.addText(input.subject, {
      x: 0.7, y: H / 2 + 0.6, w: W - 1.4, h: 0.8,
      fontSize: ts.h3 ?? 24,
      fontFace: fontSecondary,
      color: cPrimaryLight,
    });
  }
  const dateLabel = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  title.addText(dateLabel, {
    x: 0.7, y: H - 0.9, w: 6, h: 0.4,
    fontSize: ts.p2 ?? 14,
    fontFace: fontSecondary,
    color: 'C7CBD1',
  });

  // ── Content slides ─────────────────────────────────────────────
  for (const slide of input.slides) {
    const s = pres.addSlide();
    s.background = { color: 'FFFFFF' };
    s.addShape('rect' as any, { x: 0, y: 0, w: 0.18, h: H, fill: { color: cPrimary } });
    if (logoLight) {
      s.addImage({ data: logoLight, x: W - 1.9, y: 0.35, w: 1.4, h: 0.5, sizing: { type: 'contain', w: 1.4, h: 0.5 } });
    }
    s.addText(slide.heading, {
      x: 0.7, y: 0.55, w: W - 2.8, h: 1.0,
      fontSize: ts.h1 ?? 40,
      fontFace: fontPrimary,
      color: cDark,
      bold: true,
    });
    if (slide.subtitle) {
      s.addText(slide.subtitle, {
        x: 0.7, y: 1.5, w: W - 2.8, h: 0.5,
        fontSize: ts.h4 ?? 18,
        fontFace: fontSecondary,
        color: cPrimary,
      });
    }
    const bullets = (slide.bullets ?? []).filter((b) => typeof b === 'string' && b.trim());
    if (bullets.length) {
      s.addText(
        bullets.map((b) => ({ text: b, options: { bullet: true } })),
        {
          x: 0.9, y: slide.subtitle ? 2.2 : 1.8, w: W - 1.7, h: H - 2.8,
          fontSize: ts.p1 ?? 18,
          fontFace: fontSecondary,
          color: cDark,
          paraSpaceAfter: 8,
        },
      );
    }
    // Thin secondary accent line at the bottom for rhythm
    s.addShape('rect' as any, { x: 0.7, y: H - 0.35, w: 1.2, h: 0.05, fill: { color: cSecondary } });
  }

  const out = await pres.write({ outputType: 'nodebuffer' });
  const buffer = out as Buffer;

  const stamp = new Date().toISOString().slice(0, 10);
  const safeTitle = input.title.replace(/[^\w \-.]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Presentation';
  const filename = `${safeTitle} - ${stamp}.pptx`;

  // Unused locals — avoid lint noise if the brand palette expands later.
  void cLight;

  return { buffer, filename };
}
