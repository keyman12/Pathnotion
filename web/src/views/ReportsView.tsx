import { useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Avatar } from '../components/primitives';
import { Dropdown } from '../components/Dropdown';
import { useBacklog, useProducts } from '../lib/queries';
import type { BacklogItem, FounderKey, Stage } from '../lib/types';

type OwnerFilter = 'all' | 'D' | 'R';
type StatusFilter = 'all' | 'open' | 'completed' | 'overdue' | 'due-soon';

export function ReportsView() {
  const [owner, setOwner] = useState<OwnerFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [productId, setProductId] = useState<string>('all');

  const backlogQ = useBacklog();
  const productsQ = useProducts();

  const items = backlogQ.data ?? [];
  const products = productsQ.data ?? [];

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (owner !== 'all' && i.owner !== owner) return false;
      if (productId !== 'all' && i.product !== productId) return false;
      if (status === 'open' && i.completedAt) return false;
      if (status === 'completed' && !i.completedAt) return false;
      if (status === 'overdue' && i.flag !== 'overdue') return false;
      if (status === 'due-soon' && i.flag !== 'due-soon') return false;
      return true;
    });
  }, [items, owner, status, productId]);

  const stats = useMemo(() => {
    const open = items.filter((i) => !i.completedAt);
    return {
      total: items.length,
      open: open.length,
      completed: items.filter((i) => i.completedAt).length,
      overdue: items.filter((i) => i.flag === 'overdue').length,
      dueSoon: items.filter((i) => i.flag === 'due-soon').length,
      avgProgress: open.length ? Math.round(open.reduce((sum, i) => sum + (i.progress ?? 0), 0) / open.length) : 0,
    };
  }, [items]);

  return (
    <div className="screen-enter">
      <PageHeader
        title="Reports"
        sub="Snapshot of backlog health. Filter and slice by owner, product, or status."
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <StatCard label="Open" value={stats.open} sub={`${stats.total} total`} />
        <StatCard label="Avg progress" value={`${stats.avgProgress}%`} sub={`${stats.open} open`} />
        <StatCard label="Overdue" value={stats.overdue} sub="Attention needed" tone={stats.overdue > 0 ? 'warn' : 'default'} />
        <StatCard label="Due soon" value={stats.dueSoon} sub="Within this week" />
      </div>

      <div style={{
        display: 'flex',
        gap: 10,
        marginBottom: 16,
        flexWrap: 'wrap',
      }}>
        <FilterSelect label="Owner" value={owner} onChange={(v) => setOwner(v as OwnerFilter)} options={[
          { v: 'all', l: 'Everyone' },
          { v: 'D', l: 'Dave' },
          { v: 'R', l: 'Raj' },
        ]} />
        <FilterSelect label="Product" value={productId} onChange={setProductId} options={[
          { v: 'all', l: 'All products' },
          ...products.map((p) => ({ v: p.id, l: p.label })),
        ]} />
        <FilterSelect label="Status" value={status} onChange={(v) => setStatus(v as StatusFilter)} options={[
          { v: 'all', l: 'All' },
          { v: 'open', l: 'Open' },
          { v: 'completed', l: 'Completed' },
          { v: 'overdue', l: 'Overdue' },
          { v: 'due-soon', l: 'Due soon' },
        ]} />
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--fg-3)', alignSelf: 'center' }}>
          {filtered.length} result{filtered.length === 1 ? '' : 's'}
        </div>
      </div>

      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '90px 1fr 120px 100px 100px 80px 40px',
          alignItems: 'center',
          gap: 14,
          padding: '10px 16px',
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--bg-sunken)',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--fg-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}>
          <span>ID</span>
          <span>Title</span>
          <span>Product</span>
          <span>Stage</span>
          <span>Due</span>
          <span>Progress</span>
          <span>Owner</span>
        </div>
        {filtered.length === 0 && (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--fg-4)', fontSize: 13 }}>
            No items match the current filters.
          </div>
        )}
        {filtered.map((it, i) => (
          <ItemRow key={it.id} item={it} products={products} last={i === filtered.length - 1} />
        ))}
      </div>
    </div>
  );
}

function ItemRow({ item, products, last }: { item: BacklogItem; products: Array<{ id: string; label: string; color: string }>; last: boolean }) {
  const p = products.find((x) => x.id === item.product);
  const progress = item.progress ?? 0;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '90px 1fr 120px 100px 100px 80px 40px',
      alignItems: 'center',
      gap: 14,
      padding: '12px 16px',
      borderBottom: last ? 'none' : '1px solid var(--border-subtle)',
    }}>
      <span className="mono" style={{ fontSize: 11, color: 'var(--fg-4)' }}>{item.id}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: 'var(--fg-1)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.completedAt && <span style={{ color: 'var(--fg-4)', textDecoration: 'line-through' }}>{item.title}</span>}
          {!item.completedAt && item.title}
        </div>
      </div>
      {p ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: p.color, fontWeight: 500 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.color }} />
          {p.label}
        </span>
      ) : <span />}
      <StageLabel stage={item.stage} flag={item.flag ?? null} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: item.flag === 'overdue' ? 'var(--danger-fg)' : 'var(--fg-3)' }}>
        {item.due ?? '—'}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 6, background: 'var(--bg-sunken)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: progress >= 75 ? 'var(--path-primary)' : progress >= 50 ? 'var(--path-primary-light-1)' : 'var(--path-primary-light-2)' }} />
        </div>
        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-4)', minWidth: 28, textAlign: 'right' }}>{progress}%</span>
      </div>
      <Avatar who={item.owner} size={22} />
    </div>
  );
}

function StageLabel({ stage, flag }: { stage: Stage; flag: 'overdue' | 'due-soon' | null }) {
  if (flag === 'overdue') return <span className="chip chip-overdue" style={{ fontSize: 9.5 }}>Overdue</span>;
  if (flag === 'due-soon') return <span className="chip chip-due" style={{ fontSize: 9.5 }}>Due soon</span>;
  const cls = stage === 'now' ? 'chip-now' : stage === 'next' ? 'chip-next' : 'chip-later';
  const label = stage === 'now' ? 'Now' : stage === 'next' ? 'Next' : 'Later';
  return <span className={`chip ${cls}`} style={{ fontSize: 9.5 }}>{label}</span>;
}

function StatCard({ label, value, sub, tone = 'default' }: { label: string; value: string | number; sub: string; tone?: 'default' | 'warn' }) {
  const color = tone === 'warn' ? 'var(--danger-fg)' : 'var(--fg-1)';
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 8,
      padding: '14px 16px',
    }}>
      <div className="meta" style={{ fontSize: 10, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 600, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginTop: 8 }}>{sub}</div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ v: string; l: string }>;
}) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg-3)' }}>
      <span>{label}:</span>
      <Dropdown<string>
        value={value}
        onChange={onChange}
        options={options.map((o) => ({ value: o.v, label: o.l }))}
        style={{ minWidth: 140 }}
        ariaLabel={label}
      />
    </label>
  );
}

// Suppress the unused FounderKey re-export warning — kept so the file exports stay aligned
export type { FounderKey };
