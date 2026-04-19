import { useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Avatar } from '../components/primitives';
import { Icon } from '../components/Icon';
import { FOUNDERS, PRODUCT_DOCS } from '../lib/seed';
import type { BacklogItem, FounderKey, Stage } from '../lib/types';
import { useUI } from '../lib/store';
import { useBacklog, useCreateBacklog, useDeleteBacklog, usePatchBacklog, useProducts } from '../lib/queries';
import { useSession } from '../lib/useSession';

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
  const [selected, setSelected] = useState<BacklogItem | null>(null);
  const [showNew, setShowNew] = useState(false);
  const navigate = useUI((s) => s.navigate);
  const session = useSession();
  const me: FounderKey = (session.data?.key as FounderKey) ?? 'D';

  const backlogQ = useBacklog();
  const productsQ = useProducts();
  const createBacklog = useCreateBacklog();
  const patchBacklog = usePatchBacklog();
  const deleteBacklog = useDeleteBacklog();

  const items = backlogQ.data ?? [];
  const products = productsQ.data ?? [];

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

      {layout === 'kanban' && <BacklogKanban items={filtered} products={products} onItemClick={setSelected} productFilter={productFilter ?? null} />}
      {layout === 'lanes' && <BacklogLanes items={filtered} products={products} onItemClick={setSelected} />}
      {layout === 'list' && <BacklogList items={filtered} products={products} onItemClick={setSelected} />}

      {selected && (
        <ItemDrawer
          item={selected}
          products={products}
          onClose={() => setSelected(null)}
          onOpenProduct={() => { navigate(`product:${selected.product}`); setSelected(null); }}
          onPatch={(patch) => patchBacklog.mutate({ id: selected.id, patch }, { onSuccess: (row) => setSelected((curr) => curr && curr.id === selected.id ? row : curr) })}
          onDelete={() => { deleteBacklog.mutate(selected.id); setSelected(null); }}
        />
      )}

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

function BacklogKanban({ items, products, onItemClick, productFilter }: { items: BacklogItem[]; products: Product[]; onItemClick: (i: BacklogItem) => void; productFilter: string | null }) {
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
        <Row key={p.id} product={p} items={items} onItemClick={onItemClick} />
      ))}
    </div>
  );
}

function Row({ product, items, onItemClick }: { product: Product; items: BacklogItem[]; onItemClick: (i: BacklogItem) => void }) {
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
              : cell.map((i) => <KanbanCell key={i.id} item={i} product={product} onClick={() => onItemClick(i)} />)}
            <button style={{
              background: 'transparent',
              border: '1px dashed var(--border-default)',
              borderRadius: 6,
              padding: '5px 8px',
              fontSize: 11,
              color: 'var(--fg-4)',
              fontFamily: 'var(--font-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              justifyContent: 'center',
            }}>
              <Icon name="plus" size={11} /> Add
            </button>
          </div>
        );
      })}
    </>
  );
}

function KanbanCell({ item, product, onClick }: { item: BacklogItem; product: Product; onClick: () => void }) {
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
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {item.due
          ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: item.flag === 'overdue' ? 'var(--danger-fg)' : 'var(--fg-4)' }}>{item.due}</span>
          : <span />}
        <Avatar who={item.owner} size={18} />
      </div>
    </div>
  );
}

function BacklogLanes({ items, products, onItemClick }: { items: BacklogItem[]; products: Product[]; onItemClick: (i: BacklogItem) => void }) {
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
            {col.map((i) => <BacklogRow key={i.id} item={i} products={products} onClick={() => onItemClick(i)} compact />)}
          </div>
        );
      })}
    </div>
  );
}

function BacklogList({ items, products, onItemClick }: { items: BacklogItem[]; products: Product[]; onItemClick: (i: BacklogItem) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((i) => <BacklogRow key={i.id} item={i} products={products} onClick={() => onItemClick(i)} />)}
    </div>
  );
}

function BacklogRow({ item, products, onClick, compact, showProduct = true }: { item: BacklogItem; products: Product[]; onClick?: () => void; compact?: boolean; showProduct?: boolean }) {
  const p = products.find((x) => x.id === item.product);
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)', letterSpacing: '0.02em' }}>{item.id}</span>
          {showProduct && (
            <span className="tag" style={{ color: p.color }}>
              <span className="tag-dot" style={{ background: p.color }} />
              {p.label}
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
        <StageChipInline stage={item.stage} flag={item.flag} />
        <Avatar who={item.owner} size={22} />
      </div>
    </div>
  );
}

function StageChipInline({ stage, flag }: { stage: Stage; flag?: 'overdue' | 'due-soon' | null }) {
  if (flag === 'overdue') return <span className="chip chip-overdue">Overdue</span>;
  if (flag === 'due-soon') return <span className="chip chip-due">Due soon</span>;
  const cls = stage === 'now' ? 'chip-now' : stage === 'next' ? 'chip-next' : 'chip-later';
  const label = stage === 'now' ? 'Now' : stage === 'next' ? 'Next' : 'Later';
  return <span className={`chip ${cls}`}>{label}</span>;
}

function ItemDrawer({ item, products, onClose, onOpenProduct, onPatch, onDelete }: {
  item: BacklogItem;
  products: Product[];
  onClose: () => void;
  onOpenProduct: () => void;
  onPatch: (patch: Partial<BacklogItem>) => void;
  onDelete: () => void;
}) {
  const p = products.find((x) => x.id === item.product);
  const docs = PRODUCT_DOCS.filter((d) => d.product === item.product).slice(0, 2);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [note, setNote] = useState(item.note ?? '');
  const [due, setDue] = useState(item.due ?? '');
  const [productId, setProductId] = useState(item.product);
  const [stage, setStage] = useState<Stage>(item.stage);
  const [owner, setOwner] = useState<BacklogItem['owner']>(item.owner);
  const [progress, setProgress] = useState<number>(item.progress ?? 0);

  const commit = () => {
    const patch: Partial<BacklogItem> = {};
    if (title.trim() && title !== item.title) patch.title = title.trim();
    if ((note || null) !== (item.note || null)) patch.note = note || null;
    if ((due || null) !== (item.due || null)) patch.due = due || null;
    if (productId !== item.product) patch.product = productId;
    if (stage !== item.stage) patch.stage = stage;
    if (owner !== item.owner) patch.owner = owner;
    if (progress !== (item.progress ?? 0)) patch.progress = progress;
    if (Object.keys(patch).length) onPatch(patch);
    setEditing(false);
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 30 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(30,30,30,0.35)' }} />
      <div style={{
        position: 'absolute', top: 0, bottom: 0, right: 0, width: 520,
        background: 'var(--bg-surface)',
        boxShadow: 'var(--shadow-3)',
        display: 'flex', flexDirection: 'column',
        animation: 'slideIn 180ms ease',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-4)' }}>{item.id}</span>
          {p && <span className="tag" style={{ color: p.color }}><span className="tag-dot" style={{ background: p.color }} />{p.label}</span>}
          <div style={{ flex: 1 }} />
          <StageChipInline stage={item.stage} flag={item.flag} />
          <button onClick={onClose} className="btn btn-subtle btn-icon"><Icon name="close" size={14} /></button>
        </div>
        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>
          {editing ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
              className="input"
              style={{ width: '100%', fontSize: 18, fontWeight: 600, height: 40 }}
            />
          ) : (
            <h2 onDoubleClick={() => setEditing(true)} style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg-1)', margin: '0 0 12px', letterSpacing: '-0.005em' }}>{item.title}</h2>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', rowGap: 10, columnGap: 16, fontSize: 13, marginTop: 16, alignItems: 'center' }}>
            <div className="meta" style={{ fontSize: 10 }}>Stage</div>
            <div>
              {editing ? (
                <select value={stage} onChange={(e) => setStage(e.target.value as Stage)} className="input" style={{ height: 30, padding: '0 8px' }}>
                  <option value="now">Now</option>
                  <option value="next">Next</option>
                  <option value="later">Later</option>
                </select>
              ) : <StageChipInline stage={item.stage} />}
            </div>
            <div className="meta" style={{ fontSize: 10 }}>Owner</div>
            {editing ? (
              <select value={owner} onChange={(e) => setOwner(e.target.value as BacklogItem['owner'])} className="input" style={{ height: 30, padding: '0 8px' }}>
                <option value="D">Dave</option>
                <option value="R">Raj</option>
              </select>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Avatar who={item.owner} size={22} />
                <span>{FOUNDERS[item.owner].name}</span>
              </div>
            )}
            <div className="meta" style={{ fontSize: 10 }}>Product</div>
            <div>
              {editing ? (
                <select value={productId} onChange={(e) => setProductId(e.target.value)} className="input" style={{ height: 30, padding: '0 8px' }}>
                  {products.map((pp) => <option key={pp.id} value={pp.id}>{pp.label}</option>)}
                </select>
              ) : (
                p && <span className="tag" style={{ color: p.color }}><span className="tag-dot" style={{ background: p.color }} />{p.label}</span>
              )}
            </div>
            <div className="meta" style={{ fontSize: 10 }}>Due</div>
            <div>
              {editing ? (
                <input
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                  className="input"
                  style={{ height: 30, padding: '0 8px', width: 220 }}
                  placeholder="22 Apr 2026"
                />
              ) : (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: item.flag === 'overdue' ? 'var(--danger-fg)' : 'var(--fg-2)' }}>
                  {item.due || '—'}
                </span>
              )}
            </div>
            <div className="meta" style={{ fontSize: 10 }}>Progress</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {editing ? (
                <>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={progress}
                    onChange={(e) => setProgress(parseInt(e.target.value, 10))}
                    style={{ flex: 1 }}
                  />
                  <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)', minWidth: 40, textAlign: 'right' }}>{progress}%</span>
                </>
              ) : (
                <>
                  <div style={{ flex: 1, height: 6, background: 'var(--bg-sunken)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${item.progress ?? 0}%`, background: 'var(--path-primary)' }} />
                  </div>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)', minWidth: 40, textAlign: 'right' }}>{item.progress ?? 0}%</span>
                </>
              )}
            </div>
          </div>
          <hr className="hr" style={{ margin: '24px 0' }} />
          <div className="meta" style={{ fontSize: 10, marginBottom: 8 }}>Notes</div>
          {editing ? (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="input"
              style={{ width: '100%', minHeight: 90, padding: '8px 10px', fontSize: 13, lineHeight: 1.5, resize: 'vertical' }}
            />
          ) : (
            <div style={{ fontSize: 14, color: 'var(--fg-2)', lineHeight: 1.6 }}>
              {item.note || <span style={{ color: 'var(--fg-4)' }}>No notes yet.</span>}
            </div>
          )}
          <hr className="hr" style={{ margin: '24px 0' }} />
          <div className="meta" style={{ fontSize: 10, marginBottom: 8 }}>Linked docs</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {docs.length === 0 && <div style={{ fontSize: 13, color: 'var(--fg-4)' }}>No docs linked.</div>}
            {docs.map((d) => (
              <div key={d.id} className="row-hover" style={{ padding: '8px 10px', border: '1px solid var(--border-subtle)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <Icon name="file" size={14} color="var(--fg-3)" />
                <span style={{ flex: 1, fontSize: 13, color: 'var(--fg-2)' }}>{d.title}</span>
                <span className="meta" style={{ fontSize: 10 }}>{d.updated}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8 }}>
          {editing ? (
            <>
              <button className="btn btn-primary" onClick={commit}><Icon name="check" size={12} /> Save</button>
              <button className="btn btn-ghost" onClick={() => { setTitle(item.title); setNote(item.note ?? ''); setDue(item.due ?? ''); setProductId(item.product); setStage(item.stage); setOwner(item.owner); setProgress(item.progress ?? 0); setEditing(false); }}>Cancel</button>
            </>
          ) : (
            <>
              <button className="btn btn-primary" onClick={() => setEditing(true)}><Icon name="edit" size={12} /> Edit</button>
              <button className="btn btn-ghost" onClick={onOpenProduct}>Open product</button>
            </>
          )}
          <div style={{ flex: 1 }} />
          {!editing && (
            <button className="btn btn-subtle" style={{ color: 'var(--danger-fg)' }} onClick={() => { if (confirm(`Delete ${item.id}?`)) onDelete(); }}><Icon name="close" size={12} /> Delete</button>
          )}
        </div>
      </div>
    </div>
  );
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
