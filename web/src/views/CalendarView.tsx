import { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Avatar } from '../components/primitives';
import { Icon } from '../components/Icon';
import type { CalendarEvent, FounderKey } from '../lib/types';
import { useCalendar, useCreateEvent, useDeleteEvent } from '../lib/queries';
import { useSession } from '../lib/useSession';

const HOURS = Array.from({ length: 11 }, (_, i) => i + 8); // 8–18
const DAYS: { i: number; label: string; date: string }[] = [
  { i: 0, label: 'Mon', date: '13' },
  { i: 1, label: 'Tue', date: '14' },
  { i: 2, label: 'Wed', date: '15' },
  { i: 3, label: 'Thu', date: '16' },
  { i: 4, label: 'Fri', date: '17' },
];

const EVT_STYLE: Record<'D' | 'R' | 'SHARED', { bg: string; border: string; fg: string }> = {
  D: { bg: '#ECFDF3', border: '#49BC4E', fg: '#1A4F1D' },
  R: { bg: '#EEF2FF', border: '#3B82F6', fg: '#10298E' },
  SHARED: { bg: '#1E1E1E', border: '#1E1E1E', fg: '#fff' },
};

const HOUR_H = 52;
const START_Y = 8;

export function CalendarView() {
  const [mode, setMode] = useState<'day' | 'week' | 'month'>('week');
  const [showD, setShowD] = useState(true);
  const [showR, setShowR] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);

  const calQ = useCalendar();
  const createEvt = useCreateEvent();
  const deleteEvt = useDeleteEvent();
  const session = useSession();
  const me: FounderKey = (session.data?.key as FounderKey) ?? 'D';

  const all = calQ.data ?? [];
  const events = all.filter((e) =>
    e.who === 'SHARED'
    || (e.who === 'D' && showD)
    || (e.who === 'R' && showR)
  );

  return (
    <div className="screen-enter">
      <PageHeader
        title="Calendar"
        sub={<>Week of 13 April 2026. Two founders, one canvas. Synced via CalDAV (Fasthosts).</>}
        right={<>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: 2, background: 'var(--bg-sunken)', borderRadius: 8 }}>
            {(['day', 'week', 'month'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className="btn" style={{
                padding: '6px 12px',
                border: 0,
                background: mode === m ? 'var(--bg-surface)' : 'transparent',
                color: mode === m ? 'var(--fg-1)' : 'var(--fg-3)',
                fontWeight: mode === m ? 500 : 400,
                boxShadow: mode === m ? '0 1px 2px rgba(0,0,0,0.2)' : 'none',
              }}>
                {m[0].toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost"><Icon name="sync" size={14} /> Synced · 2 min ago</button>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}><Icon name="plus" size={14} /> New event</button>
        </>}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 14 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--fg-2)' }}>
          <input type="checkbox" checked={showD} onChange={(e) => setShowD(e.target.checked)} />
          <span style={{ width: 10, height: 10, borderRadius: 3, background: '#49BC4E' }} />
          Dave
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--fg-2)' }}>
          <input type="checkbox" checked={showR} onChange={(e) => setShowR(e.target.checked)} />
          <span style={{ width: 10, height: 10, borderRadius: 3, background: '#3B82F6' }} />
          Raj
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--fg-2)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: '#1E1E1E', border: '1px solid var(--border-default)' }} />
          Shared
        </label>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--danger-fg)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="flag" size={13} color="var(--danger-fg)" />
          1 clash on Wed — Jeff has a proposal
        </span>
      </div>

      {mode === 'week' && <WeekGrid events={events} onEventClick={setSelected} />}
      {mode !== 'week' && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 28, textAlign: 'center', color: 'var(--fg-3)' }}>
          <div style={{ fontSize: 13 }}>{mode === 'day' ? 'Day view — single column of events.' : 'Month view — collapsed density.'} (Coming next.)</div>
        </div>
      )}

      {/* Clash callout */}
      <div style={{
        marginTop: 16,
        border: '1px solid var(--danger-bg)',
        background: 'var(--danger-bg)',
        borderRadius: 8,
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}>
        <Avatar who="A" size={28} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--fg-1)', fontWeight: 500, marginBottom: 2 }}>Jeff · Clash on Wednesday</div>
          <div style={{ fontSize: 12.5, color: 'var(--fg-2)', lineHeight: 1.5 }}>
            <b>Notable investor call</b> (shared) overlaps <b>Ops review</b> (Raj). Proposed move: Ops review → Wed 15:30. Both diaries free.
          </div>
        </div>
        <button className="btn btn-ghost">Decline</button>
        <button className="btn btn-primary">Accept move</button>
      </div>

      {showNew && (
        <NewEventDialog
          me={me}
          onClose={() => setShowNew(false)}
          onCreate={(body) => createEvt.mutate(body, { onSuccess: () => setShowNew(false) })}
        />
      )}

      {selected && (
        <EventDetail
          event={selected}
          onClose={() => setSelected(null)}
          onDelete={() => { if (typeof selected.id === 'number') { deleteEvt.mutate(selected.id); setSelected(null); } }}
        />
      )}
    </div>
  );
}

function WeekGrid({ events, onEventClick }: { events: CalendarEvent[]; onEventClick: (e: CalendarEvent) => void }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
      {/* day header row */}
      <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(5, 1fr)', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-sunken)' }}>
        <div />
        {DAYS.map((d) => (
          <div key={d.i} style={{ padding: '12px 16px', borderLeft: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="meta" style={{ fontSize: 10 }}>{d.label}</span>
            <span style={{ fontSize: 18, fontWeight: 500, color: d.i === 2 ? 'var(--path-primary)' : 'var(--fg-1)' }}>{d.date}</span>
            {d.i === 0 && <span style={{ fontSize: 10, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)' }}>APR</span>}
          </div>
        ))}
      </div>
      {/* grid */}
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '60px repeat(5, 1fr)' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {HOURS.map((h) => (
            <div key={h} style={{ height: HOUR_H, padding: '4px 8px', borderTop: '1px solid var(--border-subtle)', textAlign: 'right' }}>
              <span className="meta" style={{ fontSize: 9 }}>{String(h).padStart(2, '0')}:00</span>
            </div>
          ))}
        </div>
        {DAYS.map((d) => (
          <div key={d.i} style={{ position: 'relative', borderLeft: '1px solid var(--border-subtle)' }}>
            {HOURS.map((h) => (
              <div key={h} style={{ height: HOUR_H, borderTop: '1px solid var(--border-subtle)' }} />
            ))}
            {events.filter((e) => e.day === d.i).map((e, idx) => {
              const top = (e.start - START_Y) * HOUR_H;
              const height = (e.end - e.start) * HOUR_H - 4;
              const style = EVT_STYLE[(e.who as 'D' | 'R' | 'SHARED')];
              const side: React.CSSProperties = e.who === 'R' ? { right: 4, left: '50%' } : e.who === 'D' ? { left: 4, right: '50%' } : { left: 4, right: 4 };
              return (
                <div key={idx} onClick={() => onEventClick(e)} style={{
                  position: 'absolute',
                  top: top + 1,
                  height,
                  ...side,
                  background: style.bg,
                  color: style.fg,
                  border: `1px solid ${style.border}`,
                  borderLeft: `3px solid ${style.border}`,
                  borderRadius: 5,
                  padding: '5px 8px',
                  fontFamily: 'var(--font-primary)',
                  fontSize: 11.5,
                  lineHeight: 1.3,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  boxShadow: e.flag === 'clash' ? '0 0 0 2px rgba(255,82,82,0.4)' : 'none',
                }}>
                  <div style={{ fontWeight: 500, color: style.fg }}>{e.title}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, opacity: 0.8 }}>
                    {fmt(e.start)}–{fmt(e.end)}
                  </div>
                </div>
              );
            })}
            {d.i === 0 && (
              <div style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: (10.7 - START_Y) * HOUR_H,
                borderTop: '2px solid var(--danger-fg)',
                zIndex: 2,
              }}>
                <div style={{ position: 'absolute', left: -4, top: -5, width: 8, height: 8, borderRadius: '50%', background: 'var(--danger-fg)' }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function fmt(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}

function NewEventDialog({ me, onClose, onCreate }: {
  me: FounderKey;
  onClose: () => void;
  onCreate: (body: Omit<CalendarEvent, 'id'>) => void;
}) {
  const [title, setTitle] = useState('');
  const [who, setWho] = useState<'D' | 'R' | 'SHARED'>(me);
  const [kind, setKind] = useState<'shared' | 'meet' | 'deep' | 'personal'>('meet');
  const [day, setDay] = useState(0);
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('11:00');

  const hoursFrom = (s: string) => { const [h, m] = s.split(':').map((x) => parseInt(x, 10) || 0); return h + m / 60; };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onCreate({
      title: title.trim(),
      day,
      start: hoursFrom(start),
      end: hoursFrom(end),
      who,
      kind,
    });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,26,0.55)' }} />
      <form onSubmit={submit} style={{
        position: 'relative',
        width: 420,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 10,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--fg-1)' }}>New event</h2>
          <button type="button" onClick={onClose} className="btn btn-subtle btn-icon"><Icon name="close" size={14} /></button>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>Title</span>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="input" style={{ width: '100%', height: 34 }} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>Day</span>
            <select value={day} onChange={(e) => setDay(parseInt(e.target.value, 10))} className="input" style={{ height: 34, padding: '0 8px' }}>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>Start</span>
            <input value={start} onChange={(e) => setStart(e.target.value)} className="input" style={{ height: 34 }} placeholder="09:00" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>End</span>
            <input value={end} onChange={(e) => setEnd(e.target.value)} className="input" style={{ height: 34 }} placeholder="10:00" />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>Attendee</span>
            <select value={who} onChange={(e) => setWho(e.target.value as any)} className="input" style={{ height: 34, padding: '0 8px' }}>
              <option value="D">Dave</option>
              <option value="R">Raj</option>
              <option value="SHARED">Shared</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>Type</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as any)} className="input" style={{ height: 34, padding: '0 8px' }}>
              <option value="meet">Meeting</option>
              <option value="shared">Shared</option>
              <option value="deep">Deep work</option>
              <option value="personal">Personal</option>
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!title.trim()}>Create</button>
        </div>
      </form>
    </div>
  );
}

function EventDetail({ event, onClose, onDelete }: { event: CalendarEvent; onClose: () => void; onDelete: () => void }) {
  const dayLabel = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][event.day] ?? '';
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,26,0.55)' }} />
      <div style={{
        position: 'relative',
        width: 360,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 10,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--fg-1)' }}>{event.title}</h2>
          <button onClick={onClose} className="btn btn-subtle btn-icon"><Icon name="close" size={14} /></button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--fg-2)' }}>
          {dayLabel} · {fmt(event.start)}–{fmt(event.end)}
        </div>
        <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>
          {event.who === 'SHARED' ? 'Shared' : event.who === 'D' ? 'Dave' : 'Raj'} · {event.kind ?? 'meet'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-subtle" style={{ color: 'var(--danger-fg)' }} onClick={() => { if (confirm('Delete this event?')) onDelete(); }}>
            <Icon name="close" size={12} /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}
