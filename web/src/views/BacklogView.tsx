import { useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Avatar } from '../components/primitives';
import { Icon } from '../components/Icon';
import type { BacklogItem, FounderKey, Stage } from '../lib/types';
import { useBacklog, useCreateBacklog, useDeleteBacklog, usePatchBacklog, useProducts, useSubfolders } from '../lib/queries';
import { useSession } from '../lib/useSession';
import type { Subfolder } from '../lib/api';

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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const session = useSession();
  const me: FounderKey = (session.data?.key as FounderKey) ?? 'D';

  const backlogQ = useBacklog();
  const productsQ = useProducts();
  const subfoldersQ = useSubfolders();
  const createBacklog = useCreateBacklog();
  const patchBacklog = usePatchBacklog();
  const deleteBacklog = useDeleteBacklog();

  const items = backlogQ.data ?? [];
  const products = productsQ.data ?? [];
  const subfolders = subfoldersQ.data ?? [];

  const patch = (id: string, p: Partial<BacklogItem>) => patchBacklog.mutate({ id, patch: p });
  const remove = (id: string) => {
    deleteBacklog.mutate(id);
    setExpandedId(null);
  };

  const filtered = useMemo(() => items.filter((b) => {
    if (productFilter && b.product !== productFilter) return false;
    if (tab === 'mine' && b.owner !== me) return false;
    if (tab === 'raj' && b.owner === me) return false;
    if (tab === 'flagged' && !b.flag) return false;
    if (query) {
      const hay = `${b.title}${b.id}${b.note ?? ''}`.toLowerCase();
      if (!hay.includes(query.toLowerCase())) return false;
    }
    return true;
  }), [items, productFilter, tab, query, me]);

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
            <button className="btn btn-ghost"><Icon name="filter" size={14} /> Owner</button>
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

      {layout === 'kanban' && <BacklogKanban items={filtered} products={products} subfolders={subfolders} productFilter={productFilter ?? null} expandedId={expandedId} onToggle={(id) => setExpandedId((c) => c === id ? null : id)} onPatch={patch} onDelete={remove} />}
      {layout === 'lanes' && <BacklogLanes items={filtered} products={products} subfolders={subfolders} expandedId={expandedId} onToggle={(id) => setExpandedId((c) => c === id ? null : id)} onPatch={patch} onDelete={remove} />}
      {layout === 'list' && <BacklogList items={filtered} products={products} subfolders={subfolders} expandedId={expandedId} onToggle={(id) => setExpandedId((c) => c === id ? null : id)} onPatch={patch} onDelete={remove} />}

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
  subfolders: Subfolder[];
  expandedId: string | null;
  onToggle: (id: string) => void;
  onPatch: (id: string, patch: Partial<BacklogItem>) => void;
  onDelete: (id: string) => void;
}

function BacklogKanban({ items, products, subfolders, productFilter, expandedId, onToggle, onPatch, onDelete }: LayoutProps & { productFilter: string | null }) {
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
        <ProductRow key={p.id} product={p} items={items} products={products} subfolders={subfolders} expandedId={expandedId} onToggle={onToggle} onPatch={onPatch} onDelete={onDelete} />
      ))}
    </div>
  );
}

function ProductRow({ product, items, products, subfolders, expandedId, onToggle, onPatch, onDelete }: { product: Product } & LayoutProps) {
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
                    ? <InlineEditor key={i.id} item={i} products={products} subfolders={subfolders} onCollapse={() => onToggle(i.id)} onPatch={(patch) => onPatch(i.id, patch)} onDelete={() => onDelete(i.id)} density="compact" />
                    : <KanbanCell key={i.id} item={i} product={product} subfolders={subfolders} onClick={() => onToggle(i.id)} />
                ))}
          </div>
        );
      })}
    </>
  );
}

function KanbanCell({ item, product, subfolders, onClick }: { item: BacklogItem; product: Product; subfolders: Subfolder[]; onClick: () => void }) {
  const sf = item.subfolderId ? subfolders.find((x) => x.id === item.subfolderId) : null;
  return (
    <div className="row-hover" onClick={onClick} style={{
      position: 'relative',
      padding: '8px 10px 8px 12px',
      border: '1px solid var(--border-subtle)',
      borderRadius: 6,
      background: 'var(--bg-surface)',
      cursor: 'pointer',
    }}>
      <span style={{ position: 'absolute', left: 0, top: 4, bottom: 4, width: 2, background: product.color, borderRadius: '0 2px 2px 0' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--fg-4)' }}>{item.id}</span>
        {item.flag === 'overdue' && <span className="chip chip-overdue" style={{ fontSize: 9.5, padding: '1px 6px' }}>Overdue</span>}
        {item.flag === 'due-soon' && <span className="chip chip-due" style={{ fontSize: 9.5, padding: '1px 6px' }}>Due soon</span>}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--fg-1)', fontWeight: 500, lineHeight: 1.35 }}>{item.title}</div>
      {sf && <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', marginTop: 4 }}>/ {sf.name}</div>}
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {item.due
          ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: item.flag === 'overdue' ? 'var(--danger-fg)' : 'var(--fg-4)' }}>{item.due}</span>
          : <span />}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {(item.progress ?? 0) > 0 && <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-4)' }}>{item.progress ?? 0}%</span>}
          <Avatar who={item.owner} size={18} />
        </div>
      </div>
    </div>
  );
}

function BacklogLanes({ items, products, subfolders, expandedId, onToggle, onPatch, onDelete }: LayoutProps) {
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
                ? <InlineEditor key={i.id} item={i} products={products} subfolders={subfolders} onCollapse={() => onToggle(i.id)} onPatch={(patch) => onPatch(i.id, patch)} onDelete={() => onDelete(i.id)} density="compact" />
                : <BacklogRow key={i.id} item={i} products={products} subfolders={subfolders} onClick={() => onToggle(i.id)} compact />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function BacklogList({ items, products, subfolders, expandedId, onToggle, onPatch, onDelete }: LayoutProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((i) => (
        expandedId === i.id
          ? <InlineEditor key={i.id} item={i} products={products} subfolders={subfolders} onCollapse={() => onToggle(i.id)} onPatch={(patch) => onPatch(i.id, patch)} onDelete={() => onDelete(i.id)} density="roomy" />
          : <BacklogRow key={i.id} item={i} products={products} subfolders={subfolders} onClick={() => onToggle(i.id)} />
      ))}
    </div>
  );
}

function BacklogRow({ item, products, subfolders, onClick, compact, showProduct = true }: { item: BacklogItem; products: Product[]; subfolders: Subfolder[]; onClick?: () => void; compact?: boolean; showProduct?: boolean }) {
  const p = products.find((x) => x.id === item.product);
  const sf = item.subfolderId ? subfolders.find((x) => x.id === item.subfolderId) : null;
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
    }}>
      <span style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 3, background: p.color, borderRadius: '0 3px 3px 0' }} />
      <Icon name="drag" size={14} color="var(--fg-4)" style={{ marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)', letterSpacing: '0.02em' }}>{item.id}</span>
          {showProduct && (
            <span className="tag" style={{ color: p.color }}>
              <span className="tag-dot" style={{ background: p.color }} />
              {p.label}{sf ? ` / ${sf.name}` : ''}
            </span>
          )}
          {item.due && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: item.flag === 'overdue' ? 'var(--danger-fg)' : 'var(--fg-4)' }}>
              · {item.due}{item.age ? ` · ${item.age}` : ''}
            </span>
          )}
        </div>
        <div style={{ fontSize: 14, color: 'var(--fg-1)', fontWeight: 500, lineHeight: 1.35 }}>{item.title}</div>
        {item.note && !compact && (
          <div style={{ fontSize: 12.5, color: 'var(--fg-3)', marginTop: 3, lineHeight: 1.45 }}>{item.note}</div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {(item.progress ?? 0) > 0 && <span className="mono" style={{ fontSize: 10, color: 'var(--fg-4)' }}>{item.progress ?? 0}%</span>}
        <StageChipInline stage={item.stage} flag={item.flag} />
        <Avatar who={item.owner} size={22} />
      </div>
    </div>
  );
}

// Inline editor — replaces the card when expanded. Auto-saves on change.
function InlineEditor({ item, products, subfolders, onCollapse, onPatch, onDelete, density }: {
  item: BacklogItem;
  products: Product[];
  subfolders: Subfolder[];
  onCollapse: () => void;
  onPatch: (patch: Partial<BacklogItem>) => void;
  onDelete: () => void;
  density: 'compact' | 'roomy';
}) {
  const p = products.find((x) => x.id === item.product);
  const productSubfolders = subfolders.filter((sf) => sf.productId === item.product);

  // Local mirrors for text inputs so typing doesn't fire a request on every keystroke — saved on blur.
  const [title, setTitle] = useState(item.title);
  const [note, setNote] = useState(item.note ?? '');
  const [due, setDue] = useState(item.due ?? '');

  const saveIfChanged = (key: keyof BacklogItem, val: string, original: string | null | undefined) => {
    if ((val || null) === (original || null)) return;
    onPatch({ [key]: val || null } as Partial<BacklogItem>);
  };

  const colCount = density === 'compact' ? 1 : 2;

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
          padding: '10px 12px 10px 16px',
          background: 'var(--bg-sunken)',
          border: 0,
          borderBottom: '1px solid var(--border-subtle)',
          cursor: 'pointer',
          textAlign: 'left',
          color: 'inherit',
        }}
      >
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)' }}>{item.id}</span>
        {p && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: p.color, fontWeight: 500 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.color }} />
          {p.label}
        </span>}
        <StageChipInline stage={item.stage} flag={item.flag} />
        <div style={{ flex: 1 }} />
        <Avatar who={item.owner} size={20} />
        <Icon name="chevron-up" size={14} color="var(--fg-3)" />
      </button>

      {/* Body — edit fields; each auto-saves on blur/change */}
      <div style={{ padding: density === 'compact' ? '10px 12px' : '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => saveIfChanged('title', title.trim(), item.title)}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          placeholder="Title"
          className="input"
          style={{ width: '100%', height: 34, fontWeight: 500 }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: colCount === 2 ? '1fr 1fr' : '1fr', gap: 8 }}>
          <FieldRow label="Stage">
            <select
              value={item.stage}
              onChange={(e) => onPatch({ stage: e.target.value as Stage })}
              className="input"
            >
              <option value="now">Now</option>
              <option value="next">Next</option>
              <option value="later">Later</option>
            </select>
          </FieldRow>
          <FieldRow label="Owner">
            <select
              value={item.owner}
              onChange={(e) => onPatch({ owner: e.target.value as BacklogItem['owner'] })}
              className="input"
            >
              <option value="D">Dave</option>
              <option value="R">Raj</option>
            </select>
          </FieldRow>
          <FieldRow label="Product">
            <select
              value={item.product}
              onChange={(e) => onPatch({ product: e.target.value, subfolderId: null })}
              className="input"
            >
              {products.map((pp) => <option key={pp.id} value={pp.id}>{pp.label}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Sub-folder">
            <select
              value={item.subfolderId ?? ''}
              onChange={(e) => onPatch({ subfolderId: e.target.value ? parseInt(e.target.value, 10) : null })}
              disabled={!productSubfolders.length}
              className="input"
            >
              <option value="">{productSubfolders.length ? '— none —' : 'No sub-folders'}</option>
              {productSubfolders.map((sf) => <option key={sf.id} value={sf.id}>{sf.name}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Due">
            <input
              value={due}
              onChange={(e) => setDue(e.target.value)}
              onBlur={() => saveIfChanged('due', due.trim(), item.due)}
              className="input"
              placeholder="e.g. 22 Apr 2026"
            />
          </FieldRow>
          <FieldRow label="Flag">
            <select
              value={item.flag ?? ''}
              onChange={(e) => onPatch({ flag: (e.target.value || null) as BacklogItem['flag'] })}
              className="input"
            >
              <option value="">— none —</option>
              <option value="due-soon">Due soon</option>
              <option value="overdue">Overdue</option>
            </select>
          </FieldRow>
        </div>

        <FieldRow label="Progress">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              defaultValue={item.progress ?? 0}
              onChange={(e) => {/* live preview only */}}
              onPointerUp={(e) => {
                const v = parseInt((e.currentTarget as HTMLInputElement).value, 10);
                if (v !== (item.progress ?? 0)) onPatch({ progress: v });
              }}
              style={{ flex: 1 }}
            />
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)', minWidth: 40, textAlign: 'right' }}>{item.progress ?? 0}%</span>
          </div>
        </FieldRow>

        <FieldRow label="Notes">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => saveIfChanged('note', note, item.note)}
            className="input"
            style={{ width: '100%', minHeight: 72, padding: '8px 10px', fontSize: 13, lineHeight: 1.5, resize: 'vertical' }}
            placeholder="Notes…"
          />
        </FieldRow>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <button
            type="button"
            className="btn btn-subtle"
            style={{ color: 'var(--danger-fg)', padding: '6px 10px', fontSize: 12 }}
            onClick={() => { if (confirm(`Delete ${item.id}?`)) onDelete(); }}
          >
            <Icon name="close" size={12} /> Delete
          </button>
          <span className="mono" style={{ fontSize: 10, color: 'var(--fg-4)' }}>Changes save automatically</span>
        </div>
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="meta" style={{ fontSize: 9.5 }}>{label}</span>
      {children}
    </label>
  );
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
          <select value={product} onChange={(e) => setProduct(e.target.value)} className="input" style={{ height: 32, padding: '0 8px' }}>
            {products.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Row2>
        <Row2 label="Stage">
          <select value={stage} onChange={(e) => setStage(e.target.value as Stage)} className="input" style={{ height: 32, padding: '0 8px', width: 140 }}>
            <option value="now">Now</option>
            <option value="next">Next</option>
            <option value="later">Later</option>
          </select>
        </Row2>
        <Row2 label="Owner">
          <select value={owner} onChange={(e) => setOwner(e.target.value as FounderKey)} className="input" style={{ height: 32, padding: '0 8px', width: 140 }}>
            <option value="D">Dave</option>
            <option value="R">Raj</option>
          </select>
        </Row2>
        <Row2 label="Due">
          <input value={due} onChange={(e) => setDue(e.target.value)} className="input" style={{ width: 200, height: 32 }} placeholder="e.g. 22 Apr 2026" />
        </Row2>
        <Row2 label="Notes">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} className="input" style={{ width: '100%', minHeight: 60, padding: '8px 10px', fontSize: 13, resize: 'vertical' }} />
        </Row2>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!title.trim() || !id.trim()}>Create</button>
        </div>
      </form>
    </div>
  );
}

function Row2({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gridTemplateColumns: '80px 1fr', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>{label}</span>
      <div>{children}</div>
    </label>
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
