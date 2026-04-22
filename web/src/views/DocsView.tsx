import { useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Avatar } from '../components/primitives';
import { Icon } from '../components/Icon';
import { DocEditor } from '../components/DocEditor';
import { Dropdown } from '../components/Dropdown';
import {
  DOC_CONTENT,
  FINANCE_DOCS,
  FINANCE_FILES,
  LEGAL_DOCS,
  LEGAL_FILES,
  PRODUCTS,
  PRODUCT_FILES,
  SALES_DOCS,
  SALES_FILES,
} from '../lib/seed';
import type { Doc, DocBlock, FileEntry } from '../lib/types';
import { useCreateDoc, useDocsTree } from '../lib/queries';
import type { DocSummary } from '../lib/api';

type Mode = 'product' | 'finance' | 'sales' | 'legal';
type TabId = 'all' | 'pages' | 'files';

interface BusinessConfig {
  title: string;
  sub: string;
  groups: string[];
  docs: Doc[];
  files: FileEntry[];
  searchPlaceholder: string;
}

const BUSINESS_CONFIG: Record<Exclude<Mode, 'product'>, BusinessConfig> = {
  finance: {
    title: 'Finance',
    sub: "Raj's parallel space. Pages, sheets, contracts, decks. Separate from product docs on purpose.",
    groups: ['Models', 'Forecasts', 'Legal', 'Contracts', 'Board'],
    docs: FINANCE_DOCS,
    files: FINANCE_FILES,
    searchPlaceholder: 'Search finance — title, tag, type…',
  },
  sales: {
    title: 'Sales',
    sub: 'Pipeline, accounts, playbooks, pricing. Everything customer-facing.',
    groups: ['Pipeline', 'Accounts', 'Playbooks', 'Pricing'],
    docs: SALES_DOCS,
    files: SALES_FILES,
    searchPlaceholder: 'Search sales — title, tag, type…',
  },
  legal: {
    title: 'Legal',
    sub: 'Corporate, compliance, contracts, IP. Templates and executed versions in one place.',
    groups: ['Corporate', 'Compliance', 'Contracts', 'IP'],
    docs: LEGAL_DOCS,
    files: LEGAL_FILES,
    searchPlaceholder: 'Search legal — title, tag, type…',
  },
};

function mergeDocs(mode: Mode, apiDocs: DocSummary[]): Doc[] {
  // The existing card components expect the frontend Doc shape; map API records into it.
  // Only docs whose root matches the current mode show up here.
  return apiDocs
    .filter((d) => d.root === mode)
    .map((d) => ({
      id: d.id,
      product: d.product ?? undefined,
      group: d.group ?? undefined,
      title: d.title,
      updated: d.updated ?? 'today',
      by: ((d.updatedBy ?? d.createdBy) as Doc['by']) ?? 'D',
      size: d.size ?? '',
      tags: d.tags ?? [],
    }));
}

export function DocsView({ mode = 'product' }: { mode?: Mode }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [previewing, setPreviewing] = useState<FileEntry | null>(null);
  const [query, setQuery] = useState('');
  const [tabs, setTabs] = useState<Record<string, TabId>>({});
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');

  const getTab = (key: string): TabId => tabs[key] || 'all';
  const setTab = (key: string, v: TabId) => setTabs((t) => ({ ...t, [key]: v }));

  // Pull docs from the API — merge with seed to keep classic grouping while any newly-created ones show up immediately.
  const treeQ = useDocsTree(mode);
  const apiDocs = treeQ.data ?? [];
  const mergedDocs = useMemo(() => mergeDocs(mode, apiDocs), [mode, apiDocs]);
  const createDoc = useCreateDoc();

  // Editor now renders as a right-edge drawer; we still mount the docs list behind it.

  const q = query.trim().toLowerCase();
  const match = (item: Doc | FileEntry, pLabel?: string) => {
    if (!q) return true;
    const hay = [
      item.title,
      (item.tags || []).join(' '),
      ('ext' in item ? item.ext : ''),
      (item.group || ''),
      pLabel || '',
    ].join(' ').toLowerCase();
    return hay.includes(q);
  };

  const cfg = mode !== 'product' ? BUSINESS_CONFIG[mode] : null;
  const placeholder = cfg?.searchPlaceholder ?? 'Search all docs + files — title, tag, type…';

  const headerRight = (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px',
        height: 34, border: '1px solid var(--border-default)', borderRadius: 6,
        background: 'var(--bg-surface)', minWidth: 260,
      }}>
        <Icon name="search" size={13} color="var(--fg-3)" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          style={{ flex: 1, border: 0, outline: 'none', fontFamily: 'var(--font-primary)', fontSize: 13, background: 'transparent', color: 'var(--fg-1)' }}
        />
        {query && (
          <button onClick={() => setQuery('')} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--fg-3)', padding: 2, display: 'flex' }}>
            <Icon name="x" size={12} />
          </button>
        )}
      </div>
      <div style={{ display: 'inline-flex', border: '1px solid var(--border-default)', borderRadius: 6, padding: 2, background: 'var(--bg-surface)' }}>
        {(['grid', 'list'] as const).map((v) => (
          <button key={v} onClick={() => setLayout(v)} title={v === 'grid' ? 'Grid view' : 'List view'} style={{
            border: 0,
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: 4,
            background: layout === v ? 'var(--bg-sunken)' : 'transparent',
            color: layout === v ? 'var(--fg-1)' : 'var(--fg-3)',
            display: 'flex',
            alignItems: 'center',
          }}>
            <Icon name={v === 'grid' ? 'grid' : 'list'} size={14} />
          </button>
        ))}
      </div>
      <button className="btn btn-ghost"><Icon name="upload" size={14} /> Upload</button>
      <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" size={14} /> New</button>
    </>
  );

  if (cfg) {
    const totalDocs = mergedDocs.filter((d) => match(d)).length;
    const totalFiles = cfg.files.filter((f) => match(f)).length;

    return (
      <div className="screen-enter">
        <PageHeader title={cfg.title} sub={cfg.sub} right={headerRight} />
        {q && <SearchSummary totalDocs={totalDocs} totalFiles={totalFiles} />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {cfg.groups.map((g) => {
            const gdocs = mergedDocs.filter((d) => d.group === g && match(d));
            const gfiles = cfg.files.filter((f) => f.group === g && match(f));
            if (!gdocs.length && !gfiles.length) return null;
            const tab = getTab(g);
            return (
              <GroupSection key={g} title={g} tab={tab} onTab={(v) => setTab(g, v)} docCount={gdocs.length} fileCount={gfiles.length}>
                {layout === 'list' ? (
                  <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-surface)' }}>
                    <DocListHeader />
                    {(tab === 'all' || tab === 'pages') && gdocs.map((d) => <DocListRow key={d.id} item={d} kind="doc" onClick={() => setEditingId(d.id)} />)}
                    {(tab === 'all' || tab === 'files') && gfiles.map((f) => <DocListRow key={f.id} item={f} kind="file" onClick={() => setPreviewing(f)} />)}
                  </div>
                ) : (
                  <>
                    {(tab === 'all' || tab === 'pages') && gdocs.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 10 }}>
                        {gdocs.map((d) => <DocCard key={d.id} d={d} onClick={() => setEditingId(d.id)} />)}
                      </div>
                    )}
                    {(tab === 'all' || tab === 'files') && gfiles.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 10, marginTop: gdocs.length && tab === 'all' ? 12 : 0 }}>
                        {gfiles.map((f) => <FileCard key={f.id} f={f} onClick={() => setPreviewing(f)} />)}
                      </div>
                    )}
                  </>
                )}
              </GroupSection>
            );
          })}
        </div>
        {previewing && <FilePreview f={previewing} onClose={() => setPreviewing(null)} />}
        {creating && (
          <NewDocDialog
            mode={mode}
            onClose={() => setCreating(false)}
            onCreate={(body) => createDoc.mutate(body, {
              onSuccess: (created) => {
                setCreating(false);
                setEditingId(created.id);
              },
            })}
          />
        )}
        {editingId && <DocEditor docId={editingId} onClose={() => setEditingId(null)} />}
      </div>
    );
  }

  const totalDocs = mergedDocs.filter((d) => match(d, PRODUCTS.find((p) => p.id === d.product)?.label)).length;
  const totalFiles = PRODUCT_FILES.filter((f) => match(f, PRODUCTS.find((p) => p.id === f.product)?.label)).length;

  return (
    <div className="screen-enter">
      <PageHeader
        title="Documentation"
        sub="One space per product. Pages, sheets, decks, PDFs — all searchable in one place."
        right={headerRight}
      />
      {q && <SearchSummary totalDocs={totalDocs} totalFiles={totalFiles} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {PRODUCTS.map((p) => {
          const pdocs = mergedDocs.filter((d) => d.product === p.id && match(d, p.label));
          const pfiles = PRODUCT_FILES.filter((f) => f.product === p.id && match(f, p.label));
          if (!pdocs.length && !pfiles.length) return null;
          const tab = getTab(p.id);
          const title = (
            <>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: p.color, display: 'inline-block', marginRight: 10, verticalAlign: 'middle' }} />
              {p.label}
            </>
          );
          return (
            <GroupSection key={p.id} title={title} tab={tab} onTab={(v) => setTab(p.id, v)} docCount={pdocs.length} fileCount={pfiles.length}>
              {layout === 'list' ? (
                <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-surface)' }}>
                  <DocListHeader />
                  {(tab === 'all' || tab === 'pages') && pdocs.map((d) => <DocListRow key={d.id} item={d} kind="doc" product={p.id} onClick={() => setEditingId(d.id)} />)}
                  {(tab === 'all' || tab === 'files') && pfiles.map((f) => <DocListRow key={f.id} item={f} kind="file" product={p.id} onClick={() => setPreviewing({ ...f, product: p.id })} />)}
                </div>
              ) : (
                <>
                  {(tab === 'all' || tab === 'pages') && pdocs.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 10 }}>
                      {pdocs.map((d) => <DocCard key={d.id} d={d} product={p.id} onClick={() => setEditingId(d.id)} />)}
                    </div>
                  )}
                  {(tab === 'all' || tab === 'files') && pfiles.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 10, marginTop: pdocs.length && tab === 'all' ? 12 : 0 }}>
                      {pfiles.map((f) => <FileCard key={f.id} f={{ ...f, product: p.id }} onClick={() => setPreviewing({ ...f, product: p.id })} />)}
                    </div>
                  )}
                </>
              )}
            </GroupSection>
          );
        })}
      </div>
      {previewing && <FilePreview f={previewing} onClose={() => setPreviewing(null)} />}
      {creating && (
        <NewDocDialog
          mode={mode}
          onClose={() => setCreating(false)}
          onCreate={(body) => createDoc.mutate(body, {
            onSuccess: (created) => {
              setCreating(false);
              setEditingId(created.id);
            },
          })}
        />
      )}
      {editingId && <DocEditor docId={editingId} onClose={() => setEditingId(null)} />}
    </div>
  );
}

function GroupSection({
  title, tab, onTab, docCount, fileCount, children,
}: {
  title: React.ReactNode;
  tab: TabId;
  onTab: (v: TabId) => void;
  docCount: number;
  fileCount: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="section-h" style={{ alignItems: 'center' }}>
        <h2 style={{ display: 'flex', alignItems: 'center' }}>{title}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <DocsTabs tab={tab} onTab={onTab} docCount={docCount} fileCount={fileCount} />
          <span className="meta" style={{ fontSize: 10 }}>{docCount + fileCount} items</span>
        </div>
      </div>
      {children}
    </div>
  );
}

function DocsTabs({ tab, onTab, docCount, fileCount }: { tab: TabId; onTab: (v: TabId) => void; docCount: number; fileCount: number }) {
  const opts: { id: TabId; label: string; n: number }[] = [
    { id: 'all', label: 'All', n: docCount + fileCount },
    { id: 'pages', label: 'Pages', n: docCount },
    { id: 'files', label: 'Files', n: fileCount },
  ];
  return (
    <div style={{ display: 'inline-flex', background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 2 }}>
      {opts.map((o) => {
        const active = tab === o.id;
        return (
          <button key={o.id} onClick={() => onTab(o.id)} style={{
            border: 0, cursor: 'pointer',
            background: active ? 'var(--bg-surface)' : 'transparent',
            boxShadow: active ? '0 1px 2px rgba(0,0,0,0.2)' : 'none',
            color: active ? 'var(--fg-1)' : 'var(--fg-3)',
            fontFamily: 'var(--font-primary)',
            fontSize: 12,
            fontWeight: active ? 500 : 400,
            padding: '4px 10px',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            {o.label}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)' }}>{o.n}</span>
          </button>
        );
      })}
    </div>
  );
}

function SearchSummary({ totalDocs, totalFiles }: { totalDocs: number; totalFiles: number }) {
  return (
    <div style={{
      marginBottom: 20,
      padding: '10px 14px',
      border: '1px solid var(--border-subtle)',
      borderRadius: 6,
      background: 'var(--path-primary-tint)',
      color: 'var(--path-primary-ink)',
      fontSize: 12.5,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
    }}>
      <Icon name="search" size={14} color="var(--path-primary-ink)" />
      <span>{totalDocs + totalFiles} results — <b>{totalDocs}</b> pages · <b>{totalFiles}</b> files</span>
    </div>
  );
}

export const FILE_TYPE: Record<string, { label: string; bg: string; fg: string; sub: string }> = {
  xlsx: { label: 'XLSX', bg: '#E7F5EA', fg: '#1E7D32', sub: 'Excel' },
  docx: { label: 'DOCX', bg: '#E5EDFB', fg: '#1E51B8', sub: 'Word' },
  pptx: { label: 'PPTX', bg: '#FBE9E2', fg: '#B14318', sub: 'PowerPoint' },
  pdf: { label: 'PDF', bg: '#FBE4E4', fg: '#B02626', sub: 'PDF' },
  fig: { label: 'FIG', bg: '#F0EAFB', fg: '#5A2EB8', sub: 'Figma' },
  png: { label: 'PNG', bg: '#F1F3F5', fg: '#46555E', sub: 'Image' },
  jpg: { label: 'JPG', bg: '#F1F3F5', fg: '#46555E', sub: 'Image' },
  csv: { label: 'CSV', bg: '#E7F5EA', fg: '#1E7D32', sub: 'Data' },
  zip: { label: 'ZIP', bg: '#EEEEF0', fg: '#454745', sub: 'Archive' },
};
export function fileMeta(ext: string) { return FILE_TYPE[ext] || { label: (ext || 'FILE').toUpperCase(), bg: '#F1F3F5', fg: '#46555E', sub: 'File' }; }
export function humanBytes(b: number): string {
  if (b == null) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileBadge({ ext, size = 36 }: { ext: string; size?: number }) {
  const m = fileMeta(ext);
  return (
    <div style={{
      width: size,
      height: size * 0.78,
      borderRadius: 4,
      background: m.bg,
      color: m.fg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-mono)',
      fontWeight: 600,
      fontSize: size * 0.28,
      letterSpacing: 0.3,
      flexShrink: 0,
    }}>{m.label}</div>
  );
}

function DocCard({ d, product, onClick }: { d: Doc; product?: string; onClick: () => void }) {
  const p = product ? PRODUCTS.find((x) => x.id === product) : null;
  return (
    <div className="row-hover" onClick={onClick} style={{
      padding: '14px 16px',
      border: '1px solid var(--border-subtle)',
      borderRadius: 8,
      background: 'var(--bg-surface)',
      cursor: 'pointer',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name={d.size === 'sheet' ? 'sheet' : d.size === 'deck' ? 'file' : 'docs'} size={16} color="var(--fg-3)" />
        <span style={{ fontSize: 13.5, color: 'var(--fg-1)', fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {p && <span className="tag" style={{ color: p.color }}><span className="tag-dot" style={{ background: p.color }} />{p.label}</span>}
        {d.group && <span className="tag" style={{ color: 'var(--fg-3)' }}>{d.group}</span>}
        {(d.tags || []).slice(0, 2).map((t) => <span key={t} className="tag" style={{ color: 'var(--fg-3)' }}>#{t}</span>)}
        <span className="meta" style={{ fontSize: 10, marginLeft: 'auto' }}>{d.size} · {d.updated}</span>
        <Avatar who={d.by} size={20} />
      </div>
    </div>
  );
}

function FileCard({ f, onClick }: { f: FileEntry; onClick: () => void }) {
  const p = f.product ? PRODUCTS.find((x) => x.id === f.product) : null;
  return (
    <div className="row-hover" onClick={onClick} style={{
      padding: '12px 14px',
      border: '1px solid var(--border-subtle)',
      borderRadius: 8,
      background: 'var(--bg-surface)',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      <FileBadge ext={f.ext} size={38} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: 'var(--fg-1)', fontWeight: 500, lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5, flexWrap: 'wrap' }}>
          {p && <span className="tag" style={{ color: p.color }}><span className="tag-dot" style={{ background: p.color }} />{p.label}</span>}
          {f.group && <span className="tag" style={{ color: 'var(--fg-3)' }}>{f.group}</span>}
          <span className="meta" style={{ fontSize: 10 }}>{f.version ? `${f.version} · ` : ''}{humanBytes(f.bytes)} · {f.updated}</span>
        </div>
      </div>
      <Avatar who={f.by} size={22} />
    </div>
  );
}

function DocListRow({ item, kind, product, onClick }: { item: Doc | FileEntry; kind: 'doc' | 'file'; product?: string; onClick: () => void }) {
  const p = product ? PRODUCTS.find((x) => x.id === product) : null;
  const sizeLabel = kind === 'doc'
    ? (item as Doc).size
    : `${(item as FileEntry).version ?? ''}${(item as FileEntry).version ? ' · ' : ''}${humanBytes((item as FileEntry).bytes)}`;
  const icon = kind === 'doc' ? (((item as Doc).size === 'sheet') ? 'sheet' : 'file') : null;
  return (
    <div className="row-hover" onClick={onClick} style={{
      display: 'grid', gridTemplateColumns: '24px 1fr 140px 120px 110px 32px',
      alignItems: 'center', gap: 14,
      padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)',
      background: 'var(--bg-surface)', cursor: 'pointer',
    }}>
      {kind === 'doc' && icon
        ? <Icon name={icon as any} size={16} color="var(--fg-3)" />
        : <FileBadge ext={(item as FileEntry).ext} size={22} />}
      <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13.5, color: 'var(--fg-1)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
        {p && <span className="tag" style={{ color: p.color }}><span className="tag-dot" style={{ background: p.color }} />{p.label}</span>}
        {item.group && <span className="tag" style={{ color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>{item.group}</span>}
      </div>
      <span className="meta" style={{ fontSize: 10 }}>{sizeLabel}</span>
      <span className="meta" style={{ fontSize: 10 }}>Edited {item.updated}</span>
      <Avatar who={item.by} size={22} />
    </div>
  );
}

function DocListHeader() {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '24px 1fr 140px 120px 110px 32px',
      alignItems: 'center', gap: 14,
      padding: '8px 14px', borderBottom: '1px solid var(--border-default)',
      background: 'var(--bg-sunken)',
      fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 0.4,
      color: 'var(--fg-3)', textTransform: 'uppercase',
    }}>
      <span />
      <span>Name</span>
      <span>Tags</span>
      <span>Type</span>
      <span>Edited</span>
      <span />
    </div>
  );
}

function FilePreview({ f, onClose }: { f: FileEntry; onClose: () => void }) {
  const m = fileMeta(f.ext);
  const p = f.product ? PRODUCTS.find((x) => x.id === f.product) : null;
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,26,0.55)',
      zIndex: 60, display: 'flex', justifyContent: 'flex-end',
      animation: 'fadeIn 120ms ease',
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 460, maxWidth: '90vw', height: '100%',
        background: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border-default)',
        display: 'flex', flexDirection: 'column',
        animation: 'slideIn 180ms cubic-bezier(.2,.8,.2,1)',
      }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <FileBadge ext={f.ext} size={28} />
          <div style={{ flex: 1, fontSize: 12, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {m.sub} file{f.version ? ` · ${f.version}` : ''}
          </div>
          <button className="btn btn-subtle btn-icon" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <div style={{ padding: '22px 24px', flex: 1, overflow: 'auto' }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg-1)', margin: 0, lineHeight: 1.3, letterSpacing: '-0.01em' }}>{f.title}</h2>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {p && <span className="tag" style={{ color: p.color }}><span className="tag-dot" style={{ background: p.color }} />{p.label}</span>}
            {f.group && <span className="tag" style={{ color: 'var(--fg-3)' }}>{f.group}</span>}
            {(f.tags || []).map((t) => <span key={t} className="tag" style={{ color: 'var(--fg-2)' }}>#{t}</span>)}
          </div>
          <div style={{
            marginTop: 18, aspectRatio: '4/3', borderRadius: 8, border: '1px solid var(--border-subtle)',
            background: `linear-gradient(180deg, ${m.bg}, var(--bg-surface) 70%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 10,
          }}>
            <FileBadge ext={f.ext} size={72} />
            <div className="meta" style={{ fontSize: 11 }}>Preview — open to see the full file</div>
          </div>
          <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 10, columnGap: 16, fontSize: 12.5 }}>
            <div className="meta" style={{ fontSize: 10 }}>Uploaded by</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Avatar who={f.by} size={18} /> <span style={{ color: 'var(--fg-1)' }}>{f.by === 'D' ? 'Dave' : 'Raj'}</span></div>
            <div className="meta" style={{ fontSize: 10 }}>Last edited</div>
            <div style={{ color: 'var(--fg-1)' }}>{f.updated}</div>
            <div className="meta" style={{ fontSize: 10 }}>Size</div>
            <div style={{ color: 'var(--fg-1)' }}>{humanBytes(f.bytes)}</div>
          </div>
        </div>
        <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8 }}>
          <button className="btn btn-primary"><Icon name="download" size={12} /> Download</button>
          <button className="btn btn-ghost">Open in app</button>
        </div>
      </div>
    </div>
  );
}

function DocReader({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  const content = DOC_CONTENT[doc.id];
  return (
    <div className="screen-enter">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <button className="btn btn-subtle" onClick={onClose}><Icon name="chevron-left" size={14} /> Back</button>
        <div className="meta" style={{ fontSize: 10 }}>{doc.group ?? PRODUCTS.find((p) => p.id === doc.product)?.label}</div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost"><Icon name="edit" size={13} /> Edit</button>
      </div>
      <article className="prose" style={{ margin: '0 auto' }}>
        <h1>{doc.title}</h1>
        {content
          ? content.blocks.map((b, i) => renderBlock(b, i))
          : <p style={{ color: 'var(--fg-3)' }}>No content yet. This doc is a stub — click Edit to start writing.</p>}
      </article>
    </div>
  );
}

export function renderBlock(b: DocBlock, i: number) {
  switch (b.type) {
    case 'h1': return <h1 key={i}>{b.text}</h1>;
    case 'h2': return <h2 key={i}>{b.text}</h2>;
    case 'h3': return <h3 key={i}>{b.text}</h3>;
    case 'p': return <p key={i}>{b.text}</p>;
    case 'ul': return (
      <ul key={i}>
        {b.items.map((x, j) => (
          <li key={j}>
            {x}
            {b.itemsChildren?.[j] ? renderBlock(b.itemsChildren[j] as DocBlock, j) : null}
          </li>
        ))}
      </ul>
    );
    case 'ol': return (
      <ol key={i}>
        {b.items.map((x, j) => (
          <li key={j}>
            {x}
            {b.itemsChildren?.[j] ? renderBlock(b.itemsChildren[j] as DocBlock, j) : null}
          </li>
        ))}
      </ol>
    );
    case 'todo': return (
      <ul key={i} data-type="taskList">
        {b.items.map((it, j) => (
          <li key={j} data-checked={it.checked ? 'true' : 'false'}>
            <label><input type="checkbox" checked={!!it.checked} readOnly /></label>
            <div>
              {it.text}
              {b.itemsChildren?.[j] ? renderBlock(b.itemsChildren[j] as DocBlock, j) : null}
            </div>
          </li>
        ))}
      </ul>
    );
    case 'quote': return <blockquote key={i}>{b.text}</blockquote>;
    case 'code': return <pre key={i}><code>{b.text}</code></pre>;
    case 'divider': return <hr key={i} />;
    case 'callout': return (
      <div key={i} className={`callout callout--${b.tone}`}>
        <Icon name={b.tone === 'warn' ? 'flag' : 'sparkle'} size={16} />
        <span>{b.text}</span>
      </div>
    );
    case 'file': return (
      <div key={i} className="file-embed">
        <FileBadge ext={b.ext} size={32} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-1)' }}>{b.name}</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{b.ext.toUpperCase()} · {humanBytes(b.bytes)}</div>
        </div>
        <button className="btn btn-ghost"><Icon name="arrow-up-right" size={13} /> Open</button>
      </div>
    );
    case 'table': return (
      <table key={i}>
        <thead><tr>{b.columns.map((c, j) => <th key={j}>{c}</th>)}</tr></thead>
        <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody>
      </table>
    );
    default: return null;
  }
}

// ─── New Doc dialog ────────────────────────────────────────────────────────

function NewDocDialog({ mode, onClose, onCreate }: {
  mode: Mode;
  onClose: () => void;
  onCreate: (body: { title: string; root: Mode; product?: string | null; group?: string | null }) => void;
}) {
  const [title, setTitle] = useState('');
  const [product, setProduct] = useState<string>(mode === 'product' ? PRODUCTS[0]?.id ?? '' : '');
  const cfg = mode !== 'product' ? BUSINESS_CONFIG[mode] : null;
  const [group, setGroup] = useState<string>(cfg?.groups[0] ?? '');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onCreate({
      title: title.trim(),
      root: mode,
      product: mode === 'product' ? product : null,
      group: mode === 'product' ? null : group,
    });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,26,0.55)' }} />
      <form onSubmit={submit} style={{
        position: 'relative',
        width: 440,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 10,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        boxShadow: 'var(--shadow-3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--fg-1)' }}>New doc</h2>
          <button type="button" onClick={onClose} className="btn btn-subtle btn-icon"><Icon name="close" size={14} /></button>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Title</span>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="input" style={{ height: 34 }} placeholder="e.g. Onboarding KPIs" />
        </label>

        {mode === 'product' ? (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Product</span>
            <Dropdown<string>
              value={product}
              onChange={setProduct}
              options={PRODUCTS.map((p) => ({ value: p.id, label: p.label }))}
              ariaLabel="Product"
            />
          </label>
        ) : cfg && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Group</span>
            <Dropdown<string>
              value={group}
              onChange={setGroup}
              options={cfg.groups.map((g) => ({ value: g, label: g }))}
              ariaLabel="Group"
            />
          </label>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!title.trim()}>Create and open</button>
        </div>
      </form>
    </div>
  );
}
