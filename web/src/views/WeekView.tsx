import { useState } from 'react';
import { Avatar, BacklogRow, HeadlineCard } from '../components/primitives';
import { Icon } from '../components/Icon';
import { JeffArticleModal } from '../components/JeffArticleModal';
import { PRODUCT_DOCS } from '../lib/seed';
import { useUI } from '../lib/store';
import { useSession } from '../lib/useSession';
import { useBacklog, useCalendar, useJeffTodayFeed, useProducts, useRunAgentJob, useTasks } from '../lib/queries';
import type { JeffTodayFeedItem } from '../lib/api';
import type { CalendarEvent, Doc, FounderKey } from '../lib/types';

const KIND_LABEL: Record<string, string> = {
  'daily-news':           "Today's news",
  'weekly-summary':       'Weekly summary',
  'competitor-features':  'Competitor watch',
  'research-refresh':     'Research refresh',
};

export function WeekView({ now }: { now: Date }) {
  const navigate = useUI((s) => s.navigate);
  const session = useSession();
  const me: FounderKey = (session.data?.key as FounderKey) ?? 'D';

  const backlogQ = useBacklog();
  const tasksQ = useTasks();
  const calQ = useCalendar();
  const productsQ = useProducts();

  const items = backlogQ.data ?? [];
  const tasks = tasksQ.data ?? [];
  const events = calQ.data ?? [];

  // Completed items are hidden from Week — they belong on the Backlog's "Show done" view.
  const open = items.filter((b) => !b.completedAt);
  const nowItems = open.filter((b) => b.stage === 'now');
  const dueThisWeek = open.filter((b) => b.flag === 'due-soon' || b.flag === 'overdue');
  const tasksToday = tasks.filter((t) => !t.done && (t.due === 'today' || t.due === 'tomorrow'));
  const todayEvents = events.filter((e) => e.day === 0).sort((a, b) => a.start - b.start);
  const recentDocs = PRODUCT_DOCS.filter((d) => d.updated.includes('today') || d.updated.includes('yesterday')).slice(0, 3);

  const meta = now
    .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
    .replace(',', ' ·')
    .toUpperCase();
  const weekNo = getWeekNumber(now);

  const overdueCount = open.filter((b) => b.flag === 'overdue').length;
  const dueCount = open.filter((b) => b.flag === 'due-soon').length;
  const dDave = nowItems.filter((i) => i.owner === 'D').length;
  const dRaj = nowItems.filter((i) => i.owner === 'R').length;
  const greetingName = session.data?.displayName ?? 'Dave';

  return (
    <div className="screen-enter">
      {/* Editorial opener */}
      <div style={{ marginBottom: 32 }}>
        <div className="meta" style={{ fontSize: 10, marginBottom: 10 }}>
          {meta} · WEEK {weekNo} · BOTH ONLINE
        </div>
        <h1 style={{
          fontSize: 36, fontWeight: 600, color: 'var(--fg-1)',
          margin: 0, letterSpacing: '-0.015em', lineHeight: 1.15,
          maxWidth: 780,
        }}>
          Good morning, {greetingName}.{' '}
          <span style={{ color: 'var(--fg-3)' }}>
            {nowItems.length} in flight, {dueThisWeek.length} needing attention, {todayEvents.length} meetings today.
          </span>
        </h1>
      </div>

      {/* Headline strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        <HeadlineCard label="In flight"      value={nowItems.length}     foot={`${dDave} Dave · ${dRaj} Raj`}            onClick={() => navigate('backlog')} />
        <HeadlineCard label="Due / overdue"  value={dueThisWeek.length}  foot={`${overdueCount} overdue, ${dueCount} due this week`} tone="warn"  onClick={() => navigate('backlog')} />
        <HeadlineCard label="Meetings today" value={todayEvents.length}  foot="Next: Bank partner intro · 11:00"        onClick={() => navigate('calendar')} />
        <HeadlineCard label="Jeff's jobs"    value={3}                   foot="Last run 07:45 · 1 proposal" tone="accent" onClick={() => navigate('jeff')} />
      </div>

      {/* Two-column split */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 24 }} className="week-split">
        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <Section title="Now" actionLabel="Open backlog →" onAction={() => navigate('backlog')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {nowItems.map((b) => <BacklogRow key={b.id} item={b} onClick={() => navigate('backlog', b.id)} />)}
            </div>
          </Section>

          <Section title="Needs attention" sub="Overdue + due this week">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dueThisWeek.map((b) => <BacklogRow key={b.id} item={b} onClick={() => navigate('backlog', b.id)} />)}
            </div>
          </Section>

          <Section title="Jeff · week so far" actionLabel="See all runs →" onAction={() => navigate('jeff')}>
            <JeffSummary />
          </Section>
        </div>

        {/* RIGHT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <Section title="Today" actionLabel="Week →" onAction={() => navigate('calendar')}>
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 8, padding: '16px 18px',
            }}>
              {todayEvents.map((e, i) => (
                <TodayRow key={i} event={e} last={i === todayEvents.length - 1} />
              ))}
            </div>
          </Section>

          <Section title="Tasks" actionLabel="All →" onAction={() => navigate('tasks')}>
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 8, overflow: 'hidden',
            }}>
              {tasksToday.map((t, i) => (
                <div key={t.id} className="row-hover" style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px',
                  borderBottom: i < tasksToday.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                }}>
                  <span style={{ width: 14, height: 14, border: '1.5px solid var(--border-strong)', borderRadius: 3, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: 'var(--fg-1)', flex: 1 }}>{t.title}</span>
                  <span className="meta" style={{ fontSize: 9.5, color: t.due === 'today' ? 'var(--danger-fg)' : 'var(--fg-4)' }}>{t.due}</span>
                  <Avatar who={t.owner} size={18} />
                </div>
              ))}
            </div>
          </Section>

          <Section title="Recently edited" actionLabel="All →" onAction={() => navigate('docs')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentDocs.map((d) => <DocRow key={d.id} doc={d} products={productsQ.data ?? []} />)}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, sub, actionLabel, onAction, children }: {
  title: string;
  sub?: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="section-h">
        <h2>{title}</h2>
        {sub && <span className="meta">{sub}</span>}
        {actionLabel && onAction && (
          <a onClick={onAction} style={{ fontSize: 12, color: 'var(--path-primary)', cursor: 'pointer' }}>
            {actionLabel}
          </a>
        )}
      </div>
      {children}
    </div>
  );
}

function TodayRow({ event, last }: { event: CalendarEvent; last: boolean }) {
  const time = `${String(Math.floor(event.start)).padStart(2, '0')}:${event.start % 1 ? '30' : '00'}`;
  const accent = event.who === 'SHARED' ? 'var(--fg-1)' : event.who === 'D' ? 'var(--path-primary-light-2)' : '#3B82F6';
  const subtitle = `${event.who === 'SHARED' ? 'Shared' : event.who === 'D' ? 'Dave' : 'Raj'} · ${Math.round((event.end - event.start) * 60)}m`;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 14,
      padding: '10px 0',
      borderBottom: last ? 'none' : '1px solid var(--border-subtle)',
    }}>
      <span className="meta" style={{ fontSize: 10, width: 48, flexShrink: 0, paddingTop: 2 }}>{time}</span>
      <span style={{ width: 3, alignSelf: 'stretch', background: accent, borderRadius: 2 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: 'var(--fg-1)', fontWeight: 500 }}>{event.title}</div>
        <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>{subtitle}</div>
      </div>
    </div>
  );
}

function DocRow({ doc, products }: { doc: Doc; products: Array<{ id: string; label: string; color: string }> }) {
  const p = doc.product ? products.find((x) => x.id === doc.product) : null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px',
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6,
      cursor: 'pointer',
    }} className="row-hover">
      <Icon name="docs" size={14} color="var(--fg-3)" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--fg-1)', fontWeight: 500 }}>{doc.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          {p && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--fg-3)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.color }} />{p.label}
            </span>
          )}
          <span className="meta" style={{ fontSize: 9.5 }}>{doc.updated.toUpperCase()} · {doc.size.toUpperCase()}</span>
        </div>
      </div>
      <Avatar who={doc.by} size={20} />
    </div>
  );
}

function JeffSummary() {
  const navigate = useUI((s) => s.navigate);
  const feedQ = useJeffTodayFeed();
  const runNow = useRunAgentJob();
  const [openItem, setOpenItem] = useState<JeffTodayFeedItem | null>(null);

  const runs = feedQ.data?.runs ?? [];

  const onGenerate = async () => {
    try { await runNow.mutateAsync('weekly-summary'); }
    catch (err) { alert(`Jeff couldn't draft the summary: ${(err as Error).message}`); }
  };

  // Empty state — nothing has run today (and no recent weekly summary either).
  if (!runs.length) {
    return (
      <div style={{
        border: '1px solid var(--border-subtle)', borderRadius: 8, background: 'var(--bg-surface)',
        padding: '18px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <Avatar who="A" size={30} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, color: 'var(--fg-1)', fontWeight: 500, marginBottom: 4 }}>
              Nothing from Jeff yet today.
            </div>
            <div style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.55 }}>
              Scheduled jobs will appear here as Jeff runs them. Click "Draft now" to produce a weekly summary right away.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={onGenerate} disabled={runNow.isPending}>
                <Icon name="sparkle" size={12} /> {runNow.isPending ? 'Drafting…' : 'Draft now'}
              </button>
              <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => navigate('jeff')}>
                Open Jeff
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {runs.map((item) => (
          <JeffFeedCard key={item.id} item={item} onOpen={() => setOpenItem(item)} />
        ))}
      </div>
      {openItem && <JeffArticleModal article={openItem} onClose={() => setOpenItem(null)} />}
    </>
  );
}

/** One card per session run today. Click anywhere on the card to open the full article in
 *  the branded modal. Same visual language as the rest of the Today page. */
function JeffFeedCard({ item, onOpen }: { item: JeffTodayFeedItem; onOpen: () => void }) {
  const label = KIND_LABEL[item.kind] ?? item.kind;
  return (
    <div
      onClick={onOpen}
      style={{
        border: '1px solid var(--border-subtle)', borderRadius: 8, background: 'var(--bg-surface)',
        padding: '14px 18px', cursor: 'pointer', transition: 'background 0.12s',
      }}
      className="row-hover"
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <Avatar who="A" size={26} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: 'var(--path-primary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
            <span style={{ fontSize: 13, color: 'var(--fg-1)', fontWeight: 500 }}>{item.title}</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--fg-3)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
            {item.summary}
          </div>
        </div>
        <span className="meta" style={{ fontSize: 10, flexShrink: 0 }}>{formatWeeklyAgo(item.updatedAt)}</span>
      </div>
    </div>
  );
}

function formatWeeklyAgo(iso: string): string {
  const t = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function getWeekNumber(d: Date): number {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  return 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
}
