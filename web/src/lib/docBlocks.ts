// Converters between our persisted DocBlock[] format and TipTap's ProseMirror JSON.
// Block types the editor can edit: h1/h2/h3, p, ul, ol, quote, code, divider, callout.
// Block types the editor preserves but does not edit: file, table.

import type { DocBlock, InlineNode, InlineMarkName, ListBlock, TextAlign, TodoItem } from './types';

interface TipTapDoc {
  type: 'doc';
  content: TipTapNode[];
}

interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

// ─── DocBlock[] → TipTap JSON ──────────────────────────────────────────────

function withAlign(attrs: Record<string, unknown>, align: TextAlign | undefined): Record<string, unknown> {
  if (align && align !== 'left') return { ...attrs, textAlign: align };
  return attrs;
}

export function blocksToTipTap(blocks: DocBlock[]): TipTapDoc {
  const content: TipTapNode[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case 'h1': case 'h2': case 'h3': {
        const level = Number(b.type.slice(1));
        content.push({ type: 'heading', attrs: withAlign({ level }, b.align), content: inlineToTipTap(b.inline, b.text) });
        break;
      }
      case 'p':
        content.push({ type: 'paragraph', attrs: withAlign({}, b.align), content: inlineToTipTap(b.inline, b.text) });
        break;
      case 'quote':
        content.push({ type: 'blockquote', content: [{ type: 'paragraph', attrs: withAlign({}, b.align), content: inlineToTipTap(b.inline, b.text) }] });
        break;
      case 'code':
        content.push({ type: 'codeBlock', attrs: b.lang ? { language: b.lang } : {}, content: b.text ? [{ type: 'text', text: b.text }] : [] });
        break;
      case 'divider':
        content.push({ type: 'horizontalRule' });
        break;
      case 'callout':
        content.push({
          type: 'callout',
          attrs: { tone: b.tone },
          content: [{ type: 'paragraph', attrs: withAlign({}, b.align), content: inlineToTipTap(b.inline, b.text) }],
        });
        break;
      case 'ul':
      case 'ol':
        content.push({
          type: b.type === 'ul' ? 'bulletList' : 'orderedList',
          content: b.items.map((item, i) => buildListItem(item, b.itemsInline?.[i], b.itemsChildren?.[i] ?? null)),
        });
        break;
      case 'todo':
        content.push({
          type: 'taskList',
          content: b.items.map((item, i) => buildTaskItem(item, b.itemsChildren?.[i] ?? null)),
        });
        break;
      case 'table': {
        const rows: TipTapNode[] = [];
        // Header row — tableHeader cells with each column label.
        rows.push({
          type: 'tableRow',
          content: b.columns.map((col) => ({
            type: 'tableHeader',
            content: [{ type: 'paragraph', content: col ? [{ type: 'text', text: col }] : undefined }],
          })),
        });
        // Body rows.
        for (const r of b.rows) {
          rows.push({
            type: 'tableRow',
            content: r.map((cell) => ({
              type: 'tableCell',
              content: [{ type: 'paragraph', content: cell ? [{ type: 'text', text: cell }] : undefined }],
            })),
          });
        }
        content.push({ type: 'table', content: rows });
        break;
      }
      case 'file':
        // File blocks aren't authored in the editor; preserve them as a read-only placeholder.
        content.push({ type: 'preservedBlock', attrs: { original: JSON.stringify(b) } });
        break;
    }
  }
  // Ensure the doc always has at least one paragraph so the cursor has somewhere to go.
  if (content.length === 0) content.push({ type: 'paragraph' });
  return { type: 'doc', content };
}

function buildListItem(text: string, inline: InlineNode[] | undefined, nested: ListBlock | null): TipTapNode {
  const content: TipTapNode[] = [{ type: 'paragraph', content: inlineToTipTap(inline, text) }];
  if (nested) {
    const nestedDoc = blocksToTipTap([nested]);
    for (const n of nestedDoc.content) content.push(n);
  }
  return { type: 'listItem', content };
}

function buildTaskItem(item: TodoItem, nested: ListBlock | null): TipTapNode {
  const content: TipTapNode[] = [{ type: 'paragraph', content: inlineToTipTap(item.inline, item.text) }];
  if (nested) {
    const nestedDoc = blocksToTipTap([nested]);
    for (const n of nestedDoc.content) content.push(n);
  }
  return { type: 'taskItem', attrs: { checked: !!item.checked }, content };
}

function inlineToTipTap(inline: InlineNode[] | undefined, fallback: string): TipTapNode[] | undefined {
  const source = inline?.length ? inline : (fallback ? [{ text: fallback }] as InlineNode[] : []);
  if (!source.length) return undefined;
  return source.filter((n) => n.text.length > 0).map((n) => {
    const marks: TipTapNode['marks'] = [];
    for (const m of n.marks ?? []) marks.push({ type: m });
    if (n.href) marks.push({ type: 'link', attrs: { href: n.href } });
    if (n.color) marks.push({ type: 'textStyle', attrs: { color: n.color } });
    return marks.length ? { type: 'text', text: n.text, marks } : { type: 'text', text: n.text };
  });
}

function readAlign(attrs: Record<string, unknown> | undefined): TextAlign | undefined {
  const v = attrs?.textAlign;
  if (v === 'center' || v === 'right' || v === 'justify') return v;
  return undefined;
}

// ─── TipTap JSON → DocBlock[] ──────────────────────────────────────────────

export function tipTapToBlocks(doc: TipTapDoc): DocBlock[] {
  const out: DocBlock[] = [];
  for (const node of doc.content ?? []) {
    const block = nodeToBlock(node);
    if (block) out.push(block);
  }
  return out;
}

function nodeToBlock(node: TipTapNode): DocBlock | null {
  switch (node.type) {
    case 'heading': {
      const level = Math.min(3, Math.max(1, Number(node.attrs?.level ?? 1)));
      const align = readAlign(node.attrs);
      const { text, inline } = extractInline(node.content);
      return { type: `h${level}` as 'h1' | 'h2' | 'h3', text, ...(inline ? { inline } : {}), ...(align ? { align } : {}) };
    }
    case 'paragraph': {
      const align = readAlign(node.attrs);
      const { text, inline } = extractInline(node.content);
      return { type: 'p', text, ...(inline ? { inline } : {}), ...(align ? { align } : {}) };
    }
    case 'blockquote': {
      const para = (node.content ?? []).find((c) => c.type === 'paragraph');
      const align = readAlign(para?.attrs);
      const { text, inline } = extractInline(para?.content);
      return { type: 'quote', text, ...(inline ? { inline } : {}), ...(align ? { align } : {}) };
    }
    case 'codeBlock': {
      const text = (node.content ?? []).map((c) => c.text ?? '').join('');
      const lang = node.attrs?.language as string | undefined;
      return lang ? { type: 'code', text, lang } : { type: 'code', text };
    }
    case 'horizontalRule':
      return { type: 'divider' };
    case 'callout': {
      const tone = (node.attrs?.tone === 'warn' ? 'warn' : 'info') as 'info' | 'warn';
      const para = (node.content ?? []).find((c) => c.type === 'paragraph');
      const align = readAlign(para?.attrs);
      const { text, inline } = extractInline(para?.content);
      return { type: 'callout', tone, text, ...(inline ? { inline } : {}), ...(align ? { align } : {}) };
    }
    case 'bulletList':
    case 'orderedList': {
      const items: string[] = [];
      const itemsInline: (InlineNode[] | undefined)[] = [];
      const itemsChildren: (ListBlock | null)[] = [];
      for (const li of node.content ?? []) {
        const para = (li.content ?? []).find((c) => c.type === 'paragraph');
        const { text, inline } = extractInline(para?.content);
        items.push(text);
        itemsInline.push(inline);
        itemsChildren.push(extractNestedList(li.content ?? []));
      }
      const hasAnyInline = itemsInline.some((x) => x);
      const hasAnyChild = itemsChildren.some((x) => x);
      const base = node.type === 'bulletList'
        ? { type: 'ul' as const, items }
        : { type: 'ol' as const, items };
      return {
        ...base,
        ...(hasAnyInline ? { itemsInline: itemsInline.map((x) => x ?? []) } : {}),
        ...(hasAnyChild ? { itemsChildren } : {}),
      };
    }
    case 'taskList': {
      const items: TodoItem[] = [];
      const itemsChildren: (ListBlock | null)[] = [];
      for (const li of node.content ?? []) {
        const para = (li.content ?? []).find((c) => c.type === 'paragraph');
        const { text, inline } = extractInline(para?.content);
        items.push({
          text,
          checked: !!li.attrs?.checked,
          ...(inline ? { inline } : {}),
        });
        itemsChildren.push(extractNestedList(li.content ?? []));
      }
      const hasAnyChild = itemsChildren.some((x) => x);
      return hasAnyChild
        ? { type: 'todo', items, itemsChildren }
        : { type: 'todo', items };
    }
    case 'preservedBlock': {
      const raw = node.attrs?.original;
      if (typeof raw === 'string') {
        try { return JSON.parse(raw) as DocBlock; } catch { return null; }
      }
      return null;
    }
    case 'table': {
      const rowNodes = node.content ?? [];
      if (!rowNodes.length) return null;
      // First row becomes header if any of its cells is a tableHeader; otherwise we auto-treat it as header.
      const firstCells = rowNodes[0].content ?? [];
      const isFirstHeader = firstCells.some((c) => c.type === 'tableHeader');
      const columns = firstCells.map((c) => extractCellText(c.content));
      const bodyRows = (isFirstHeader ? rowNodes.slice(1) : rowNodes).map((r) =>
        (r.content ?? []).map((c) => extractCellText(c.content))
      );
      return { type: 'table', columns, rows: bodyRows };
    }
    default:
      return null;
  }
}

function extractCellText(content: TipTapNode[] | undefined): string {
  if (!content?.length) return '';
  // Join all paragraph text inside the cell — Jeff reads plain-text cells.
  return content
    .filter((c) => c.type === 'paragraph')
    .map((p) => (p.content ?? []).filter((n) => n.type === 'text').map((n) => n.text ?? '').join(''))
    .join(' ');
}

/** Pull a nested list (bulletList/orderedList/taskList) out of a listItem's content, if present. */
function extractNestedList(items: TipTapNode[]): ListBlock | null {
  const nested = items.find((c) => c.type === 'bulletList' || c.type === 'orderedList' || c.type === 'taskList');
  if (!nested) return null;
  const block = nodeToBlock(nested);
  if (block && (block.type === 'ul' || block.type === 'ol' || block.type === 'todo')) return block;
  return null;
}

function extractInline(content: TipTapNode[] | undefined): { text: string; inline?: InlineNode[] } {
  if (!content?.length) return { text: '' };
  let anyRich = false;
  const nodes: InlineNode[] = [];
  let plain = '';
  for (const c of content) {
    if (c.type !== 'text' || typeof c.text !== 'string') continue;
    plain += c.text;
    const marks: InlineMarkName[] = [];
    let href: string | undefined;
    let color: string | undefined;
    for (const m of c.marks ?? []) {
      if (m.type === 'bold' || m.type === 'italic' || m.type === 'code' || m.type === 'underline' || m.type === 'strike') {
        marks.push(m.type);
      } else if (m.type === 'link' && typeof m.attrs?.href === 'string') {
        href = m.attrs.href;
      } else if (m.type === 'textStyle' && typeof m.attrs?.color === 'string') {
        color = m.attrs.color;
      }
    }
    if (marks.length || href || color) anyRich = true;
    const node: InlineNode = { text: c.text };
    if (marks.length) node.marks = marks;
    if (href) node.href = href;
    if (color) node.color = color;
    nodes.push(node);
  }
  return anyRich ? { text: plain, inline: nodes } : { text: plain };
}
