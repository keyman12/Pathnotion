import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Avatar } from '../components/primitives';
import { Icon } from '../components/Icon';
import { Dropdown } from '../components/Dropdown';
import {
  AttachIconButton,
  AttachPickerDrawer,
  AttachmentChipRow,
  AttachmentViewerDrawer,
} from '../components/Attachments';
import type { Attachment, BacklogItem, FounderKey, Stage } from '../lib/types';
import { useBacklog, useCreateBacklog, useDeleteBacklog, usePatchBacklog, useProducts } from '../lib/queries';
import { useSession } from '../lib/useSession';
import { useUI } from '../lib/store';

type Layout = 'kanban' | 'lanes' | 'list';
type OwnerFilter = 'global' | 'mine' | 'raj' | 'flagged';

const STAGES: { id: Stage; label: string; note: string; color: string }[] = [
  { id: 'now', label: 'Now', note: 'In-flight this week', color: '#B42318' },
  { id: 'next', label: 'Next', note: 'Up after Now', color: '#B54708' },
  { id: 'later', label: 'Later', note: 'Parked — ideas & roadmap', color: '#037847' },
];

export function BacklogView({ productFilter }: { productFilter?: string | null }) {
  const [layout, setLayout] = useState<Layout>('kanban');
  const [tab, setTab] = useState<OwnerFilter>('global');
  const [query, setQuery] = useState('');
  const focusBacklogId = useUI((s) => s.focusBacklogId);
  const clearBacklogFocus = useUI((s) => s.clearBacklogFocus);
  const [expandedId, setExpandedId] = useState<string | null>(focusBacklogId);
  const [showNew, setShowNew] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const session = useSession();
  const me: FounderKey = (session.data?.key as FounderKey) ?? 'D';

  // When another view (e.g. Week) navigates here with a focus id, expand that item and clear the hint.
  useEffect(() => {
    if (focusBacklogId) {
      setExpandedId(focusBacklogId);
      clearBacklogFocus();
    }
  }, [focusBacklogId, clearBacklogFocus]);

  const backlogQ = useBacklog();
  const productsQ = useProducts();
  const createBacklog = useCreateBacklog();
  const patchBacklog = usePatchBacklog();
  const deleteBacklog = useDeleteBacklog();

  const items = backlogQ.data ?? [];
  const products = productsQ.data ?? [];

  const patch = (id: string, p: Partial<BacklogItem>) => patchBacklog.mutate({ id, patch: p });
  const remove = (id: string) => {
    deleteBacklog.mutate(id);
    setExpandedId(null);
  };

  const filtered = useMemo(() => items.filter((b) => {
    const isDone = !!b.completedAt;
    if (isDone && !showCompleted) return false;
    if (productFilter && b.product !== productFilter) return false;
    if (tab === 'mine' && b.owner !== me) return false;
    if (tab === 'raj' && b.owner === me) return false;
    if (tab === 'flagged') {
      const flag = computeFlag(toIsoDate(b.due), isDone);
      if (!flag) return false;
    }
    if (query) {
      const hay = `${b.title}${b.id}${b.note ?? ''}`.toLowerCase();
      if (!hay.includes(query.toLowerCase())) return false;
    }
    return true;
  }), [items, productFilter, tab, query, me, showCompleted]);

  const completedCount = items.filter((i) => i.completedAt).length;

  const counts = {
    now: filtered.filter((i) => i.stage === 'now').length,
    next: filtered.filter((i) => i.stage === 'next').length,
    later: filtered.filter((i) => i.stage === 'later').length,
  };

  const currentProduct = productFilter ? products.find((p) => p.id === productFilter) : null;

  const sub = currentProduct
    ? <>One product. Now <b style={{ color: 'var(--fg-2)' }}>{counts.now}</b>, Next {counts.next}, Later {counts.later}. Drag to reorder.</>
    : <>Product-led priorities across all products. Now <b style={{ color: 'var(--fg-2)' }}>{counts.now}</b>, Next {counts.next}, Later {counts.later}.</>;

  const tabs = !productFilter ? [
    { id: 'global' as const, label: 'All products', count: items.length },
    { id: 'mine' as const, label: 'Mine', count: items.filter((i) => i.owner === me).length },
    { id: 'raj' as const, label: me === 'D' ? "Raj's" : "Dave's", count: items.filter((i) => i.owner !== me).length },
    { id: 'flagged' as const, label: 'Flagged', count: items.filter((i) => i.flag).length },
  ] : null;

  return (
    <div className="screen-enter">
      <PageHeader
        title={currentProduct ? `${currentProduct.label} backlog` : 'Backlog'}
        sub={sub}
        actions={
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', height: 34, border: '1px solid var(--border-default)', borderRadius: 6, background: 'var(--bg-surface)' }}>
              <Icon name="search" size={13} color="var(--fg-3)" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter"
                style={{ border: 0, outline: 'none', fontFamily: 'var(--font-primary)', fontSize: 13, width: 140, color: 'var(--fg-1)', background: 'transparent' }}
              />
            </div>
            <button
              className="btn btn-ghost"
              onClick={() => setShowCompleted((v) => !v)}
              title={showCompleted ? 'Hide completed' : 'Show completed'}
            >
              <Icon name={showCompleted ? 'eye' : 'check'} size={14} />
              {showCompleted ? `Hide done${completedCount ? ` (${completedCount})` : ''}` : `Show done${completedCount ? ` (${completedCount})` : ''}`}
            </button>
            <div className="btngroup">
              <IconToggle on={layout === 'kanban'} onClick={() => setLayout('kanban')} label="Kanban" icon="grid" />
              <IconToggle on={layout === 'lanes'} onClick={() => setLayout('lanes')} label="Lanes" icon="table" />
              <IconToggle on={layout === 'list'} onClick={() => setLayout('list')} label="List" icon="list" />
            </div>
            <button className="btn btn-primary" onClick={() => setShowNew(true)}><Icon name="plus" size={14} /> Add item</button>
          </>
        }
        tabs={tabs ? <BacklogTabs value={tab} onChange={setTab} tabs={tabs} /> : undefined}
      />

      {layout === 'kanban' && <BacklogKanban items={filtered} products={products} productFilter={productFilter ?? null} expandedId={expandedId} onToggle={(id) => setExpandedId((c) => c === id ? null : id)} onPatch={patch} onDelete={remove} />}
      {layout === 'lanes' && <BacklogLanes items={filtered} products={products} expandedId={expandedId} onToggle={(id) => setExpandedId((c) => c === id ? null : id)} onPatch={patch} onDelete={remove} />}
      {layout === 'list' && <BacklogList items={filtered} products={products} expandedId={expandedId} onToggle={(id) => setExpandedId((c) => c === id ? null : id)} onPatch={patch} onDelete={remove} />}

      {showNew && (
        <NewItemDialog
          defaultProduct={productFilter ?? (products[0]?.id ?? '')}
          defaultOwner={me}
          products={products}
          existingIds={items.map((i) => i.id)}
          onClose={() => setShowNew(false)}
          onCreate={(body) => createBacklog.mutate(body, { onSuccess: () => setShowNew(false) })}
        />
      )}
    </div>
  );
}

function BacklogTabs({ value, onChange, tabs }: { value: OwnerFilter; onChange: (v: OwnerFilter) => void; tabs: { id: OwnerFilter; label: string; count?: number }[] }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', gap: 16 }}>
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button key={t.id} onClick={() => onChange(t.id)}
            style={{
              padding: '10px 2px',
              marginBottom: -1,
              color: active ? 'var(--fg-1)' : 'var(--fg-3)',
              borderBottom: `2px solid ${active ? 'var(--path-primary)' : 'transparent'}`,
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}>
            {t.label}
            {typeof t.count === 'number' && <span className="meta" style={{ fontSize: 10 }}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

type Product = { id: string; label: string; color: string; accent?: string; count?: number };

interface LayoutProps {
  items: BacklogItem[];
  products: Product[];
  expandedId: string | null;
  onToggle: (id: string) => void;
  onPatch: (id: string, patch: Partial<BacklogItem>) => void;
  onDelete: (id: string) => void;
}

function BacklogKanban({ items, products, productFilter, expandedId, onToggle, onPatch, onDelete }: LayoutProps & { productFilter: string | null }) {
  const prods = productFilter ? products.filter((p) => p.id === productFilter) : products;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '200px repeat(3, minmax(260px, 1fr))',
      border: '1px solid var(--border-subtle)',
      borderRadius: 8,
      background: 'var(--bg-surface)',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-sunken)' }}>
        <span className="meta" style={{ fontSize: 10 }}>Product</span>
      </div>
      {STAGES.map((s) => (
        <div key={s.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', borderLeft: '1px solid var(--border-subtle)', background: 'var(--bg-sunken)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg-1)' }}>{s.label}</span>
          <span className="meta" style={{ fontSize: 10, marginLeft: 4 }}>{items.filter((i) => i.stage === s.id).length}</span>
        </div>
      ))}
      {prods.map((p) => (
        <ProductRow key={p.id} product={p} items={items} products={products} expandedId={expandedId} onToggle={onToggle} onPatch={onPatch} onDelete={onDelete} />
      ))}
    </div>
  );
}

function ProductRow({ product, items, products, expandedId, onToggle, onPatch, onDelete }: { product: Product } & LayoutProps) {
  const rowItems = items.filter((i) => i.product === product.id);
  return (
    <>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--bg-sunken)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: product.color }} />
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-1)' }}>{product.label}</span>
        </div>
        <span className="meta" style={{ fontSize: 10 }}>{rowItems.length} items</span>
      </div>
      {STAGES.map((s) => {
        const cell = rowItems.filter((i) => i.stage === s.id);
        return (
          <div key={s.id} style={{
            padding: 10,
            borderBottom: '1px solid var(--border-subtle)',
            borderLeft: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minHeight: 90,
          }}>
            {cell.length === 0
              ? <div style={{ fontSize: 11, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', padding: '8px 4px' }}>—</div>
              : cell.map((i) => (
                  expandedId === i.id
                    ? <InlineEditor key={i.id} item={i} products={products} onCollapse={() => onToggle(i.id)} onPatch={(patch) => onPatch(i.id, patch)} onDelete={() => onDelete(i.id)} density="compact" />
                    : <KanbanCell key={i.id} item={i} product={product} onClick={() => onToggle(i.id)} />
                ))}
          </div>
        );
      })}
    </>
  );
}

function KanbanCell({ item, product, onClick }: { item: BacklogItem; product: Product; onClick: () => void }) {
  const isCompleted = !!item.completedAt;
  const attachmentCount = item.attachments?.length ?? 0;
  const flag = computeFlag(toIsoDate(item.due), isCompleted);
  return (
    <div className="row-hover" onClick={onClick} style={{
      position: 'relative',
      padding: '8px 10px 8px 12px',
      border: '1px solid var(--border-subtle)',
      borderRadius: 6,
      background: 'var(--bg-surface)',
      cursor: 'pointer',
      opacity: isCompleted ? 0.6 : 1,
    }}>
      <span style={{ position: 'absolute', left: 0, top: 4, bottom: 4, width: 2, background: product.color, borderRadius: '0 2px 2px 0' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--fg-4)' }}>{item.id}</span>
        {flag === 'overdue' && <span className="chip chip-overdue" style={{ fontSize: 9.5, padding: '1px 6px' }}>Overdue</span>}
        {flag === 'due-soon' && <span className="chip chip-due" style={{ fontSize: 9.5, padding: '1px 6px' }}>Due soon</span>}
        {isCompleted && <span className="chip chip-later" style={{ fontSize: 9.5, padding: '1px 6px' }}>Done</span>}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--fg-1)', fontWeight: 500, lineHeight: 1.35, textDecoration: isCompleted ? 'line-through' : 'none' }}>{item.title}</div>
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
          {item.due && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: flag === 'overdue' ? 'var(--danger-fg)' : 'var(--fg-4)' }}>{formatDue(item.due)}</span>
          )}
          {(item.progress ?? 0) > 0 && <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-4)' }}>{item.progress ?? 0}%</span>}
          {item.effortDays != null && <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-4)' }}>{item.effortDays}d</span>}
          <Avatar who={item.owner} size={18} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {attachmentCount > 0 && (
            <span className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 9.5, color: 'var(--fg-4)' }}>
              <Icon name="paperclip" size={10} /> {attachmentCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDue(s: string | null | undefined): string {
  if (!s) return '';
  // Render ISO as "22 Apr 2026" for card display
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return s;
}

function BacklogLanes({ items, products, expandedId, onToggle, onPatch, onDelete }: LayoutProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
      {STAGES.map((s) => {
        const col = items.filter((i) => i.stage === s.id);
        return (
          <div key={s.id} style={{ background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px 10px' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-1)' }}>{s.label}</span>
              <span className="meta" style={{ fontSize: 10 }}>{col.length}</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>{s.note}</span>
            </div>
            {col.map((i) => (
              expandedId === i.id
                ? <InlineEditor key={i.id} item={i} products={products} onCollapse={() => onToggle(i.id)} onPatch={(patch) => onPatch(i.id, patch)} onDelete={() => onDelete(i.id)} density="compact" />
                : <BacklogRow key={i.id} item={i} products={products} onClick={() => onToggle(i.id)} compact />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function BacklogList({ items, products, expandedId, onToggle, onPatch, onDelete }: LayoutProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((i) => (
        expandedId === i.id
          ? <InlineEditor key={i.id} item={i} products={products} onCollapse={() => onToggle(i.id)} onPatch={(patch) => onPatch(i.id, patch)} onDelete={() => onDelete(i.id)} density="roomy" />
          : <BacklogRow key={i.id} item={i} products={products} onClick={() => onToggle(i.id)} />
      ))}
    </div>
  );
}

function BacklogRow({ item, products, onClick, compact, showProduct = true }: { item: BacklogItem; products: Product[]; onClick?: () => void; compact?: boolean; showProduct?: boolean }) {
  const p = products.find((x) => x.id === item.product);
  const isCompleted = !!item.completedAt;
  const attachmentCount = item.attachments?.length ?? 0;
  const flag = computeFlag(toIsoDate(item.due), isCompleted);
  if (!p) return null;
  return (
    <div onClick={onClick} className="row-hover" style={{
      position: 'relative',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: compact ? '10px 12px 10px 14px' : '14px 16px 14px 18px',
      background: 'var(--bg-surface)',
      borderRadius: 6,
      border: '1px solid var(--border-subtle)',
      cursor: 'pointer',
      opacity: isCompleted ? 0.6 : 1,
    }}>
      <span style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 3, background: p.color, borderRadius: '0 3px 3px 0' }} />
      <Icon name="drag" size={14} color="var(--fg-4)" style={{ marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)', letterSpacing: '0.02em' }}>{item.id}</span>
          {showProduct && (
            <span className="tag" style={{ color: p.color }}>
              <span className="tag-dot" style={{ background: p.color }} />
              {p.label}
            </span>
          )}
          {item.due && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: flag === 'overdue' ? 'var(--danger-fg)' : 'var(--fg-4)' }}>
              · {formatDue(item.due)}
            </span>
          )}
          {item.effortDays != null && (
            <span className="mono" style={{ fontSize: 10, color: 'var(--fg-4)' }}>· {item.effortDays}d</span>
          )}
        </div>
        <div style={{ fontSize: 14, color: 'var(--fg-1)', fontWeight: 500, lineHeight: 1.35, textDecoration: isCompleted ? 'line-through' : 'none' }}>{item.title}</div>
        {item.note && !compact && (
          <div style={{ fontSize: 12.5, color: 'var(--fg-3)', marginTop: 3, lineHeight: 1.45 }}>{item.note}</div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {attachmentCount > 0 && (
          <span className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, color: 'var(--fg-4)' }}>
            <Icon name="paperclip" size={11} /> {attachmentCount}
          </span>
        )}
        {(item.progress ?? 0) > 0 && <span className="mono" style={{ fontSize: 10, color: 'var(--fg-4)' }}>{item.progress ?? 0}%</span>}
        {isCompleted ? (
          <span className="chip chip-later">Done</span>
        ) : (
          <StageChipInline stage={item.stage} flag={flag} />
        )}
        <Avatar who={item.owner} size={22} />
      </div>
    </div>
  );
}

// Inline editor — replaces the card when expanded. Auto-saves on change.
function InlineEditor({ item, products, onCollapse, onPatch, onDelete }: {
  item: BacklogItem;
  products: Product[];
  onCollapse: () => void;
  onPatch: (patch: Partial<BacklogItem>) => void;
  onDelete: () => void;
  density?: 'compact' | 'roomy'; // kept for call-site compatibility; layout is now always the same
}) {
  const p = products.find((x) => x.id === item.product);
  const attachments = item.attachments ?? [];

  // Local mirrors for text/number inputs so typing isn't interrupted by the patch round-trip — saved on blur.
  const [title, setTitle] = useState(item.title);
  const [note, setNote] = useState(item.note ?? '');
  const [dueIso, setDueIso] = useState<string>(toIsoDate(item.due));
  const [progressDraft, setProgressDraft] = useState<string>(String(item.progress ?? 0));
  const [effortDraft, setEffortDraft] = useState<string>(item.effortDays != null ? String(item.effortDays) : '');

  // Attachment UX: one drawer opens the picker (add new), another opens the viewer (click existing chip).
  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewing, setViewing] = useState<Attachment | null>(null);

  const flag = computeFlag(dueIso, !!item.completedAt);
  const isCompleted = !!item.completedAt;

  const addAttachment = (att: Attachment) => {
    const dup = attachments.some((a) => a.type === att.type && a.ref === att.ref);
    if (dup) return;
    onPatch({ attachments: [...attachments, att] });
  };

  const removeAttachment = (idx: number) => {
    const next = attachments.filter((_, i) => i !== idx);
    onPatch({ attachments: next });
  };

  const openAttachment = (att: Attachment) => {
    if (att.type === 'url') {
      window.open(att.ref, '_blank', 'noopener,noreferrer');
      return;
    }
    if (att.type === 'backlog') {
      // Jump to the linked backlog item with its editor open.
      useUI.getState().navigate('backlog', att.ref);
      return;
    }
    setViewing(att);
  };

  return (
    <div style={{
      position: 'relative',
      background: 'var(--bg-surface)',
      border: '1px solid var(--path-primary-light-2)',
      borderRadius: 8,
      boxShadow: 'var(--shadow-2)',
      overflow: 'hidden',
    }}>
      {p && <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: p.color }} />}
      {/* Header — click to collapse */}
      <button
        type="button"
        onClick={onCollapse}
        title="Click to close"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: '10px 12px 10px 18px',
          background: 'var(--bg-sunken)',
          border: 0,
          borderBottom: '1px solid var(--border-subtle)',
          cursor: 'pointer',
          textAlign: 'left',
          color: 'inherit',
        }}
      >
        <span style={{ fontSize: 14, color: 'var(--fg-1)', fontWeight: 500, flex: 1, textAlign: 'left', textDecoration: isCompleted ? 'line-through' : 'none', opacity: isCompleted ? 0.7 : 1 }}>
          {item.title}
        </span>
        <FlagOrStage flag={flag} stage={item.stage} />
        <Icon name="close" size={14} color="var(--fg-3)" />
      </button>

      {/* Body */}
      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FieldLabel label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { if (title.trim() && title !== item.title) onPatch({ title: title.trim() }); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="input"
            style={{ width: '100%', height: 36 }}
          />
        </FieldLabel>

        <FieldLabel label="Description">
          <div style={{ position: 'relative' }}>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => { if (note !== (item.note ?? '')) onPatch({ note: note || null }); }}
              className="input"
              style={{ width: '100%', minHeight: 96, padding: '10px 40px 10px 12px', fontSize: 13, lineHeight: 1.5, resize: 'vertical' }}
              placeholder="What's this about?"
            />
            <AttachIconButton onClick={() => setPickerOpen(true)} />
          </div>
          <AttachmentChipRow
            attachments={attachments}
            onOpen={openAttachment}
            onRemove={(_att, idx) => removeAttachment(idx)}
          />
        </FieldLabel>

        {/* Priority / Due / Progress / Effort — 4-column row, collapses gracefully on narrow containers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
          <FieldLabel label="Priority">
            <Dropdown<Stage>
              value={item.stage}
              onChange={(v) => onPatch({ stage: v })}
              options={[
                { value: 'now', label: 'Now' },
                { value: 'next', label: 'Next' },
                { value: 'later', label: 'Later' },
              ]}
              ariaLabel="Priority"
            />
          </FieldLabel>

          <FieldLabel label="Due date">
            <input
              type="date"
              value={dueIso}
              onChange={(e) => {
                const v = e.target.value;
                setDueIso(v);
                onPatch({ due: v || null });
              }}
              className="input"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </FieldLabel>

          <FieldLabel label="Progress %">
            <input
              type="number"
              min={0}
              max={100}
              step={5}
              value={progressDraft}
              onChange={(e) => setProgressDraft(e.target.value)}
              onBlur={() => {
                const v = Math.max(0, Math.min(100, parseInt(progressDraft, 10) || 0));
                setProgressDraft(String(v));
                if (v !== (item.progress ?? 0)) onPatch({ progress: v });
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className="input"
            />
          </FieldLabel>

          <FieldLabel label="Effort (days)">
            <input
              type="number"
              min={0}
              step={0.5}
              placeholder="—"
              value={effortDraft}
              onChange={(e) => setEffortDraft(e.target.value)}
              onBlur={() => {
                const trimmed = effortDraft.trim();
                const v = trimmed === '' ? null : Math.max(0, parseFloat(trimmed));
                const normalised = v == null || Number.isNaN(v) ? null : v;
                setEffortDraft(normalised == null ? '' : String(normalised));
                if ((normalised ?? null) !== (item.effortDays ?? null)) onPatch({ effortDays: normalised });
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className="input"
            />
          </FieldLabel>
        </div>

        {/* Owner / Product — secondary row. Sub-folder appears below only when the product has any. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          <FieldLabel label="Owner">
            <Dropdown<BacklogItem['owner']>
              value={item.owner}
              onChange={(v) => onPatch({ owner: v })}
              options={[
                { value: 'D', label: 'Dave' },
                { value: 'R', label: 'Raj' },
              ]}
              ariaLabel="Owner"
            />
          </FieldLabel>

          <FieldLabel label="Product">
            <Dropdown<string>
              value={item.product}
              onChange={(v) => onPatch({ product: v })}
              options={products.map((pp) => ({ value: pp.id, label: pp.label }))}
              ariaLabel="Product"
            />
          </FieldLabel>
        </div>

        <div className="inline-editor-footer" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--border-subtle)', paddingTop: 14, marginTop: 4 }}>
          <button
            type="button"
            className="btn btn-ghost inline-editor-action"
            onClick={() => onPatch({ completed: !isCompleted })}
            data-long={isCompleted ? 'Re-open' : 'Mark complete'}
            data-short={isCompleted ? 'Reopen' : 'Complete'}
          >
            <span className="ie-long">{isCompleted ? 'Re-open' : 'Mark complete'}</span>
            <span className="ie-short">{isCompleted ? 'Reopen' : 'Complete'}</span>
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => { if (confirm(`Delete ${item.id}?`)) onDelete(); }}
          >
            Delete
          </button>
          <div style={{ flex: 1 }} />
          <span className="mono inline-editor-status" style={{ fontSize: 10, color: 'var(--fg-4)' }}>{item.id} · changes save automatically</span>
        </div>
      </div>

      {pickerOpen && (
        <AttachPickerDrawer
          existing={attachments}
          onAdd={(att) => { addAttachment(att); }}
          onClose={() => setPickerOpen(false)}
          includeBacklog={false}
        />
      )}
      {viewing && (
        <AttachmentViewerDrawer
          attachment={viewing}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

function FlagOrStage({ flag, stage }: { flag: 'overdue' | 'due-soon' | null; stage: Stage }) {
  if (flag === 'overdue') return <span className="chip chip-overdue">Overdue</span>;
  if (flag === 'due-soon') return <span className="chip chip-due">Due soon</span>;
  const cls = stage === 'now' ? 'chip-now' : stage === 'next' ? 'chip-next' : 'chip-later';
  const label = stage === 'now' ? 'Now' : stage === 'next' ? 'Next' : 'Later';
  return <span className={`chip ${cls}`}>{label}</span>;
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
      {children}
    </label>
  );
}

// Convert various stored due formats to ISO YYYY-MM-DD (or "" if unparseable).
function toIsoDate(s: string | null | undefined): string {
  if (!s) return '';
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function computeFlag(dueIso: string, completed: boolean): 'overdue' | 'due-soon' | null {
  if (completed || !dueIso) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueIso);
  if (isNaN(due.getTime())) return null;
  const days = (due.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
  if (days < 0) return 'overdue';
  if (days <= 5) return 'due-soon';
  return null;
}

function StageChipInline({ stage, flag }: { stage: Stage; flag?: 'overdue' | 'due-soon' | null }) {
  if (flag === 'overdue') return <span className="chip chip-overdue">Overdue</span>;
  if (flag === 'due-soon') return <span className="chip chip-due">Due soon</span>;
  const cls = stage === 'now' ? 'chip-now' : stage === 'next' ? 'chip-next' : 'chip-later';
  const label = stage === 'now' ? 'Now' : stage === 'next' ? 'Next' : 'Later';
  return <span className={`chip ${cls}`}>{label}</span>;
}


function NewItemDialog({ defaultProduct, defaultOwner, products, existingIds, onClose, onCreate }: {
  defaultProduct: string;
  defaultOwner: FounderKey;
  products: Product[];
  existingIds: string[];
  onClose: () => void;
  onCreate: (body: { id: string; title: string; product: string; stage: Stage; owner: FounderKey; note?: string | null; due?: string | null }) => void;
}) {
  const nextId = useMemo(() => {
    const ns = existingIds
      .map((id) => /^PTH-(\d+)$/.exec(id)?.[1])
      .filter((x): x is string => !!x)
      .map((x) => parseInt(x, 10));
    const max = ns.length ? Math.max(...ns) : 200;
    return `PTH-${max + 1}`;
  }, [existingIds]);

  const [id, setId] = useState(nextId);
  const [title, setTitle] = useState('');
  const [product, setProduct] = useState(defaultProduct);
  const [stage, setStage] = useState<Stage>('now');
  const [owner, setOwner] = useState<FounderKey>(defaultOwner);
  const [note, setNote] = useState('');
  const [due, setDue] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !id.trim() || !product) return;
    onCreate({
      id: id.trim(),
      title: title.trim(),
      product,
      stage,
      owner,
      note: note || null,
      due: due || null,
    });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--fg-1)' }}>New backlog item</h2>
          <button type="button" onClick={onClose} className="btn btn-subtle btn-icon"><Icon name="close" size={14} /></button>
        </div>

        <Row2 label="ID">
          <input value={id} onChange={(e) => setId(e.target.value.toUpperCase())} className="input" style={{ width: 140, height: 32 }} />
        </Row2>
        <Row2 label="Title">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="input" style={{ width: '100%', height: 32 }} />
        </Row2>
        <Row2 label="Product">
          <Dropdown<string>
            value={product}
            onChange={setProduct}
            options={products.map((p) => ({ value: p.id, label: p.label }))}
            ariaLabel="Product"
          />
        </Row2>
        <Row2 label="Stage">
          <Dropdown<Stage>
            value={stage}
            onChange={setStage}
            options={[
              { value: 'now',   label: 'Now' },
              { value: 'next',  label: 'Next' },
              { value: 'later', label: 'Later' },
            ]}
            style={{ width: 140 }}
            ariaLabel="Stage"
          />
        </Row2>
        <Row2 label="Owner">
          <Dropdown<FounderKey>
            value={owner}
            onChange={setOwner}
            options={[
              { value: 'D', label: 'Dave' },
              { value: 'R', label: 'Raj' },
            ]}
            style={{ width: 140 }}
            ariaLabel="Owner"
          />
        </Row2>
        <Row2 label="Due">
          <input value={due} onChange={(e) => setDue(e.target.value)} className="input" style={{ width: 200, height: 32 }} placeholder="e.g. 22 Apr 2026" />
        </Row2>
        <Row2 label="Notes">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} className="input" style={{ width: '100%', minHeight: 60, padding: '8px 10px', fontSize: 13, resize: 'vertical' }} />
        </Row2>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!title.trim() || !id.trim() || !product}>Create</button>
        </div>
      </form>
    </div>
  );
}

// Plain <div> wrapper — using <label> here interfered with the Dropdown's <button> trigger:
// clicks on dropdown options bubbled up to the label, which the browser then routed back to the
// labelable button (re-opening the dropdown). Keeping the field as a div fixes selection.
function Row2({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>{label}</span>
      <div>{children}</div>
    </div>
  );
}

function IconToggle({ on, onClick, label, icon }: { on: boolean; onClick: () => void; label: string; icon: any }) {
  return (
    <button onClick={onClick} title={label} style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 10px',
      background: on ? 'var(--bg-active)' : 'transparent',
      color: on ? 'var(--fg-1)' : 'var(--fg-3)',
      borderRadius: 'var(--radius-sm)',
      fontSize: 12,
      fontWeight: 500,
    }}>
      <Icon name={icon} size={14} />
      {label}
    </button>
  );
}
