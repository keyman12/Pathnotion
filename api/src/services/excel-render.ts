// Excel renderer for Jeff. Produces a branded .xlsx workbook styled from the workspace style
// sheet — Path green title band, frozen first row + first column, primary-colour header row,
// zebra body rows. Follows the `outputs.spreadsheet` guidance in the style sheet: row labels
// in column A, comparable values across. Callers hand in one or more sheets as { name, headers,
// rows }; the renderer handles the look.

import type ExcelJSType from 'exceljs';
import { db } from '../db/client.js';

export interface SpreadsheetSheet {
  name: string;
  headers: string[];
  rows: string[][];
}

export interface SpreadsheetInput {
  title: string;
  subtitle?: string;
  sheets: SpreadsheetSheet[];
  author?: string;
}

export interface RenderedSpreadsheet {
  buffer: Buffer;
  filename: string;
}

function loadStyleSheet(): any {
  const row = db.prepare('SELECT data FROM jeff_style_sheet WHERE id = 1').get() as { data: string } | undefined;
  if (!row) return {};
  try { return JSON.parse(row.data); } catch { return {}; }
}

/** exceljs uses 8-char ARGB hex (alpha + RGB). This normalises #RRGGBB to FFRRGGBB. */
function argb(hex: string | undefined, fallback: string): string {
  const v = (hex ?? fallback).replace('#', '').toUpperCase();
  return /^[0-9A-F]{6}$/.test(v) ? 'FF' + v : 'FF' + fallback.replace('#', '').toUpperCase();
}

export async function renderSpreadsheet(input: SpreadsheetInput): Promise<RenderedSpreadsheet> {
  const style = loadStyleSheet();
  const brand = style.brand ?? {};

  const cPrimary   = argb(brand.colorPrimary, '#297D2D');
  const cCharcoal  = 'FF231F20';
  const cWhite     = 'FFFFFFFF';
  const cLightGrey = 'FFF5F5F5';
  const cMidGrey   = 'FF919191';

  const fontPrimary   = brand.fontPrimary || 'Helvetica';
  const fontSecondary = brand.fontSecondary || brand.fontMono || 'Helvetica';

  // exceljs ships both CJS and ESM. Match the same unwrap trick as the PPTX renderer.
  const mod: any = await import('exceljs');
  const ExcelJS: typeof ExcelJSType = mod.default?.default ?? mod.default ?? mod;

  const wb = new ExcelJS.Workbook();
  wb.creator       = input.author || brand.name || 'Path';
  wb.lastModifiedBy = wb.creator;
  wb.created       = new Date();
  wb.modified      = new Date();
  wb.title         = input.title;
  wb.subject       = input.subtitle ?? '';
  wb.company       = brand.name || 'Path';

  // Narrow gutter columns sit between every data column. Width ~2 gives a visible gap without
  // feeling like an empty column. Data cells sit at odd indices (1, 3, 5…), gutters at even.
  const GUTTER_WIDTH = 2;

  function withGutters<T>(cells: T[], fill: T): T[] {
    const out: T[] = [];
    for (let i = 0; i < cells.length; i++) {
      if (i > 0) out.push(fill);
      out.push(cells[i]);
    }
    return out;
  }

  for (const sheet of input.sheets) {
    const inputCols = Math.max(1, sheet.headers.length);
    const totalCols = Math.max(1, inputCols * 2 - 1);  // data + gutter + data + gutter + data
    // Excel caps sheet names at 31 chars and forbids a handful of characters.
    const safeName = sheet.name.replace(/[\\/?*:\[\]]/g, ' ').slice(0, 31) || 'Sheet';
    // No freeze and no gridlines — zebra stripes do row separation and the green header band
    // defines the table. Google Sheets otherwise renders frozen-pane dividers as thick grey lines.
    const ws = wb.addWorksheet(safeName, {
      views: [{ state: 'normal', showGridLines: false }],
    });

    // ── Title band (primary green, spans every column including gutters) ─
    const titleRow = ws.addRow([input.title]);
    ws.mergeCells(titleRow.number, 1, titleRow.number, totalCols);
    const titleCell = titleRow.getCell(1);
    titleCell.value = input.title;
    titleCell.font = { name: fontPrimary, size: 18, bold: true, color: { argb: cWhite } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cPrimary } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    titleRow.height = 32;

    // ── Subtitle row (optional) ────────────────────────────────────────
    if (input.subtitle) {
      const subRow = ws.addRow([input.subtitle]);
      ws.mergeCells(subRow.number, 1, subRow.number, totalCols);
      const subCell = subRow.getCell(1);
      subCell.value = input.subtitle;
      subCell.font = { name: fontSecondary, size: 11, italic: true, color: { argb: cMidGrey } };
      subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      subRow.height = 20;
    }

    // Spacer row to breathe before the table.
    ws.addRow([]);

    // ── Header row ───────────────────────────────────────────────────
    // Every cell (including gutters) fills with primary green so the header reads as one
    // continuous band. Body rows still leave gutters transparent to give the visible breaks.
    const headerCells = withGutters<string>(sheet.headers, '');
    const headerRow = ws.addRow(headerCells);
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cPrimary } };
      if (colNumber % 2 === 1) {
        cell.font = { name: fontPrimary, size: 11, bold: true, color: { argb: cWhite } };
        cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
      }
    });
    headerRow.height = 28;

    // ── Body rows (zebra across the full row, column A bold) ─────────
    // Gutter cells take the same zebra fill as the row they sit in, so each row reads as one
    // continuous band. The gap between data columns comes from the narrow gutter width alone,
    // not from a colour change.
    sheet.rows.forEach((row, idx) => {
      const dataRow = ws.addRow(withGutters<string>(row, ''));
      const rowFill = idx % 2 === 0
        ? { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: cLightGrey } }
        : { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: cWhite } };
      dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.fill = rowFill;
        if (colNumber % 2 === 1) {
          const isFirstColumn = colNumber === 1;
          cell.font = {
            name: isFirstColumn ? fontPrimary : fontSecondary,
            size: 10,
            bold: isFirstColumn,
            color: { argb: cCharcoal },
          };
          cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
        }
      });
      dataRow.height = 30;  // lets long cells breathe and gives short cells generous padding
    });

    // ── Column widths ────────────────────────────────────────────────
    // Data columns auto-size against content; gutter columns stay narrow and fixed.
    for (let i = 0; i < inputCols; i++) {
      const header = sheet.headers[i] ?? '';
      const longestBody = sheet.rows.reduce((m, r) => {
        const cell = String(r[i] ?? '');
        const longest = cell.split(/\s+/).reduce((a, b) => (b.length > a.length ? b : a), '');
        return Math.max(m, Math.min(cell.length, Math.max(longest.length, 18)));
      }, header.length);
      const width = Math.min(60, Math.max(14, Math.round(longestBody * 1.05) + 4));
      ws.getColumn(i * 2 + 1).width = width;              // data column
      if (i < inputCols - 1) ws.getColumn(i * 2 + 2).width = GUTTER_WIDTH; // gutter after it
    }
  }

  const out = await wb.xlsx.writeBuffer();
  const buffer = Buffer.from(out as ArrayBuffer);

  const stamp = new Date().toISOString().slice(0, 10);
  const safeTitle = input.title.replace(/[^\w \-.]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Spreadsheet';
  const filename = `${safeTitle} - ${stamp}.xlsx`;

  return { buffer, filename };
}
