// PowerPoint renderer for Jeff. Produces a .pptx buffer styled with the workspace style sheet —
// brand colours, fonts, type scale and logos. Callers hand in a structured deck (title + content
// slides); the renderer adds the title slide, applies the house style, and returns the bytes.

// pptxgenjs ships both CJS and ESM entry points. Different runtimes (tsx, node, bundlers) resolve
// the default export differently — one gives you the class, the other gives you a namespace. Using
// dynamic import inside the function + the `.default ?? module` pattern sidesteps the whole mess.
import { db } from '../db/client.js';
import { decryptToken } from './token-vault.js';
import { type GoogleTokens } from './google-calendar.js';
import { fetchFileContent, getEntry } from './google-drive.js';
import { stripNearWhite } from './image-utils.js';

/** Diagram block — rendered as native pptx shapes the user can nudge / restyle in PowerPoint. */
export type DiagramSpec =
  | {
      /** N boxes connected by arrows in order. */
      type: 'flow';
      nodes: string[];
      orientation?: 'horizontal' | 'vertical';
    }
  | {
      /** Stacked levels, top → bottom by default. `invert: true` puts the wide level at the top. */
      type: 'pyramid';
      levels: string[];
      invert?: boolean;
    }
  | {
      /** Escape hatch — explicit boxes with positions, plus optional connectors between them.
       *  Coordinates are inches inside the slide content area (10.6 wide × 4.8 tall, top-left origin). */
      type: 'shapes';
      nodes: Array<{
        id: string;
        label: string;
        x: number;
        y: number;
        w?: number;
        h?: number;
        shape?: 'rect' | 'roundRect' | 'ellipse' | 'diamond';
        tone?: 'primary' | 'secondary' | 'neutral';
      }>;
      connectors?: Array<{ from: string; to: string; label?: string }>;
    };

export interface PresentationSlide {
  heading: string;
  subtitle?: string;
  bullets?: string[];
  /** Native vector diagram for this slide. When present, replaces the bullets area. */
  diagram?: DiagramSpec;
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

async function loadLogoDataUrl(logo: { dataUrl?: string; fileId?: string } | null | undefined): Promise<string | null> {
  if (!logo) return null;
  // New path: the style sheet stores logos as data URLs inline. Strip near-white pixels so
  // the same logo works on dark title slides and white content slides.
  if (logo.dataUrl) {
    const m = /^data:[^;]+;base64,(.+)$/.exec(logo.dataUrl);
    if (!m) return logo.dataUrl;  // not base64 — hand back as-is
    try {
      const cleaned = await stripNearWhite(Buffer.from(m[1], 'base64'));
      return `data:image/png;base64,${cleaned.toString('base64')}`;
    } catch {
      return logo.dataUrl;
    }
  }
  // Back-compat: legacy logos stored by Drive file id.
  if (logo.fileId) {
    const tokens = firstGoogleTokens();
    if (!tokens) return null;
    try {
      const entry = await getEntry(tokens, logo.fileId);
      if (!entry) return null;
      const content = await fetchFileContent(tokens, entry, { maxBytes: 2 * 1024 * 1024 });
      if (!content || content.kind !== 'binary' || !content.mediaType.startsWith('image/')) return null;
      let bytes: Buffer = content.data;
      let mediaType = content.mediaType;
      try { bytes = await stripNearWhite(content.data); mediaType = 'image/png'; } catch { /* keep original */ }
      return `data:${mediaType};base64,${bytes.toString('base64')}`;
    } catch {
      return null;
    }
  }
  return null;
}

/** pptxgenjs expects colours as 6-char hex without the leading `#`. */
function hex(value: string | undefined, fallback: string): string {
  const v = (value ?? fallback).replace('#', '');
  return /^[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : fallback.replace('#', '').toUpperCase();
}

interface DiagramArea {
  x: number; y: number; w: number; h: number;
  cPrimary: string; cPrimaryLight: string; cSecondary: string; cDark: string; cLight: string;
  fontPrimary: string; fontSecondary: string;
}

/** Pick a fill colour for a node tone — primary green, secondary red, or neutral grey. */
function toneFill(tone: 'primary' | 'secondary' | 'neutral' | undefined, area: DiagramArea): string {
  if (tone === 'secondary') return area.cSecondary;
  if (tone === 'neutral')   return 'E5E7EB';
  return area.cPrimary;
}
function toneText(tone: 'primary' | 'secondary' | 'neutral' | undefined, area: DiagramArea): string {
  return tone === 'neutral' ? area.cDark : 'FFFFFF';
}

/** Render a diagram block as native pptx shapes inside the given area. Shapes / text /
 *  arrows are all editable in PowerPoint after the deck is opened. */
function renderDiagram(slide: any, diagram: DiagramSpec, area: DiagramArea): void {
  if (diagram.type === 'flow') {
    const nodes = (diagram.nodes ?? []).filter((n) => typeof n === 'string' && n.trim());
    if (!nodes.length) return;
    const horizontal = (diagram.orientation ?? 'horizontal') === 'horizontal';
    const gap = 0.35;
    if (horizontal) {
      const boxH = Math.min(1.4, area.h * 0.6);
      const boxW = Math.max(1.0, (area.w - gap * (nodes.length - 1)) / nodes.length);
      const y = area.y + (area.h - boxH) / 2;
      nodes.forEach((label, i) => {
        const x = area.x + i * (boxW + gap);
        slide.addShape('roundRect' as any, {
          x, y, w: boxW, h: boxH,
          fill: { color: area.cPrimary }, line: { color: area.cPrimary, width: 0 },
          rectRadius: 0.08,
        });
        slide.addText(label, {
          x, y, w: boxW, h: boxH,
          fontSize: 14, fontFace: area.fontPrimary, bold: true,
          color: 'FFFFFF', align: 'center', valign: 'middle',
        });
        if (i < nodes.length - 1) {
          slide.addShape('line' as any, {
            x: x + boxW, y: y + boxH / 2, w: gap, h: 0,
            line: { color: area.cDark, width: 1.5, endArrowType: 'triangle' },
          });
        }
      });
    } else {
      const boxW = Math.min(area.w * 0.7, 4.5);
      const boxH = Math.max(0.6, (area.h - gap * (nodes.length - 1)) / nodes.length);
      const x = area.x + (area.w - boxW) / 2;
      nodes.forEach((label, i) => {
        const y = area.y + i * (boxH + gap);
        slide.addShape('roundRect' as any, {
          x, y, w: boxW, h: boxH,
          fill: { color: area.cPrimary }, line: { color: area.cPrimary, width: 0 },
          rectRadius: 0.08,
        });
        slide.addText(label, {
          x, y, w: boxW, h: boxH,
          fontSize: 14, fontFace: area.fontPrimary, bold: true,
          color: 'FFFFFF', align: 'center', valign: 'middle',
        });
        if (i < nodes.length - 1) {
          slide.addShape('line' as any, {
            x: x + boxW / 2, y: y + boxH, w: 0, h: gap,
            line: { color: area.cDark, width: 1.5, endArrowType: 'triangle' },
          });
        }
      });
    }
    return;
  }

  if (diagram.type === 'pyramid') {
    const levels = (diagram.levels ?? []).filter((n) => typeof n === 'string' && n.trim());
    if (!levels.length) return;
    const ordered = diagram.invert ? levels.slice() : levels.slice().reverse();
    // Default: narrow at top → wide at bottom. `invert` flips so wide is at the top.
    const gap = 0.12;
    const rowH = Math.max(0.5, (area.h - gap * (ordered.length - 1)) / ordered.length);
    const minW = Math.max(1.4, area.w * 0.22);
    const maxW = area.w * 0.95;
    ordered.forEach((label, i) => {
      const t = ordered.length === 1 ? 1 : i / (ordered.length - 1);
      const w = minW + (maxW - minW) * t;
      const x = area.x + (area.w - w) / 2;
      const y = area.y + i * (rowH + gap);
      // A trapezoidal vibe via a rounded rect — native trapezoid shapes render
      // inconsistently across PowerPoint versions, so we use roundRect for stability.
      slide.addShape('roundRect' as any, {
        x, y, w, h: rowH,
        fill: { color: area.cPrimary }, line: { color: 'FFFFFF', width: 1 },
        rectRadius: 0.06,
      });
      slide.addText(label, {
        x, y, w, h: rowH,
        fontSize: 14, fontFace: area.fontPrimary, bold: true,
        color: 'FFFFFF', align: 'center', valign: 'middle',
      });
    });
    return;
  }

  if (diagram.type === 'shapes') {
    const nodes = Array.isArray(diagram.nodes) ? diagram.nodes : [];
    if (!nodes.length) return;
    // Map id → centre coordinates so connectors can find their endpoints.
    const placed = new Map<string, { cx: number; cy: number; w: number; h: number }>();
    for (const n of nodes) {
      const w = Math.max(0.6, n.w ?? 1.8);
      const h = Math.max(0.4, n.h ?? 1.0);
      const x = area.x + Math.max(0, Math.min(area.w - w, n.x));
      const y = area.y + Math.max(0, Math.min(area.h - h, n.y));
      const shapeName = n.shape === 'ellipse' ? 'ellipse'
                      : n.shape === 'diamond' ? 'diamond'
                      : n.shape === 'rect'    ? 'rect'
                      : 'roundRect';
      const fill = toneFill(n.tone, area);
      const text = toneText(n.tone, area);
      slide.addShape(shapeName as any, {
        x, y, w, h,
        fill: { color: fill }, line: { color: fill, width: 0 },
        rectRadius: shapeName === 'roundRect' ? 0.08 : undefined,
      });
      slide.addText(n.label, {
        x, y, w, h,
        fontSize: 13, fontFace: area.fontPrimary, bold: true,
        color: text, align: 'center', valign: 'middle',
      });
      placed.set(n.id, { cx: x + w / 2, cy: y + h / 2, w, h });
    }
    for (const c of diagram.connectors ?? []) {
      const a = placed.get(c.from);
      const b = placed.get(c.to);
      if (!a || !b) continue;
      // Aim from the edge of A toward the edge of B so the arrowhead lands on the box, not inside it.
      const dx = b.cx - a.cx;
      const dy = b.cy - a.cy;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ax = a.cx + (dx / len) * (a.w / 2);
      const ay = a.cy + (dy / len) * (a.h / 2);
      const bx = b.cx - (dx / len) * (b.w / 2);
      const by = b.cy - (dy / len) * (b.h / 2);
      slide.addShape('line' as any, {
        x: Math.min(ax, bx), y: Math.min(ay, by),
        w: Math.abs(bx - ax), h: Math.abs(by - ay),
        flipH: bx < ax, flipV: by < ay,
        line: { color: area.cDark, width: 1.5, endArrowType: 'triangle' },
      });
      if (c.label) {
        slide.addText(c.label, {
          x: (ax + bx) / 2 - 0.6, y: (ay + by) / 2 - 0.18,
          w: 1.2, h: 0.36,
          fontSize: 10, fontFace: area.fontSecondary,
          color: area.cDark, align: 'center', valign: 'middle',
          fill: { color: 'FFFFFF' },
        });
      }
    }
    return;
  }
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
    loadLogoDataUrl(brand.logoLight ?? null),
    loadLogoDataUrl(brand.logoDark  ?? null),
  ]);

  const mod: any = await import('pptxgenjs');
  const PptxGenJS: any = mod.default?.default ?? mod.default ?? mod;
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
    // Diagram takes precedence over bullets — same vertical real-estate, but native shapes.
    if (slide.diagram) {
      const contentTop = slide.subtitle ? 2.2 : 1.8;
      renderDiagram(s, slide.diagram, {
        x: 0.9,
        y: contentTop,
        w: W - 1.7,
        h: H - contentTop - 0.6,
        cPrimary, cPrimaryLight, cSecondary, cDark, cLight,
        fontPrimary, fontSecondary,
      });
    } else {
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
