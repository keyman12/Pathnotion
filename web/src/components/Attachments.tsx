import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import type { Attachment, AttachmentKind, BacklogItem } from '../lib/types';
import type { Doc, FileEntry } from '../lib/types';
import {
  DOC_CONTENT,
  FINANCE_DOCS,
  FINANCE_FILES,
  LEGAL_DOCS,
  LEGAL_FILES,
  PRODUCT_DOCS,
  PRODUCT_FILES,
  PRODUCTS,
  SALES_DOCS,
  SALES_FILES,
} from '../lib/seed';
import { useBacklog } from '../lib/queries';
import { Avatar } from './primitives';
import { FileBadge, fileMeta, humanBytes } from '../views/DocsView';
import { DocEditor } from './DocEditor';

// ─── resolver ──────────────────────────────────────────────────────────────
// attachments[].ref is either a seed id ('d1', 'pf3'), a URL, or — for legacy
// single-link rows migrated from link_type/link_ref — a doc/file title.

const ALL_DOCS: Doc[] = [...PRODUCT_DOCS, ...FINANCE_DOCS, ...SALES_DOCS, ...LEGAL_DOCS];
const ALL_FILES: FileEntry[] = [...PRODUCT_FILES, ...FINANCE_FILES, ...SALES_FILES, ...LEGAL_FILES];

function findDoc(ref: string): Doc | null {
  return ALL_DOCS.find((d) => d.id === ref) ?? ALL_DOCS.find((d) => d.title === ref) ?? null;
}

function findFile(ref: string): FileEntry | null {
  return ALL_FILES.find((f) => f.id === ref) ?? ALL_FILES.find((f) => f.title === ref) ?? null;
}

interface Resolved {
  attachment: Attachment;
  label: string;
  sub: string | null;
  doc: Doc | null;
  file: FileEntry | null;
  backlogId: string | null;
  href: string | null;
}

export function resolveAttachment(att: Attachment, backlogItems: BacklogItem[] = []): Resolved {
  if (att.type === 'doc') {
    const d = findDoc(att.ref);
    return {
      attachment: att,
      label: att.label ?? d?.title ?? att.ref,
      sub: d ? (d.group ?? PRODUCTS.find((p) => p.id === d.product)?.label ?? null) : 'Missing document',
      doc: d,
      file: null,
      backlogId: null,
      href: null,
    };
  }
  if (att.type === 'file') {
    const f = findFile(att.ref);
    return {
      attachment: att,
      label: att.label ?? f?.title ?? att.ref,
      sub: f ? (f.group ?? PRODUCTS.find((p) => p.id === f.product)?.label ?? null) : 'Missing file',
      doc: null,
      file: f,
      backlogId: null,
      href: null,
    };
  }
  if (att.type === 'backlog') {
    const b = backlogItems.find((x) => x.id === att.ref);
    return {
      attachment: att,
      label: att.label ?? b?.title ?? att.ref,
      sub: b ? `${att.ref} · ${PRODUCTS.find((p) => p.id === b.product)?.label ?? b.product}` : att.ref,
      doc: null,
      file: null,
      backlogId: att.ref,
      href: null,
    };
  }
  // url
  return {
    attachment: att,
    label: att.label ?? att.ref,
    sub: hostOf(att.ref) ?? 'Link',
    doc: null,
    file: null,
    backlogId: null,
    href: att.ref,
  };
}

function hostOf(href: string): string | null {
  try { return new URL(href).host; } catch { return null; }
}

function attKey(att: Attachment, i: number) {
  return `${att.type}:${att.ref}:${i}`;
}

// ─── chip row ──────────────────────────────────────────────────────────────

export function AttachmentChipRow({ attachments, onOpen, onRemove }: {
  attachments: Attachment[];
  onOpen: (att: Attachment) => void;
  onRemove: (att: Attachment, idx: number) => void;
}) {
  const backlogQ = useBacklog();
  const backlogItems = backlogQ.data ?? [];
  if (!attachments.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
      {attachments.map((att, i) => (
        <AttachmentChip
          key={attKey(att, i)}
          attachment={att}
          backlogItems={backlogItems}
          onOpen={() => onOpen(att)}
          onRemove={() => onRemove(att, i)}
        />
      ))}
    </div>
  );
}

function AttachmentChip({ attachment, backlogItems, onOpen, onRemove }: {
  attachment: Attachment;
  backlogItems: BacklogItem[];
  onOpen: () => void;
  onRemove: () => void;
}) {
  const r = resolveAttachment(attachment, backlogItems);
  return (
    <span
      className="row-hover"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 4px 6px 10px',
        background: 'var(--bg-sunken)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 6,
        maxWidth: 280,
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        title={r.href ?? r.label}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: 'transparent',
          border: 0,
          padding: 0,
          cursor: 'pointer',
          color: 'var(--fg-1)',
          maxWidth: 240,
        }}
      >
        <AttachmentIcon kind={attachment.type} ext={r.file?.ext} />
        <span style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 1,
          minWidth: 0,
        }}>
          <span style={{
            fontSize: 12.5,
            color: 'var(--fg-1)',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 220,
          }}>{r.label}</span>
          {r.sub && (
            <span className="mono" style={{
              fontSize: 9.5,
              color: 'var(--fg-4)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 220,
            }}>{r.sub}</span>
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        title="Remove attachment"
        aria-label="Remove attachment"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 22,
          height: 22,
          border: 0,
          borderRadius: 4,
          background: 'transparent',
          color: 'var(--danger-fg)',
          cursor: 'pointer',
        }}
      >
        <Icon name="x" size={12} />
      </button>
    </span>
  );
}

function AttachmentIcon({ kind, ext }: { kind: AttachmentKind; ext?: string }) {
  if (kind === 'file' && ext) return <FileBadge ext={ext} size={22} />;
  if (kind === 'doc') return <Icon name="docs" size={14} color="var(--fg-2)" />;
  if (kind === 'backlog') return <Icon name="backlog" size={14} color="var(--fg-2)" />;
  return <Icon name="link" size={14} color="var(--fg-2)" />;
}

// ─── add button (small icon on the description box) ────────────────────────

export function AttachIconButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Attach document, file, or link"
      aria-label="Attach"
      style={{
        position: 'absolute',
        top: 6,
        right: 6,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        border: '1px solid var(--border-subtle)',
        borderRadius: 6,
        background: 'var(--bg-surface)',
        color: 'var(--fg-2)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Icon name="paperclip" size={13} />
    </button>
  );
}

// ─── picker drawer ─────────────────────────────────────────────────────────

type PickerTab = 'doc' | 'file' | 'backlog' | 'url';

export function AttachPickerDrawer({ existing, onAdd, onClose, includeBacklog = true }: {
  existing: Attachment[];
  onAdd: (att: Attachment) => void;
  onClose: () => void;
  /** Show the Backlog tab. Hide for the backlog editor itself to avoid self-linking noise. */
  includeBacklog?: boolean;
}) {
  const [tab, setTab] = useState<PickerTab>('doc');
  const [query, setQuery] = useState('');
  const [url, setUrl] = useState('');
  const [urlLabel, setUrlLabel] = useState('');
  const backlogQ = useBacklog();
  const backlogItems = backlogQ.data ?? [];

  const taken = useMemo(() => {
    const set = new Set<string>();
    existing.forEach((a) => set.add(`${a.type}:${a.ref}`));
    return set;
  }, [existing]);

  const q = query.trim().toLowerCase();
  const filteredDocs = useMemo(() =>
    ALL_DOCS.filter((d) => !q || [d.title, d.group, (d.tags ?? []).join(' ')].join(' ').toLowerCase().includes(q))
  , [q]);
  const filteredFiles = useMemo(() =>
    ALL_FILES.filter((f) => !q || [f.title, f.group, f.ext, (f.tags ?? []).join(' ')].join(' ').toLowerCase().includes(q))
  , [q]);
  const filteredBacklog = useMemo(() =>
    backlogItems.filter((b) => !q || `${b.id} ${b.title} ${b.product}`.toLowerCase().includes(q))
  , [q, backlogItems]);

  const availableTabs: PickerTab[] = includeBacklog ? ['doc', 'file', 'backlog', 'url'] : ['doc', 'file', 'url'];

  const submitUrl = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    const href = /^(https?:)?\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    onAdd({ type: 'url', ref: href, label: urlLabel.trim() || undefined });
    setUrl('');
    setUrlLabel('');
  };

  return (
    <DrawerShell onClose={onClose} width={440}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="paperclip" size={15} color="var(--fg-2)" />
        <div style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--fg-1)' }}>Attach</div>
        <button className="btn btn-subtle btn-icon" onClick={onClose} title="Close"><Icon name="x" size={13} /></button>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '10px 12px 0 12px' }}>
        {availableTabs.map((t) => {
          const active = t === tab;
          const label = t === 'doc' ? 'Documents' : t === 'file' ? 'Files' : t === 'backlog' ? 'Backlog' : 'Link';
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid transparent',
                background: active ? 'var(--bg-active)' : 'transparent',
                color: active ? 'var(--fg-1)' : 'var(--fg-3)',
                fontSize: 12.5,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {(tab === 'doc' || tab === 'file' || tab === 'backlog') && (
        <div style={{ padding: '10px 14px 0 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', height: 32, border: '1px solid var(--border-default)', borderRadius: 6, background: 'var(--bg-surface)' }}>
            <Icon name="search" size={12} color="var(--fg-3)" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === 'doc' ? 'Search documents…' : tab === 'file' ? 'Search files…' : 'Search backlog…'}
              style={{ border: 0, outline: 'none', fontFamily: 'var(--font-primary)', fontSize: 12.5, width: '100%', color: 'var(--fg-1)', background: 'transparent' }}
            />
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px 14px 12px' }}>
        {tab === 'doc' && (
          <PickerList
            entries={filteredDocs.map((d) => ({
              id: d.id,
              title: d.title,
              sub: d.group ?? PRODUCTS.find((p) => p.id === d.product)?.label ?? '',
              meta: `${d.updated}${DOC_CONTENT[d.id] ? '' : ' · stub'}`,
              taken: taken.has(`doc:${d.id}`),
              icon: <Icon name="docs" size={14} color="var(--fg-2)" />,
              onClick: () => onAdd({ type: 'doc', ref: d.id }),
            }))}
          />
        )}
        {tab === 'file' && (
          <PickerList
            entries={filteredFiles.map((f) => ({
              id: f.id,
              title: f.title,
              sub: f.group ?? PRODUCTS.find((p) => p.id === f.product)?.label ?? '',
              meta: `${fileMeta(f.ext).sub} · ${humanBytes(f.bytes)}${f.version ? ` · ${f.version}` : ''}`,
              taken: taken.has(`file:${f.id}`),
              icon: <FileBadge ext={f.ext} size={26} />,
              onClick: () => onAdd({ type: 'file', ref: f.id }),
            }))}
          />
        )}
        {tab === 'backlog' && (
          <PickerList
            entries={filteredBacklog.map((b) => {
              const productLabel = PRODUCTS.find((p) => p.id === b.product)?.label ?? b.product;
              return {
                id: b.id,
                title: b.title,
                sub: `${b.id} · ${productLabel}`,
                meta: b.completedAt ? 'Done' : b.stage,
                taken: taken.has(`backlog:${b.id}`),
                icon: <Icon name="backlog" size={14} color="var(--fg-2)" />,
                onClick: () => onAdd({ type: 'backlog', ref: b.id }),
              };
            })}
          />
        )}
        {tab === 'url' && (
          <form
            onSubmit={(e) => { e.preventDefault(); submitUrl(); }}
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>URL</span>
              <input
                autoFocus
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                className="input"
                style={{ height: 34 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Label (optional)</span>
              <input
                value={urlLabel}
                onChange={(e) => setUrlLabel(e.target.value)}
                placeholder="e.g. Notable – term sheet"
                className="input"
                style={{ height: 34 }}
              />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button type="submit" className="btn btn-primary" disabled={!url.trim()}>
                <Icon name="plus" size={12} /> Add link
              </button>
            </div>
          </form>
        )}
      </div>
    </DrawerShell>
  );
}

function PickerList({ entries }: {
  entries: Array<{
    id: string;
    title: string;
    sub: string;
    meta: string;
    taken: boolean;
    icon: React.ReactNode;
    onClick: () => void;
  }>;
}) {
  if (!entries.length) {
    return <div style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--fg-4)', fontSize: 12.5 }}>No matches.</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {entries.map((e) => (
        <button
          key={e.id}
          type="button"
          disabled={e.taken}
          onClick={e.onClick}
          className="row-hover"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 10px',
            background: 'transparent',
            border: '1px solid transparent',
            borderRadius: 6,
            textAlign: 'left',
            cursor: e.taken ? 'default' : 'pointer',
            opacity: e.taken ? 0.5 : 1,
          }}
        >
          <span style={{ flexShrink: 0 }}>{e.icon}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13, color: 'var(--fg-1)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</span>
            <span style={{ display: 'block', fontSize: 10.5, color: 'var(--fg-3)', marginTop: 1 }}>
              {e.sub}{e.sub && e.meta ? ' · ' : ''}{e.meta}
            </span>
          </span>
          {e.taken
            ? <span className="mono" style={{ fontSize: 10, color: 'var(--fg-4)' }}>added</span>
            : <Icon name="plus" size={13} color="var(--fg-3)" />}
        </button>
      ))}
    </div>
  );
}

// ─── viewer drawer (opens when a doc/file chip is clicked) ─────────────────

export function AttachmentViewerDrawer({ attachment, onClose }: {
  attachment: Attachment;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const backlogQ = useBacklog();
  const r = resolveAttachment(attachment, backlogQ.data ?? []);
  // Docs open in the full editor — same experience as opening from the Docs view.
  if (attachment.type === 'doc' && r.doc) {
    return <DocEditor docId={r.doc.id} onClose={onClose} />;
  }
  return (
    <DrawerShell onClose={onClose} width={expanded ? '100%' : 560}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <AttachmentIcon kind={attachment.type} ext={r.file?.ext} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.label}
          </div>
          {r.sub && <div className="mono" style={{ fontSize: 10, color: 'var(--fg-4)' }}>{r.sub}</div>}
        </div>
        <button
          type="button"
          className="btn btn-subtle btn-icon"
          title={expanded ? 'Collapse' : 'Expand to full screen'}
          onClick={() => setExpanded((v) => !v)}
        >
          <Icon name={expanded ? 'chevron-right' : 'arrow-up-right'} size={13} />
        </button>
        <button className="btn btn-subtle btn-icon" onClick={onClose} title="Close"><Icon name="x" size={13} /></button>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {r.file ? <FileInlineView f={r.file} /> : null}
        {!r.file && <MissingState label={r.label} />}
      </div>
    </DrawerShell>
  );
}

function FileInlineView({ f }: { f: FileEntry }) {
  const m = fileMeta(f.ext);
  const p = f.product ? PRODUCTS.find((x) => x.id === f.product) : null;
  return (
    <div style={{ padding: '22px 24px' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {p && <span className="tag" style={{ color: p.color }}><span className="tag-dot" style={{ background: p.color }} />{p.label}</span>}
        {f.group && <span className="tag" style={{ color: 'var(--fg-3)' }}>{f.group}</span>}
        {(f.tags || []).map((t) => <span key={t} className="tag" style={{ color: 'var(--fg-2)' }}>#{t}</span>)}
      </div>
      <div style={{
        marginTop: 18,
        aspectRatio: '4/3',
        borderRadius: 8,
        border: '1px solid var(--border-subtle)',
        background: `linear-gradient(180deg, ${m.bg}, var(--bg-surface) 70%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 10,
      }}>
        <FileBadge ext={f.ext} size={72} />
        <div className="meta" style={{ fontSize: 11 }}>Preview — open to see the full file</div>
      </div>
      <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 10, columnGap: 16, fontSize: 12.5 }}>
        <div className="meta" style={{ fontSize: 10 }}>Uploaded by</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Avatar who={f.by} size={18} />
          <span style={{ color: 'var(--fg-1)' }}>{f.by === 'D' ? 'Dave' : 'Raj'}</span>
        </div>
        <div className="meta" style={{ fontSize: 10 }}>Last edited</div>
        <div style={{ color: 'var(--fg-1)' }}>{f.updated}</div>
        <div className="meta" style={{ fontSize: 10 }}>Size</div>
        <div style={{ color: 'var(--fg-1)' }}>{humanBytes(f.bytes)}</div>
        {f.version && <>
          <div className="meta" style={{ fontSize: 10 }}>Version</div>
          <div style={{ color: 'var(--fg-1)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{f.version}</div>
        </>}
      </div>
    </div>
  );
}

function MissingState({ label }: { label: string }) {
  return (
    <div style={{ padding: '48px 28px', textAlign: 'center', color: 'var(--fg-3)', fontSize: 13 }}>
      <div style={{ fontSize: 15, color: 'var(--fg-1)', fontWeight: 500, marginBottom: 8 }}>{label}</div>
      This resource is not in the current workspace seed. It may have been moved or removed.
    </div>
  );
}

// ─── drawer shell (right-edge slide-in; expandable) ────────────────────────

function DrawerShell({ children, onClose, width }: {
  children: React.ReactNode;
  onClose: () => void;
  width: number | string;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,26,0.55)',
        zIndex: 60,
        display: 'flex',
        justifyContent: 'flex-end',
        animation: 'fadeIn 120ms ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: typeof width === 'number' ? width : width,
          maxWidth: '100vw',
          height: '100%',
          background: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border-default)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideIn 220ms cubic-bezier(.2,.8,.2,1)',
          transition: 'width 220ms cubic-bezier(.2,.8,.2,1)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
