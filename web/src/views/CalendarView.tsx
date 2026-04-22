import { useMemo, useRef, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/Icon';
import type { CalendarEvent, FounderKey } from '../lib/types';
import { useCalendar, useCreateEvent, useDeleteEvent, useGoogleCalendarStatus, useSyncCalendar } from '../lib/queries';
import { useSession } from '../lib/useSession';

const HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 7–19

const EVT_STYLE: Record<'D' | 'R' | 'SHARED', { bg: string; border: string; fg: string }> = {
  D: { bg: '#ECFDF3', border: '#49BC4E', fg: '#1A4F1D' },
  R: { bg: '#EEF2FF', border: '#3B82F6', fg: '#10298E' },
  // Warm cream so shared events read clearly on both light and dark surfaces.
  SHARED: { bg: '#FEF3C7', border: '#F0A000', fg: '#7C2D12' },
};

const HOUR_H = 52;
const START_Y = 7;

function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const jsDay = out.getDay();            // Sun=0..Sat=6
  const mondayOffset = (jsDay + 6) % 7;  // Mon=0
  out.setDate(out.getDate() - mondayOffset);
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function dayIndex(iso: string, weekStart: Date): number | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const start = new Date(weekStart);
  const diff = Math.floor((d.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return diff >= 0 && diff < 5 ? diff : null;  // Mon..Fri
}

function hourOf(iso: string): number {
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
}

function friendlyWeekLabel(weekStart: Date): string {
  const end = addDays(weekStart, 4);
  const sameMonth = weekStart.getMonth() === end.getMonth();
  const fmt = (d: Date, withMonth: boolean) =>
    withMonth ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : String(d.getDate());
  return sameMonth
    ? `${fmt(weekStart, false)}–${fmt(end, true)} ${end.getFullYear()}`
    : `${fmt(weekStart, true)} – ${fmt(end, true)} ${end.getFullYear()}`;
}

export function CalendarView() {
  const [mode, setMode] = useState<'day' | 'week' | 'month'>('week');
  const [showD, setShowD] = useState(true);
  const [showR, setShowR] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  const calQ = useCalendar();
  const createEvt = useCreateEvent();
  const deleteEvt = useDeleteEvent();
  const sync = useSyncCalendar();
  const googleStatus = useGoogleCalendarStatus();
  const session = useSession();
  const me: FounderKey = (session.data?.key as FounderKey) ?? 'D';

  const all = calQ.data ?? [];

  // Normalise an event into a week slot (day 0..4 + start/end hours) — preferring ISO when present.
  const placed = useMemo(() => all.map((e) => {
    if (e.startIso && e.endIso) {
      const d = dayIndex(e.startIso, weekStart);
      if (d == null) return null;
      return { ...e, day: d, start: hourOf(e.startIso), end: hourOf(e.endIso) } as CalendarEvent;
    }
    // Legacy seed events carry day/start/end natively — only show them when the user is on
    // the demo week (13 Apr 2026) so they don't look stranded on random weeks.
    const demoWeek = new Date('2026-04-13T00:00:00');
    if (weekStart.getTime() === startOfWeek(demoWeek).getTime()) return e;
    return null;
  }).filter(Boolean) as CalendarEvent[], [all, weekStart]);

  const events = placed.filter((e) => {
    if (e.who === 'SHARED') return true;
    if (e.who === 'D' && showD) return true;
    if (e.who === 'R' && showR) return true;
    return false;
  });

  const days = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => {
      const d = addDays(weekStart, i);
      return {
        i,
        label: d.toLocaleDateString('en-GB', { weekday: 'short' }),
        date: String(d.getDate()),
        isToday: isSameDate(d, new Date()),
      };
    });
  }, [weekStart]);

  const thisWeekIsCurrent = isSameDate(weekStart, startOfWeek(new Date()));

  const syncLabel = sync.isPending ? 'Syncing…'
    : googleStatus.data?.lastSyncAt
      ? `Synced ${timeAgo(googleStatus.data.lastSyncAt)}`
      : googleStatus.data?.connected ? 'Synced' : 'Not connected';

  return (
    <div className="screen-enter">
      <PageHeader
        title="Calendar"
        sub={<>{friendlyWeekLabel(weekStart)}. Your events in green, Raj's in blue.</>}
        right={<>
          <div style={{ display: 'inline-flex', border: '1px solid var(--border-default)', borderRadius: 6, background: 'var(--bg-surface)', overflow: 'hidden' }}>
            <button className="btn btn-ghost" style={{ padding: '6px 10px', borderRadius: 0 }} onClick={() => setWeekStart((w) => addDays(w, -7))} title="Previous week">
              <Icon name="chevron-left" size={13} />
            </button>
            <button className="btn btn-ghost" style={{ padding: '6px 12px', borderRadius: 0, opacity: thisWeekIsCurrent ? 0.5 : 1 }} disabled={thisWeekIsCurrent} onClick={() => setWeekStart(startOfWeek(new Date()))}>
              Today
            </button>
            <button className="btn btn-ghost" style={{ padding: '6px 10px', borderRadius: 0 }} onClick={() => setWeekStart((w) => addDays(w, 7))} title="Next week">
              <Icon name="chevron-right" size={13} />
            </button>
          </div>
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
          <button className="btn btn-ghost" onClick={() => sync.mutate()} disabled={sync.isPending || !googleStatus.data?.connected} title={googleStatus.data?.connected ? 'Pull latest events from Google' : 'Connect Google in Settings → Calendar'}>
            <Icon name="sync" size={14} /> {syncLabel}
          </button>
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
          <span style={{ width: 10, height: 10, borderRadius: 3, background: '#F0A000' }} />
          Shared
        </label>
        <div style={{ flex: 1 }} />
        {!googleStatus.data?.connected && googleStatus.data?.configured && (
          <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>
            <Icon name="settings" size={12} /> Connect Google in <b>Settings → Calendar</b>
          </span>
        )}
      </div>

      {mode === 'week' && (
        <WeekGrid
          events={events}
          days={days}
          weekStart={weekStart}
          onEventClick={setSelected}
          onCreate={(body) => createEvt.mutate(body)}
          me={me}
        />
      )}
      {mode !== 'week' && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 28, textAlign: 'center', color: 'var(--fg-3)' }}>
          <div style={{ fontSize: 13 }}>{mode === 'day' ? 'Day view — single column of events.' : 'Month view — collapsed density.'} (Coming next.)</div>
        </div>
      )}

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

function snapHour(h: number): number {
  // 15-minute snap.
  return Math.round(h * 4) / 4;
}

function WeekGrid({ events, days, weekStart, onEventClick, onCreate, me }: {
  events: CalendarEvent[];
  days: { i: number; label: string; date: string; isToday: boolean }[];
  weekStart: Date;
  onEventClick: (e: CalendarEvent) => void;
  onCreate: (body: Omit<CalendarEvent, 'id'>) => void;
  me: FounderKey;
}) {
  const now = new Date();
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const todayIdx = days.findIndex((d) => d.isToday);

  // ─── Drag-to-create state ────────────────────────────────────────────────
  const [draft, setDraft] = useState<{ day: number; start: number; end: number } | null>(null);
  const [pending, setPending] = useState<{ day: number; start: number; end: number } | null>(null);
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);

  const pointerToHour = (e: React.MouseEvent | MouseEvent, dayIdx: number): number => {
    const col = colRefs.current[dayIdx];
    if (!col) return START_Y;
    const r = col.getBoundingClientRect();
    const y = (e as MouseEvent).clientY - r.top;
    return snapHour(START_Y + Math.max(0, y) / HOUR_H);
  };

  const startDrag = (e: React.MouseEvent, dayIdx: number) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-event]')) return;  // clicking an event, not the grid
    e.preventDefault();
    const startHour = pointerToHour(e, dayIdx);
    setDraft({ day: dayIdx, start: startHour, end: startHour + 0.5 });

    const onMove = (me: MouseEvent) => {
      const cur = pointerToHour(me, dayIdx);
      setDraft((d) => d ? ({
        ...d,
        start: Math.min(startHour, cur),
        end: Math.max(startHour + 0.25, cur === startHour ? startHour + 0.5 : cur),
      }) : null);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setDraft((d) => {
        if (d) setPending(d);
        return null;
      });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
      {/* day header row */}
      <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(5, 1fr)', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-sunken)' }}>
        <div />
        {days.map((d) => (
          <div key={d.i} style={{ padding: '12px 16px', borderLeft: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="meta" style={{ fontSize: 10 }}>{d.label}</span>
            <span style={{ fontSize: 18, fontWeight: 500, color: d.isToday ? 'var(--path-primary)' : 'var(--fg-1)' }}>{d.date}</span>
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
        {days.map((d) => (
          <div
            key={d.i}
            ref={(el) => { colRefs.current[d.i] = el; }}
            onMouseDown={(e) => startDrag(e, d.i)}
            style={{ position: 'relative', borderLeft: '1px solid var(--border-subtle)', cursor: 'crosshair' }}
          >
            {HOURS.map((h) => (
              <div key={h} style={{ height: HOUR_H, borderTop: '1px solid var(--border-subtle)' }} />
            ))}
            {events.filter((e) => e.day === d.i).map((e, idx) => {
              const top = (e.start - START_Y) * HOUR_H;
              const height = Math.max(16, (e.end - e.start) * HOUR_H - 4);
              const style = EVT_STYLE[(e.who as 'D' | 'R' | 'SHARED')] ?? EVT_STYLE.SHARED;
              const side: React.CSSProperties = e.who === 'R' ? { right: 4, left: '50%' } : e.who === 'D' ? { left: 4, right: '50%' } : { left: 4, right: 4 };
              return (
                <div
                  key={idx}
                  data-event
                  onClick={(ev) => { ev.stopPropagation(); onEventClick(e); }}
                  onMouseDown={(ev) => ev.stopPropagation()}
                  style={{
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
                  }}
                >
                  <div style={{ fontWeight: 500, color: style.fg }}>{e.title}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, opacity: 0.8 }}>
                    {fmt(e.start)}–{fmt(e.end)}
                  </div>
                </div>
              );
            })}
            {/* Drag-in-progress ghost */}
            {draft && draft.day === d.i && (
              <div style={{
                position: 'absolute',
                top: (draft.start - START_Y) * HOUR_H + 1,
                height: Math.max(16, (draft.end - draft.start) * HOUR_H - 4),
                left: 4,
                right: 4,
                background: 'var(--path-primary-tint)',
                border: '1px dashed var(--path-primary)',
                borderRadius: 5,
                padding: '5px 8px',
                fontFamily: 'var(--font-primary)',
                fontSize: 11.5,
                color: 'var(--fg-1)',
                pointerEvents: 'none',
                zIndex: 3,
              }}>
                <div className="mono" style={{ fontSize: 9.5, color: 'var(--fg-3)' }}>
                  {fmt(draft.start)}–{fmt(draft.end)}
                </div>
              </div>
            )}
            {/* Inline title popover after release */}
            {pending && pending.day === d.i && (
              <NewEventQuickPopover
                slot={pending}
                me={me}
                onCancel={() => setPending(null)}
                onCreate={(title, who, kind) => {
                  onCreate({
                    title,
                    who,
                    kind,
                    day: pending.day,
                    start: pending.start,
                    end: pending.end,
                    startIso: hourToIso(weekStart, pending.day, pending.start),
                    endIso: hourToIso(weekStart, pending.day, pending.end),
                  });
                  setPending(null);
                }}
              />
            )}
            {todayIdx === d.i && nowHour >= START_Y && nowHour <= START_Y + HOURS.length && (
              <div style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: (nowHour - START_Y) * HOUR_H,
                borderTop: '2px solid var(--danger-fg)',
                zIndex: 2,
                pointerEvents: 'none',
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

function hourToIso(weekStart: Date, dayIdx: number, hour: number): string {
  const d = addDays(weekStart, dayIdx);
  const wholeHours = Math.floor(hour);
  const minutes = Math.round((hour - wholeHours) * 60);
  d.setHours(wholeHours, minutes, 0, 0);
  return d.toISOString();
}

function NewEventQuickPopover({ slot, me, onCancel, onCreate }: {
  slot: { day: number; start: number; end: number };
  me: FounderKey;
  onCancel: () => void;
  onCreate: (title: string, who: 'D' | 'R' | 'SHARED', kind: 'meet' | 'shared' | 'deep' | 'personal') => void;
}) {
  const [title, setTitle] = useState('');
  const [who, setWho] = useState<'D' | 'R' | 'SHARED'>(me);

  const submit = () => {
    if (!title.trim()) return;
    onCreate(title.trim(), who, 'meet');
  };

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: (slot.start - START_Y) * HOUR_H + 1,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 220,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 6,
        boxShadow: '0 10px 32px rgba(0,0,0,0.35)',
        padding: 10,
        zIndex: 20,
      }}
    >
      <div className="mono" style={{ fontSize: 9.5, color: 'var(--fg-4)', marginBottom: 6 }}>
        {fmt(slot.start)}–{fmt(slot.end)}
      </div>
      <input
        autoFocus
        className="input"
        placeholder="Add title…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
          else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
        style={{ width: '100%', height: 30, marginBottom: 8 }}
      />
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {(['D', 'R', 'SHARED'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setWho(k)}
            style={{
              flex: 1,
              padding: '4px 6px',
              border: '1px solid ' + (who === k ? 'var(--path-primary)' : 'var(--border-subtle)'),
              borderRadius: 4,
              background: who === k ? 'var(--path-primary-tint)' : 'transparent',
              color: 'var(--fg-1)',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            {k === 'SHARED' ? 'Shared' : k === 'D' ? 'Dave' : 'Raj'}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={submit} disabled={!title.trim()}>Create</button>
      </div>
    </div>
  );
}

function isSameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
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
  // Default to today, 10:00 → 11:00, in the user's local timezone.
  const todayIso = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState('');
  const [who, setWho] = useState<'D' | 'R' | 'SHARED'>(me);
  const [date, setDate] = useState(todayIso);
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('11:00');

  const hoursFrom = (s: string) => { const [h, m] = s.split(':').map((x) => parseInt(x, 10) || 0); return h + m / 60; };
  const dayIndexOf = (iso: string) => {
    const d = new Date(iso);
    return ((d.getDay() + 6) % 7); // Mon=0..Sun=6
  };
  const isoFor = (dateIso: string, timeStr: string): string => {
    const [hh, mm] = timeStr.split(':').map((x) => parseInt(x, 10) || 0);
    const d = new Date(dateIso);
    d.setHours(hh, mm, 0, 0);
    return d.toISOString();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date || !start || !end) return;
    onCreate({
      title: title.trim(),
      day: dayIndexOf(date),
      start: hoursFrom(start),
      end: hoursFrom(end),
      who,
      kind: 'meet',
      startIso: isoFor(date, start),
      endIso: isoFor(date, end),
    });
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 40,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, boxSizing: 'border-box',
    }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,26,0.55)' }} />
      <form onSubmit={submit} style={{
        position: 'relative',
        width: '100%',
        maxWidth: 420,
        maxHeight: '90vh',
        overflow: 'auto',
        boxSizing: 'border-box',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 10,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--fg-1)' }}>New event</h2>
          <button type="button" onClick={onClose} className="btn btn-subtle btn-icon"><Icon name="close" size={14} /></button>
        </div>

        <Field label="Title">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's it about?"
            className="input"
            style={{ width: '100%', height: 36, boxSizing: 'border-box' }}
          />
        </Field>

        <Field label="Date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input"
            style={{ width: '100%', height: 36, boxSizing: 'border-box', fontFamily: 'var(--font-mono)' }}
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
          <Field label="Start">
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="input"
              style={{ width: '100%', height: 36, boxSizing: 'border-box', fontFamily: 'var(--font-mono)' }}
            />
          </Field>
          <Field label="End">
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="input"
              style={{ width: '100%', height: 36, boxSizing: 'border-box', fontFamily: 'var(--font-mono)' }}
            />
          </Field>
        </div>

        <Field label="Owner">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
            {(['D', 'R', 'SHARED'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setWho(k)}
                style={{
                  padding: '7px 4px',
                  border: '1px solid ' + (who === k ? 'var(--path-primary)' : 'var(--border-subtle)'),
                  borderRadius: 6,
                  background: who === k ? 'var(--path-primary-tint)' : 'transparent',
                  color: 'var(--fg-1)',
                  fontSize: 12.5,
                  cursor: 'pointer',
                }}
              >
                {k === 'SHARED' ? 'Shared' : k === 'D' ? 'Dave' : 'Raj'}
              </button>
            ))}
          </div>
        </Field>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!title.trim()}>Create</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
      {children}
    </label>
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
