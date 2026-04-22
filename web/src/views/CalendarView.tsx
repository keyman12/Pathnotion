import { useMemo, useRef, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/Icon';
import type { CalendarEvent, FounderKey } from '../lib/types';
import { useCalendar, useCreateEvent, useDeleteEvent, useGoogleCalendarStatus, usePatchEvent, useSyncCalendar } from '../lib/queries';
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

function friendlyDayLabel(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function friendlyMonthLabel(d: Date): string {
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function startOfMonth(d: Date): Date {
  const out = new Date(d);
  out.setDate(1);
  out.setHours(0, 0, 0, 0);
  return out;
}

function addMonths(d: Date, n: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + n);
  return out;
}

export function CalendarView() {
  const [mode, setMode] = useState<'day' | 'week' | 'month'>('week');
  const [showD, setShowD] = useState(true);
  const [showR, setShowR] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  // Single anchor date that every view derives from. Stays put when you switch modes so the
  // navigation feels continuous — click through a week, toggle to month, you land on that month.
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const weekStart = useMemo(() => startOfWeek(anchor), [anchor]);
  const monthStart = useMemo(() => startOfMonth(anchor), [anchor]);

  const calQ = useCalendar();
  const createEvt = useCreateEvent();
  const patchEvt = usePatchEvent();
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

  // All events for day/month views — not slot-placed, just with original ISO + who + title.
  const filteredAll = useMemo(() => all.filter((e) => {
    if (e.who === 'SHARED') return true;
    if (e.who === 'D' && showD) return true;
    if (e.who === 'R' && showR) return true;
    return false;
  }), [all, showD, showR]);

  const isToday = mode === 'day' ? isSameDate(anchor, new Date())
    : mode === 'week' ? isSameDate(weekStart, startOfWeek(new Date()))
    : isSameDate(monthStart, startOfMonth(new Date()));

  const shiftAnchor = (delta: number) => {
    if (mode === 'day')   return setAnchor((a) => addDays(a, delta));
    if (mode === 'week')  return setAnchor((a) => addDays(a, 7 * delta));
    return setAnchor((a) => addMonths(a, delta));
  };

  const rangeLabel = mode === 'day' ? friendlyDayLabel(anchor)
    : mode === 'week' ? friendlyWeekLabel(weekStart)
    : friendlyMonthLabel(monthStart);

  const syncLabel = sync.isPending ? 'Syncing…'
    : googleStatus.data?.lastSyncAt
      ? `Synced ${timeAgo(googleStatus.data.lastSyncAt)}`
      : googleStatus.data?.connected ? 'Synced' : 'Not connected';

  return (
    <div className="screen-enter">
      <PageHeader
        title="Calendar"
        sub={<>{rangeLabel}. Your events in green, Raj's in blue.</>}
        right={<>
          <div style={{ display: 'inline-flex', border: '1px solid var(--border-default)', borderRadius: 6, background: 'var(--bg-surface)', overflow: 'hidden' }}>
            <button className="btn btn-ghost" style={{ padding: '6px 10px', borderRadius: 0 }} onClick={() => shiftAnchor(-1)} title={mode === 'day' ? 'Previous day' : mode === 'week' ? 'Previous week' : 'Previous month'}>
              <Icon name="chevron-left" size={13} />
            </button>
            <button className="btn btn-ghost" style={{ padding: '6px 12px', borderRadius: 0, opacity: isToday ? 0.5 : 1 }} disabled={isToday} onClick={() => setAnchor(new Date())}>
              Today
            </button>
            <button className="btn btn-ghost" style={{ padding: '6px 10px', borderRadius: 0 }} onClick={() => shiftAnchor(1)} title={mode === 'day' ? 'Next day' : mode === 'week' ? 'Next week' : 'Next month'}>
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
          anchor={anchor}
          onEventClick={setSelected}
          onCreate={(body) => createEvt.mutate(body)}
          onDayClick={(dayIdx) => setAnchor(addDays(weekStart, dayIdx))}
          me={me}
        />
      )}
      {mode === 'day' && (
        <DayGrid
          date={anchor}
          events={filteredAll}
          onEventClick={setSelected}
        />
      )}
      {mode === 'month' && (
        <MonthGrid
          monthStart={monthStart}
          anchor={anchor}
          events={filteredAll}
          onEventClick={setSelected}
          onDayClick={(d) => setAnchor(d)}
        />
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
          onSave={(patch) => {
            if (typeof selected.id !== 'number') return;
            patchEvt.mutate({ id: selected.id, patch }, {
              onSuccess: () => setSelected({ ...selected, ...patch }),
            });
          }}
          saving={patchEvt.isPending}
        />
      )}
    </div>
  );
}

function snapHour(h: number): number {
  // 15-minute snap.
  return Math.round(h * 4) / 4;
}

function WeekGrid({ events, days, weekStart, anchor, onEventClick, onCreate, onDayClick, me }: {
  events: CalendarEvent[];
  days: { i: number; label: string; date: string; isToday: boolean }[];
  weekStart: Date;
  anchor: Date;
  onEventClick: (e: CalendarEvent) => void;
  onCreate: (body: Omit<CalendarEvent, 'id'>) => void;
  /** Highlight this day column (and anchor it) when the user clicks the header. */
  onDayClick?: (dayIdx: number) => void;
  me: FounderKey;
}) {
  const anchorIdx = days.findIndex((d) =>
    isSameDate(addDays(weekStart, d.i), anchor),
  );
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
      {/* Day header row — click to highlight/anchor a day. Switch to Day view from the mode toggle. */}
      <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(5, 1fr)', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-sunken)' }}>
        <div />
        {days.map((d) => {
          const isAnchor = d.i === anchorIdx;
          return (
            <div
              key={d.i}
              onClick={() => onDayClick?.(d.i)}
              title="Highlight this day. Use the Day button to open it."
              className="row-hover"
              style={{
                padding: '12px 16px',
                borderLeft: '1px solid var(--border-subtle)',
                borderBottom: isAnchor ? '2px solid var(--path-primary)' : '2px solid transparent',
                background: isAnchor ? 'var(--path-primary-tint)' : 'transparent',
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
                cursor: onDayClick ? 'pointer' : 'default',
                userSelect: 'none',
              }}
            >
              <span className="meta" style={{ fontSize: 10 }}>{d.label}</span>
              <span style={{ fontSize: 18, fontWeight: 500, color: d.isToday ? 'var(--path-primary)' : 'var(--fg-1)' }}>{d.date}</span>
            </div>
          );
        })}
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
                onCreate={(title, who, kind, description) => {
                  onCreate({
                    title,
                    who,
                    kind,
                    day: pending.day,
                    start: pending.start,
                    end: pending.end,
                    startIso: hourToIso(weekStart, pending.day, pending.start),
                    endIso: hourToIso(weekStart, pending.day, pending.end),
                    description: description || null,
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
  onCreate: (title: string, who: 'D' | 'R' | 'SHARED', kind: 'meet' | 'shared' | 'deep' | 'personal', description: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [who, setWho] = useState<'D' | 'R' | 'SHARED'>(me);

  const submit = () => {
    if (!title.trim()) return;
    onCreate(title.trim(), who, 'meet', description.trim());
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
          if (e.key === 'Enter' && !(e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
          else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
        style={{ width: '100%', height: 30, marginBottom: 6 }}
      />
      <textarea
        className="input"
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
        }}
        rows={2}
        style={{ width: '100%', resize: 'vertical', fontSize: 11.5, lineHeight: 1.4, marginBottom: 8, minHeight: 40, boxSizing: 'border-box' }}
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
  const [description, setDescription] = useState('');
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
      description: description.trim() || null,
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

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Agenda, links, context…"
            className="input"
            rows={3}
            style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 60 }}
          />
        </Field>

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

function EventDetail({ event, onClose, onDelete, onSave, saving }: {
  event: CalendarEvent;
  onClose: () => void;
  onDelete: () => void;
  onSave: (patch: Partial<CalendarEvent>) => void;
  saving?: boolean;
}) {
  const dayLabel = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][event.day] ?? '';
  const [editing, setEditing] = useState(false);

  // Edit-state mirrors the event fields. Populated on entering edit mode.
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description ?? '');
  const [location, setLocation] = useState(event.location ?? '');
  const [who, setWho] = useState<'D' | 'R' | 'SHARED'>(event.who as 'D' | 'R' | 'SHARED');
  const [kind, setKind] = useState<'shared' | 'meet' | 'deep' | 'personal'>((event.kind as any) ?? 'meet');
  const [startTime, setStartTime] = useState(fmt(event.start));
  const [endTime, setEndTime] = useState(fmt(event.end));

  const beginEdit = () => {
    setTitle(event.title);
    setDescription(event.description ?? '');
    setLocation(event.location ?? '');
    setWho(event.who as 'D' | 'R' | 'SHARED');
    setKind((event.kind as any) ?? 'meet');
    setStartTime(fmt(event.start));
    setEndTime(fmt(event.end));
    setEditing(true);
  };
  const cancel = () => setEditing(false);

  const save = () => {
    const toHours = (s: string) => {
      const [h, m] = s.split(':').map((x) => parseInt(x, 10) || 0);
      return h + m / 60;
    };
    const newStart = toHours(startTime);
    const newEnd = toHours(endTime);
    // Rebuild the ISO strings by keeping the event's existing date and swapping in the new
    // time — otherwise the event stays anchored to its old time in any calendar that reads
    // ISO (Google sync, future two-way push, external viewers).
    const patch: Partial<CalendarEvent> = {
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      who,
      kind,
      start: newStart,
      end: newEnd,
    };
    if (event.startIso) {
      const d = new Date(event.startIso);
      const sh = Math.floor(newStart);
      const sm = Math.round((newStart - sh) * 60);
      d.setHours(sh, sm, 0, 0);
      patch.startIso = d.toISOString();
    }
    if (event.endIso || event.startIso) {
      const d = new Date(event.endIso || event.startIso!);
      const eh = Math.floor(newEnd);
      const em = Math.round((newEnd - eh) * 60);
      d.setHours(eh, em, 0, 0);
      patch.endIso = d.toISOString();
    }
    onSave(patch);
    setEditing(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,26,0.55)' }} />
      <div style={{
        position: 'relative',
        width: 400,
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: '90vh',
        overflow: 'auto',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 10,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          {editing ? (
            <input
              autoFocus
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ flex: 1, height: 36, fontSize: 16, fontWeight: 500 }}
            />
          ) : (
            <h2 style={{ margin: 0, fontSize: 18, color: 'var(--fg-1)' }}>{event.title}</h2>
          )}
          <button onClick={onClose} className="btn btn-subtle btn-icon"><Icon name="close" size={14} /></button>
        </div>

        {editing ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
            <Field label="Start">
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input" style={{ width: '100%', height: 34, fontFamily: 'var(--font-mono)' }} />
            </Field>
            <Field label="End">
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="input" style={{ width: '100%', height: 34, fontFamily: 'var(--font-mono)' }} />
            </Field>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--fg-2)' }}>
            {dayLabel} · {fmt(event.start)}–{fmt(event.end)}
          </div>
        )}

        {editing ? (
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input"
              rows={3}
              placeholder="Agenda, links, context…"
              style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 60 }}
            />
          </Field>
        ) : (event.description ? (
          <div style={{
            fontSize: 12.5, color: 'var(--fg-2)',
            lineHeight: 1.5, whiteSpace: 'pre-wrap',
            padding: '10px 12px',
            background: 'var(--bg-sunken)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 6,
          }}>
            {event.description}
          </div>
        ) : null)}

        {editing ? (
          <Field label="Location">
            <input
              className="input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Room, link, address"
              style={{ width: '100%', height: 34 }}
            />
          </Field>
        ) : (event.location && (
          <div style={{ fontSize: 12.5, color: 'var(--fg-2)', display: 'flex', gap: 6, alignItems: 'center' }}>
            <Icon name="pin" size={11} /> {event.location}
          </div>
        ))}

        {editing ? (
          <>
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
            <Field label="Kind">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
                {(['meet', 'shared', 'deep', 'personal'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    style={{
                      padding: '6px 4px',
                      border: '1px solid ' + (kind === k ? 'var(--path-primary)' : 'var(--border-subtle)'),
                      borderRadius: 6,
                      background: kind === k ? 'var(--path-primary-tint)' : 'transparent',
                      color: 'var(--fg-1)',
                      fontSize: 11.5,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                    }}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </Field>
          </>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>
            {event.who === 'SHARED' ? 'Shared' : event.who === 'D' ? 'Dave' : 'Raj'} · {event.kind ?? 'meet'}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          {editing ? (
            <>
              <button className="btn btn-ghost" onClick={cancel} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving || !title.trim()}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={onClose}>Close</button>
              <button className="btn btn-subtle" style={{ color: 'var(--danger-fg)' }} onClick={() => { if (confirm('Delete this event?')) onDelete(); }}>
                <Icon name="close" size={12} /> Delete
              </button>
              <button className="btn btn-primary" onClick={beginEdit}>
                <Icon name="pencil" size={12} /> Edit
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Day grid ────────────────────────────────────────────────────────────────
// One tall column of the selected day's hours. Same 7am–7pm band and hour-row height as the
// week grid, same event styling. No drag-to-create yet — kept read-only for v1 so the user can
// immediately start reviewing their day; creating new events still works from the + button above.

function DayGrid({ date, events, onEventClick }: {
  date: Date;
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
}) {
  const now = new Date();
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const isToday = isSameDate(date, new Date());

  const dayEvents = useMemo(() => events.filter((e) => {
    if (!e.startIso) return false;
    const d = new Date(e.startIso);
    return isSameDate(d, date);
  }).map((e) => ({
    ...e,
    start: hourOf(e.startIso!),
    end:   hourOf(e.endIso ?? e.startIso!),
  })).sort((a, b) => a.start - b.start), [events, date]);

  // Cap the column width so a single day doesn't stretch across a huge display. The week
  // view needs the full grid because it's five columns, but one column looks silly at 2k+.
  return (
    <div style={{ maxWidth: 780, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-sunken)' }}>
        <div />
        <div style={{ padding: '12px 16px', borderLeft: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span className="meta" style={{ fontSize: 10 }}>{date.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()}</span>
          <span style={{ fontSize: 20, fontWeight: 500, color: isToday ? 'var(--path-primary)' : 'var(--fg-1)' }}>
            {date.getDate()}
          </span>
          <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>
            {date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          </span>
        </div>
      </div>
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '60px 1fr' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {HOURS.map((h) => (
            <div key={h} style={{ height: HOUR_H, padding: '4px 8px', borderTop: '1px solid var(--border-subtle)', textAlign: 'right' }}>
              <span className="meta" style={{ fontSize: 9 }}>{String(h).padStart(2, '0')}:00</span>
            </div>
          ))}
        </div>
        <div style={{ position: 'relative', borderLeft: '1px solid var(--border-subtle)' }}>
          {HOURS.map((h) => (
            <div key={h} style={{ height: HOUR_H, borderTop: '1px solid var(--border-subtle)' }} />
          ))}
          {dayEvents.map((e, idx) => {
            const top = (e.start - START_Y) * HOUR_H;
            const height = Math.max(16, (e.end - e.start) * HOUR_H - 4);
            const style = EVT_STYLE[(e.who as 'D' | 'R' | 'SHARED')] ?? EVT_STYLE.SHARED;
            return (
              <div
                key={idx}
                onClick={(ev) => { ev.stopPropagation(); onEventClick(e); }}
                style={{
                  position: 'absolute',
                  top: top + 1,
                  height,
                  left: 4,
                  right: 4,
                  background: style.bg,
                  color: style.fg,
                  border: `1px solid ${style.border}`,
                  borderLeft: `3px solid ${style.border}`,
                  borderRadius: 5,
                  padding: '6px 10px',
                  fontFamily: 'var(--font-primary)',
                  fontSize: 12.5,
                  lineHeight: 1.35,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  boxShadow: e.flag === 'clash' ? '0 0 0 2px rgba(255,82,82,0.4)' : 'none',
                }}
              >
                <div style={{ fontWeight: 500, color: style.fg }}>{e.title}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, opacity: 0.8 }}>
                  {fmt(e.start)}–{fmt(e.end)}{e.location ? ` · ${e.location}` : ''}
                </div>
              </div>
            );
          })}
          {isToday && nowHour >= START_Y && nowHour <= START_Y + HOURS.length && (
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
      </div>
    </div>
  );
}

// ─── Month grid ──────────────────────────────────────────────────────────────
// Classic 7-col × 6-row month. Each cell shows the day number and up to three compact event
// pills; overflow collapses into "+N more". Clicking a day drills into the day view; clicking
// a pill opens the event detail dialog. Days outside the current month fade back.

function MonthGrid({ monthStart, anchor, events, onEventClick, onDayClick }: {
  monthStart: Date;
  anchor: Date;
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
  onDayClick: (d: Date) => void;
}) {
  const cells = useMemo(() => {
    const gridStart = startOfWeek(monthStart);         // Mon of the week containing day 1
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [monthStart]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      if (!e.startIso) continue;
      const d = new Date(e.startIso);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => (hourOf(a.startIso!)) - (hourOf(b.startIso!)));
    return map;
  }, [events]);

  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const today = new Date();
  const currentMonth = monthStart.getMonth();

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-sunken)' }}>
        {weekdays.map((w) => (
          <div key={w} className="meta" style={{ fontSize: 10, padding: '10px 14px', borderLeft: '1px solid var(--border-subtle)' }}>
            {w.toUpperCase()}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: 'minmax(110px, 1fr)' }}>
        {cells.map((d) => {
          const inMonth = d.getMonth() === currentMonth;
          const isToday = isSameDate(d, today);
          const isAnchor = isSameDate(d, anchor);
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          const dayEvents = byDay.get(key) ?? [];
          const shown = dayEvents.slice(0, 3);
          const overflow = dayEvents.length - shown.length;
          return (
            <div
              key={d.toISOString()}
              onClick={() => onDayClick(d)}
              className="row-hover"
              title="Highlight this day. Use the Day button to open it."
              style={{
                borderTop: '1px solid var(--border-subtle)',
                borderLeft: '1px solid var(--border-subtle)',
                padding: 6,
                background: isAnchor ? 'var(--path-primary-tint)' : (inMonth ? 'var(--bg-surface)' : 'var(--bg-sunken)'),
                color: inMonth ? 'var(--fg-1)' : 'var(--fg-4)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                minHeight: 110,
                boxShadow: isAnchor ? 'inset 0 -2px 0 var(--path-primary)' : 'none',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{
                  fontSize: 12,
                  fontWeight: isToday ? 600 : 400,
                  color: isToday ? 'var(--path-primary)' : (inMonth ? 'var(--fg-1)' : 'var(--fg-4)'),
                  width: 22, height: 22,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '50%',
                  background: isToday ? 'var(--path-primary-tint)' : 'transparent',
                }}>
                  {d.getDate()}
                </span>
              </div>
              {shown.map((e, i) => {
                const style = EVT_STYLE[(e.who as 'D' | 'R' | 'SHARED')] ?? EVT_STYLE.SHARED;
                const h = hourOf(e.startIso!);
                return (
                  <div
                    key={i}
                    onClick={(ev) => { ev.stopPropagation(); onEventClick(e); }}
                    style={{
                      fontSize: 10.5,
                      padding: '2px 6px',
                      borderRadius: 3,
                      background: style.bg,
                      color: style.fg,
                      borderLeft: `3px solid ${style.border}`,
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      cursor: 'pointer',
                    }}
                    title={`${e.title} · ${fmt(h)}`}
                  >
                    <span className="mono" style={{ opacity: 0.75, marginRight: 4 }}>{fmt(h)}</span>
                    {e.title}
                  </div>
                );
              })}
              {overflow > 0 && (
                <div className="meta" style={{ fontSize: 10, color: 'var(--fg-3)', paddingLeft: 4 }}>
                  + {overflow} more
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
