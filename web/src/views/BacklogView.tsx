import { useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Avatar } from '../components/primitives';
import { Icon } from '../components/Icon';
import { BACKLOG, PRODUCTS, FOUNDERS, PRODUCT_DOCS } from '../lib/seed';
import type { BacklogItem, Stage } from '../lib/types';
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
  const [selected, setSelected] = useState<BacklogItem | null>(null);
  const [items, setItems] = useState<BacklogItem[]>(BACKLOG);
  const navigate = useUI((s) => s.navigate);

  const filtered = useMemo(() => items.filter((b) => {
    if (productFilter && b.product !== productFilter) return false;
    if (tab === 'mine' && b.owner !== 'D') return false;
    if (tab === 'raj' && b.owner !== 'R') return false;
    if (tab === 'flagged' && !b.flag) return false;
    if (query) {
      const hay = `${b.title}${b.id}${b.note ?? ''}`.toLowerCase();
      if (!hay.includes(query.toLowerCase())) return false;
    }
    return true;
  }), [items, productFilter, tab, query]);

  const counts = {
    now: filtered.filter((i) => i.stage === 'now').length,
    next: filtered.filter((i) => i.stage === 'next').length,
    later: filtered.filter((i) => i.stage === 'later').length,
  };

  const currentProduct = productFilter ? PRODUCTS.find((p) => p.id === productFilter) : null;

  const sub = currentProduct
    ? <>One product. Now <b style={{ color: 'var(--fg-2)' }}>{counts.now}</b>, Next {counts.next}, Later {counts.later}. Drag to reorder.</>
    : <>Product-led priorities across all products. Now <b style={{ color: 'var(--fg-2)' }}>{counts.now}</b>, Next {counts.next}, Later {counts.later}.</>;

  const tabs = !productFilter ? [
    { id: 'global' as const, label: 'All products', count: items.length },
    { id: 'mine' as const, label: 'Mine', count: items.filter((i) => i.owner === 'D').length },
    { id: 'raj' as const, label: "Raj's", count: items.filter((i) => i.owner === 'R').length },
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
            <button className="btn btn-primary"><Icon name="plus" size={14} /> Add item</button>
          </>
        }
        tabs={tabs ? <BacklogTabs value={tab} onChange={setTab} tabs={tabs} /> : undefined}
      />

      {layout === 'kanban' && <BacklogKanban items={filtered} onItemClick={setSelected} productFilter={productFilter ?? null} />}
      {layout === 'lanes' && <BacklogLanes items={filtered} onItemClick={setSelected} />}
      {layout === 'list' && <BacklogList items={filtered} onItemClick={setSelected} />}

      {selected && <ItemDrawer item={selected} onClose={() => setSelected(null)} onOpenProduct={() => { navigate(`product:${selected.product}`); setSelected(null); }} />}
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

function BacklogKanban({ items, onItemClick, productFilter }: { items: BacklogItem[]; onItemClick: (i: BacklogItem) => void; productFilter: string | null }) {
  const prods = productFilter ? PRODUCTS.filter((p) => p.id === productFilter) : PRODUCTS;
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

function Row({ product, items, onItemClick }: { product: typeof PRODUCTS[0]; items: BacklogItem[]; onItemClick: (i: BacklogItem) => void }) {
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

function KanbanCell({ item, product, onClick }: { item: BacklogItem; product: typeof PRODUCTS[0]; onClick: () => void }) {
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

function BacklogLanes({ items, onItemClick }: { items: BacklogItem[]; onItemClick: (i: BacklogItem) => void }) {
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
            {col.map((i) => <BacklogRow key={i.id} item={i} onClick={() => onItemClick(i)} compact />)}
          </div>
        );
      })}
    </div>
  );
}

function BacklogList({ items, onItemClick }: { items: BacklogItem[]; onItemClick: (i: BacklogItem) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((i) => <BacklogRow key={i.id} item={i} onClick={() => onItemClick(i)} />)}
    </div>
  );
}

function BacklogRow({ item, onClick, compact, showProduct = true }: { item: BacklogItem; onClick?: () => void; compact?: boolean; showProduct?: boolean }) {
  const p = PRODUCTS.find((x) => x.id === item.product)!;
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

function StageChipInline({ stage, flag }: { stage: Stage; flag?: 'overdue' | 'due-soon' }) {
  if (flag === 'overdue') return <span className="chip chip-overdue">Overdue</span>;
  if (flag === 'due-soon') return <span className="chip chip-due">Due soon</span>;
  const cls = stage === 'now' ? 'chip-now' : stage === 'next' ? 'chip-next' : 'chip-later';
  const label = stage === 'now' ? 'Now' : stage === 'next' ? 'Next' : 'Later';
  return <span className={`chip ${cls}`}>{label}</span>;
}

function ItemDrawer({ item, onClose, onOpenProduct }: { item: BacklogItem; onClose: () => void; onOpenProduct: () => void }) {
  const p = PRODUCTS.find((x) => x.id === item.product)!;
  const docs = PRODUCT_DOCS.filter((d) => d.product === item.product).slice(0, 2);
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
          <span className="tag" style={{ color: p.color }}><span className="tag-dot" style={{ background: p.color }} />{p.label}</span>
          <div style={{ flex: 1 }} />
          <StageChipInline stage={item.stage} flag={item.flag} />
          <button onClick={onClose} className="btn btn-subtle btn-icon"><Icon name="close" size={14} /></button>
        </div>
        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>
          <h2 style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg-1)', margin: '0 0 12px', letterSpacing: '-0.005em' }}>{item.title}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', rowGap: 10, columnGap: 16, fontSize: 13, marginTop: 16 }}>
            <div className="meta" style={{ fontSize: 10 }}>Stage</div>
            <div><StageChipInline stage={item.stage} /></div>
            <div className="meta" style={{ fontSize: 10 }}>Owner</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar who={item.owner} size={22} />
              <span>{FOUNDERS[item.owner].name}</span>
            </div>
            <div className="meta" style={{ fontSize: 10 }}>Product</div>
            <div>
              <span className="tag" style={{ color: p.color }}><span className="tag-dot" style={{ background: p.color }} />{p.label}</span>
            </div>
            <div className="meta" style={{ fontSize: 10 }}>Due</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: item.flag === 'overdue' ? 'var(--danger-fg)' : 'var(--fg-2)' }}>
              {item.due || '—'}
            </div>
          </div>
          <hr className="hr" style={{ margin: '24px 0' }} />
          <div className="meta" style={{ fontSize: 10, marginBottom: 8 }}>Notes</div>
          <div style={{ fontSize: 14, color: 'var(--fg-2)', lineHeight: 1.6 }}>
            {item.note || <span style={{ color: 'var(--fg-4)' }}>No notes yet.</span>}
          </div>
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
          <hr className="hr" style={{ margin: '24px 0' }} />
          <div className="meta" style={{ fontSize: 10, marginBottom: 8 }}>Activity</div>
          <div style={{ fontSize: 12.5, color: 'var(--fg-3)', lineHeight: 1.7 }}>
            <div><span style={{ color: 'var(--fg-2)' }}>Dave</span> moved to <b style={{ color: 'var(--fg-1)' }}>{item.stage}</b> · 2d ago</div>
            <div><span style={{ color: 'var(--fg-2)' }}>Jeff</span> linked this to a doc · 3d ago</div>
            <div><span style={{ color: 'var(--fg-2)' }}>Raj</span> commented · 5d ago</div>
          </div>
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 8 }}>
          <button className="btn btn-primary"><Icon name="edit" size={12} /> Edit</button>
          <button className="btn btn-ghost" onClick={onOpenProduct}>Open product</button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-subtle">Open in backlog.path2ai.tech <Icon name="arrow-up-right" size={12} /></button>
        </div>
      </div>
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
