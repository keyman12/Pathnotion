import React, { useEffect, useMemo } from 'react';
import { Icon } from './Icon';
import { api, type JeffMemoryKind, type JeffStyleSheet } from '../lib/api';
import { useJeffStyleSheet } from '../lib/queries';

/** Modal that renders one of Jeff's articles (daily news, weekly summary, competitor watch,
 *  research refresh) in Path-branded shape. Logo across the top, primary-green accent rule,
 *  Markdown-rendered body underneath. */
export function JeffArticleModal({ article, onClose }: {
  article: { kind: JeffMemoryKind; title: string; body: string | null; summary: string; createdAt: string };
  onClose: () => void;
}) {
  const styleQ = useJeffStyleSheet();
  const style: JeffStyleSheet | undefined = styleQ.data?.data;
  const logoSrc = api.agent.styleSheet.logoPreviewSrc(style?.brand?.logoLight ?? null);
  const primary = style?.brand?.colorPrimary ?? 'var(--path-primary)';
  const fontHeading = style?.brand?.fontPrimary ?? 'Poppins';

  // Esc to close, plus lock body scroll for the duration of the modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const date = useMemo(() => new Date(article.createdAt.includes('T') ? article.createdAt : article.createdAt.replace(' ', 'T') + 'Z'), [article.createdAt]);
  const dateLabel = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeLabel = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const kindLabel = KIND_LABEL[article.kind] ?? article.kind;

  // Use the body when we have it; fall back to the summary teaser for older rows that
  // pre-date the body column (so the modal still reads as something).
  const text = (article.body && article.body.trim()) || article.summary || '';

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(15, 23, 26, 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)',
          color: 'var(--fg-1)',
          borderRadius: 12,
          width: 'min(820px, 100%)',
          maxHeight: 'calc(100vh - 48px)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        {/* Branded header — logo + close */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px',
          background: 'var(--bg-sunken)',
          borderBottom: `3px solid ${primary}`,
        }}>
          {logoSrc
            ? <img src={logoSrc} alt="Path" style={{ height: 32, width: 'auto', objectFit: 'contain' }} />
            : <span style={{ fontFamily: fontHeading, fontSize: 20, fontWeight: 600, color: primary, letterSpacing: '-0.01em' }}>Path</span>
          }
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32, height: 32, borderRadius: 6,
              border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
              color: 'var(--fg-2)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        {/* Title block */}
        <div style={{ padding: '24px 32px 0' }}>
          <div className="meta" style={{ fontSize: 10, color: primary, letterSpacing: '0.08em', marginBottom: 8 }}>
            {kindLabel.toUpperCase()} · {dateLabel.toUpperCase()} · {timeLabel}
          </div>
          <h1 style={{
            fontFamily: fontHeading, fontSize: 28, lineHeight: 1.2, margin: 0,
            color: 'var(--fg-1)', fontWeight: 600, letterSpacing: '-0.015em',
          }}>{article.title}</h1>
        </div>

        {/* Body — markdown-rendered */}
        <div style={{
          padding: '20px 32px 32px',
          overflow: 'auto', flex: 1,
          fontSize: 14.5, lineHeight: 1.65, color: 'var(--fg-2)',
        }}>
          <MarkdownRenderer text={text} primary={primary} fontHeading={fontHeading} />
        </div>
      </div>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  'daily-news':           "Today's news",
  'weekly-summary':       'Weekly summary',
  'competitor-features':  'Competitor watch',
  'research-refresh':     'Research refresh',
  'note':                 'Note',
  'article':              'Article',
  'drive-file':           'Drive file',
};

// ─── Tiny Markdown renderer ─────────────────────────────────────────────────
// We don't pull in a markdown library — the subset Jeff produces is small (headings, paragraphs,
// bullets, numbered lists, bold, italic, links, code) and a focused renderer keeps the bundle
// small and the styling on-brand without overrides.

function MarkdownRenderer({ text, primary, fontHeading }: { text: string; primary: string; fontHeading: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <div>
      {blocks.map((b, i) => renderBlock(b, i, primary, fontHeading))}
    </div>
  );
}

type Block =
  | { type: 'h1' | 'h2' | 'h3' | 'h4'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul' | 'ol'; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'hr' }
  | { type: 'code'; text: string };

function parseMarkdown(text: string): Block[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    // Code fence
    if (line.startsWith('```')) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { buf.push(lines[i]); i++; }
      i++; // close fence
      out.push({ type: 'code', text: buf.join('\n') });
      continue;
    }

    // HR
    if (/^---+$/.test(line.trim())) { out.push({ type: 'hr' }); i++; continue; }

    // Headings
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length as 1 | 2 | 3 | 4;
      out.push({ type: (`h${level}` as Block['type']), text: h[2].trim() } as Block);
      i++; continue;
    }

    // Bullet list — collect contiguous lines starting with -, *, or +
    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s+/, ''));
        i++;
      }
      out.push({ type: 'ul', items });
      continue;
    }

    // Numbered list
    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+[.)]\s+/, ''));
        i++;
      }
      out.push({ type: 'ol', items });
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push({ type: 'quote', text: buf.join(' ') });
      continue;
    }

    // Paragraph — collect until blank line or block boundary
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    out.push({ type: 'p', text: buf.join(' ') });
  }
  return out;
}

function isBlockStart(line: string): boolean {
  return /^(#{1,4}\s|[-*+]\s|\d+[.)]\s|>|```|---+$)/.test(line.trim());
}

function renderBlock(b: Block, key: number, primary: string, fontHeading: string) {
  switch (b.type) {
    case 'h1':
      return <h2 key={key} style={{ fontFamily: fontHeading, fontSize: 22, fontWeight: 600, color: 'var(--fg-1)', margin: '20px 0 8px', letterSpacing: '-0.01em' }}>{renderInline(b.text)}</h2>;
    case 'h2':
      return <h3 key={key} style={{ fontFamily: fontHeading, fontSize: 17, fontWeight: 600, color: primary, margin: '20px 0 6px', textTransform: 'none' }}>{renderInline(b.text)}</h3>;
    case 'h3':
      return <h4 key={key} style={{ fontFamily: fontHeading, fontSize: 15, fontWeight: 600, color: 'var(--fg-1)', margin: '16px 0 4px' }}>{renderInline(b.text)}</h4>;
    case 'h4':
      return <h5 key={key} style={{ fontFamily: fontHeading, fontSize: 13.5, fontWeight: 600, color: 'var(--fg-2)', margin: '12px 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{renderInline(b.text)}</h5>;
    case 'p':
      return <p key={key} style={{ margin: '8px 0', color: 'var(--fg-2)' }}>{renderInline(b.text)}</p>;
    case 'ul':
      return (
        <ul key={key} style={{ margin: '8px 0 8px 4px', paddingLeft: 22, color: 'var(--fg-2)' }}>
          {b.items.map((it, i) => <li key={i} style={{ margin: '4px 0' }}>{renderInline(it)}</li>)}
        </ul>
      );
    case 'ol':
      return (
        <ol key={key} style={{ margin: '8px 0 8px 4px', paddingLeft: 22, color: 'var(--fg-2)' }}>
          {b.items.map((it, i) => <li key={i} style={{ margin: '4px 0' }}>{renderInline(it)}</li>)}
        </ol>
      );
    case 'quote':
      return (
        <blockquote key={key} style={{
          margin: '12px 0', padding: '8px 14px',
          borderLeft: `3px solid ${primary}`,
          background: 'var(--bg-sunken)', color: 'var(--fg-2)',
          fontStyle: 'italic', borderRadius: '0 6px 6px 0',
        }}>{renderInline(b.text)}</blockquote>
      );
    case 'hr':
      return <hr key={key} style={{ border: 0, borderTop: '1px solid var(--border-subtle)', margin: '20px 0' }} />;
    case 'code':
      return (
        <pre key={key} style={{
          background: 'var(--bg-sunken)', padding: 12, borderRadius: 6,
          overflow: 'auto', fontSize: 12.5, fontFamily: 'var(--font-mono, monospace)',
          color: 'var(--fg-1)', margin: '12px 0',
        }}><code>{b.text}</code></pre>
      );
  }
}

/** Inline markdown: **bold**, *italic* / _italic_, `code`, [text](url). */
function renderInline(text: string): React.ReactNode {
  // Walk the string, emit React nodes. Order matters: bold before italic, links last.
  // The regex captures one of the supported inline forms; everything else is plain text.
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2] !== undefined || m[3] !== undefined) {
      out.push(<strong key={`b${key++}`} style={{ color: 'var(--fg-1)' }}>{m[2] ?? m[3]}</strong>);
    } else if (m[4] !== undefined || m[5] !== undefined) {
      out.push(<em key={`i${key++}`}>{m[4] ?? m[5]}</em>);
    } else if (m[6] !== undefined) {
      out.push(<code key={`c${key++}`} style={{
        background: 'var(--bg-sunken)', padding: '1px 6px', borderRadius: 4,
        fontFamily: 'var(--font-mono, monospace)', fontSize: '0.92em', color: 'var(--fg-1)',
      }}>{m[6]}</code>);
    } else if (m[7] !== undefined && m[8] !== undefined) {
      out.push(
        <a key={`a${key++}`} href={m[8]} target="_blank" rel="noopener noreferrer"
           style={{ color: 'var(--fg-link, var(--path-primary))', textDecoration: 'underline' }}>
          {m[7]}
        </a>
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? out : text;
}
