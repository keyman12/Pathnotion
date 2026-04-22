import { useState } from 'react';
import { Avatar, Badge, Card, Dot, MetaLabel, Tile } from '../components/primitives';
import { Icon } from '../components/Icon';
import { AGENT_RUNS, BACKLOG, EVENTS, TASKS } from '../lib/seed';
import { useUI } from '../lib/store';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export function MobileWeekView({ now }: { now: Date }) {
  const navigate = useUI((s) => s.navigate);
  const todayIdx = Math.min(4, Math.max(0, (now.getDay() + 6) % 7));
  const [dayIdx, setDayIdx] = useState(todayIdx);
  const dayEvents = EVENTS.filter((e) => e.day === dayIdx);
  const nowItems = BACKLOG.filter((b) => b.stage === 'now' && !b.completedAt);

  return (
    <div className="screen-enter">
      <div style={{ padding: '4px 0 14px' }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em' }}>This week</div>
        <div style={{ fontSize: 12.5, color: 'var(--fg-3)' }}>
          {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 14, marginBottom: 14 }}>
        {DAYS.map((d, i) => {
          const active = i === dayIdx;
          return (
            <button key={d} onClick={() => setDayIdx(i)} style={{
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'center',
              minWidth: 56,
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              background: active ? 'var(--path-primary)' : 'var(--bg-surface)',
              color: active ? 'var(--fg-on-primary)' : 'var(--fg-2)',
              border: '1px solid var(--border-subtle)',
              fontWeight: 500,
            }}>
              <span style={{ fontSize: 10.5, letterSpacing: 0.08 + 'em', textTransform: 'uppercase' }}>{d}</span>
              <span style={{ fontSize: 17, fontWeight: 600 }}>{13 + i}</span>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <Tile style={{ padding: 14, minHeight: 86 }}>
          <MetaLabel>Focus</MetaLabel>
          <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1 }}>{nowItems.length}</div>
          <div style={{ fontSize: 11.5, color: 'var(--fg-3)' }}>now items</div>
        </Tile>
        <Tile style={{ padding: 14, minHeight: 86 }}>
          <MetaLabel>Today</MetaLabel>
          <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1 }}>{dayEvents.length}</div>
          <div style={{ fontSize: 11.5, color: 'var(--fg-3)' }}>events</div>
        </Tile>
        <Tile style={{ padding: 14, minHeight: 86 }}>
          <MetaLabel>Pulse</MetaLabel>
          <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1, color: 'var(--path-primary)' }}>+12%</div>
          <div style={{ fontSize: 11.5, color: 'var(--fg-3)' }}>vs last week</div>
        </Tile>
        <Tile style={{ padding: 14, minHeight: 86, cursor: 'pointer' }} onClick={() => navigate('jeff')}>
          <MetaLabel>Jeff</MetaLabel>
          <div style={{ fontSize: 13, fontWeight: 600 }}>1 clash found</div>
          <div style={{ fontSize: 11.5, color: 'var(--fg-3)' }}>tap to review</div>
        </Tile>
      </div>

      <Card style={{ marginBottom: 14, padding: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{DAYS[dayIdx]} · schedule</div>
        {dayEvents.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--fg-3)' }}>Nothing scheduled.</div>}
        {dayEvents.map((e, i) => {
          const col = e.kind === 'shared' || e.who === 'SHARED' ? '#f0a000' : e.who === 'D' ? '#35d37a' : '#6bb3ff';
          return (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: i < dayEvents.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
              <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: col }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{e.title}</div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{formatRange(e.start, e.end)} · {e.who}</div>
              </div>
              {e.flag === 'clash' && <Badge tone="danger">clash</Badge>}
            </div>
          );
        })}
      </Card>

      <Card style={{ marginBottom: 14, padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Tasks</div>
          <button onClick={() => navigate('tasks')} style={{ fontSize: 12, color: 'var(--fg-3)' }}>Open</button>
        </div>
        {TASKS.filter((t) => !t.done && ['today','tomorrow'].includes(t.due)).slice(0,4).map((t) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
            <Icon name="circle" size={14} color="var(--fg-4)" />
            <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>{t.title}</div>
            <Avatar who={t.owner} size={20} />
          </div>
        ))}
      </Card>

      <Card style={{ padding: 14, cursor: 'pointer' }} onClick={() => navigate('jeff')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Avatar who="J" size={28} />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Jeff</div>
            <div style={{ fontSize: 11.5, color: 'var(--fg-3)' }}>Weekly summary · {AGENT_RUNS[0].when}</div>
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--fg-2)' }}>{AGENT_RUNS[0].summary}</div>
      </Card>
    </div>
  );
}

function formatRange(s: number, e: number) {
  const f = (h: number) => `${Math.floor(h)}:${Math.round((h - Math.floor(h)) * 60).toString().padStart(2,'0')}`;
  return `${f(s)}–${f(e)}`;
}
