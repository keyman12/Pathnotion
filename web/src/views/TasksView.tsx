import { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Avatar } from '../components/primitives';
import { Icon } from '../components/Icon';
import {
  AttachIconButton,
  AttachPickerDrawer,
  AttachmentChipRow,
  AttachmentViewerDrawer,
} from '../components/Attachments';
import { useCreateTask, useDeleteTask, usePatchTask, useTasks } from '../lib/queries';
import { useSession } from '../lib/useSession';
import { useUI } from '../lib/store';
import type { Attachment, FounderKey, Task, TaskPriority } from '../lib/types';

type TaskFilter = 'open' | 'mine' | 'raj' | 'done';

// ─── Date helpers ───────────────────────────────────────────────────────────

/** Strip time so we can compare whole days. */
function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Parse a due value into a Date. Accepts ISO YYYY-MM-DD or a few legacy words.
 *  Returns null when the value isn't date-like so we can group it under "Other". */
function parseDue(due: string | undefined | null): Date | null {
  if (!due) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    const d = new Date(due + 'T00:00:00');
    return isNaN(d.getTime()) ? null : startOfDay(d);
  }
  const lower = due.toLowerCase();
  const today = startOfDay(new Date());
  if (lower === 'today') return today;
  if (lower === 'tomorrow') { const d = new Date(today); d.setDate(d.getDate() + 1); return d; }
  return null;
}

/** The bucket a task belongs in on the Tasks page, based on its due date. */
interface DueBucket { key: string; label: string; order: number; }
function bucketFor(t: Task): DueBucket {
  const today = startOfDay(new Date());
  const d = parseDue(t.due);
  if (!d) return { key: 'other', label: 'Other', order: 7 };
  const days = Math.round((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (days < 0) return { key: 'overdue', label: 'Overdue', order: 0 };
  if (days === 0) return { key: 'today', label: 'Today', order: 1 };
  if (days === 1) return { key: 'tomorrow', label: 'Tomorrow', order: 2 };
  if (days <= 6) return { key: 'this-week', label: 'This week', order: 3 };
  if (days <= 13) return { key: 'next-week', label: 'Next week', order: 4 };
  if (days <= 30) return { key: 'later', label: 'Later', order: 5 };
  return { key: 'someday', label: 'Someday', order: 6 };
}

/** Friendly short label for the summary row. Returns empty string if unparseable. */
function formatDueShort(due: string | undefined | null): string {
  const d = parseDue(due);
  if (!d) return due ?? '';
  const today = startOfDay(new Date());
  const days = Math.round((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 1 && days <= 6) return d.toLocaleDateString('en-GB', { weekday: 'short' });
  if (days < -1 && days >= -6) return d.toLocaleDateString('en-GB', { weekday: 'short' });
  // Further away: "22 Apr"
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function toDateInputValue(due: string | undefined | null): string {
  if (!due) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) return due;
  const d = parseDue(due);
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

const PRIORITY_STYLE: Record<TaskPriority, { bg: string; fg: string; border: string }> = {
  P1: { bg: 'var(--danger-bg)', fg: 'var(--danger-fg)', border: 'var(--danger-fg)' },
  P2: { bg: 'var(--warning-bg)', fg: 'var(--warning-fg)', border: 'var(--warning-fg)' },
  P3: { bg: 'var(--info-bg)', fg: 'var(--info-fg)', border: 'var(--info-fg)' },
};

export function TasksView() {
  const [filter, setFilter] = useState<TaskFilter>('open');
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const session = useSession();
  const tasksQ = useTasks();
  const createTask = useCreateTask();
  const patchTask = usePatchTask();
  const deleteTask = useDeleteTask();

  const tasks = tasksQ.data ?? [];
  const me: FounderKey = (session.data?.key as FounderKey) ?? 'D';

  // Completed tasks are hidden by default. Mine/Raj's can opt in via the toggle;
  // the "All completed" tab is the dedicated archive.
  const shown = tasks.filter((t) => {
    if (filter === 'done') return t.done;
    if (t.done) {
      const allowedInOwnerView = (filter === 'mine' || filter === 'raj') && includeCompleted;
      if (!allowedInOwnerView) return false;
    }
    if (filter === 'mine') return t.owner === me;
    if (filter === 'raj') return t.owner === (me === 'D' ? 'R' : 'D');
    return true; // 'open' — every non-completed task
  });

  // Smart bucket grouping: compute each task's bucket, then order and render.
  const buckets = new Map<string, { bucket: DueBucket; items: Task[] }>();
  for (const t of shown) {
    const b = bucketFor(t);
    const entry = buckets.get(b.key);
    if (entry) entry.items.push(t);
    else buckets.set(b.key, { bucket: b, items: [t] });
  }
  const byGroup = [...buckets.values()]
    .sort((a, b) => a.bucket.order - b.bucket.order)
    .map((x) => ({ g: x.bucket.label, bucketKey: x.bucket.key, items: x.items }));

  return (
    <div className="screen-enter" style={{ maxWidth: 860, margin: '0 auto' }}>
      <PageHeader
        title="Tasks"
        sub="Shared to-do. Tag each other. Link to backlog items or docs where it helps."
        tabs={
          <TaskTabs
            filter={filter}
            setFilter={setFilter}
            includeCompleted={includeCompleted}
            setIncludeCompleted={setIncludeCompleted}
            counts={{
              open: tasks.filter((t) => !t.done).length,
              mine: tasks.filter((t) => !t.done && t.owner === me).length,
              raj: tasks.filter((t) => !t.done && t.owner !== me).length,
              done: tasks.filter((t) => t.done).length,
            }}
            rajLabel={me === 'D' ? "Raj's" : "Dave's"}
          />
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {byGroup.map(({ g, bucketKey, items }) => (
          <div key={bucketKey}>
            <div className="section-h" style={{ marginBottom: 8 }}>
              <h2 style={{ fontSize: 15, color: bucketKey === 'overdue' ? 'var(--danger-fg)' : 'var(--fg-1)' }}>{g}</h2>
              <span className="meta">{items.length}</span>
            </div>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
              {items.map((t, i) => (
                expandedId === (t.id as number)
                  ? <TaskEditor
                      key={t.id}
                      task={t}
                      last={i === items.length - 1}
                      onCollapse={() => setExpandedId(null)}
                      onPatch={(patch) => patchTask.mutate({ id: t.id as number, patch })}
                      onDelete={() => { deleteTask.mutate(t.id as number); setExpandedId(null); }}
                    />
                  : <TaskRow
                      key={t.id}
                      task={t}
                      last={i === items.length - 1}
                      onClick={() => setExpandedId(t.id as number)}
                      onToggle={() => patchTask.mutate({ id: t.id as number, patch: { done: !t.done } as any })}
                    />
              ))}
            </div>
          </div>
        ))}

        {filter !== 'done' && (
          <NewTaskRow
            owner={me}
            onCreate={(body) => createTask.mutate(body)}
          />
        )}
      </div>
    </div>
  );
}


function TaskTabs({ filter, setFilter, includeCompleted, setIncludeCompleted, counts, rajLabel }: {
  filter: TaskFilter;
  setFilter: (v: TaskFilter) => void;
  includeCompleted: boolean;
  setIncludeCompleted: (v: boolean) => void;
  counts: { open: number; mine: number; raj: number; done: number };
  rajLabel: string;
}) {
  const tabs: { id: TaskFilter; label: string; count: number }[] = [
    { id: 'open', label: 'Open',            count: counts.open },
    { id: 'mine', label: 'Mine',            count: counts.mine },
    { id: 'raj',  label: rajLabel,          count: counts.raj },
    { id: 'done', label: 'All completed',   count: counts.done },
  ];
  const canShowCompleted = filter === 'mine' || filter === 'raj';
  return (
    <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', gap: 16 }}>
      {tabs.map((t) => {
        const active = t.id === filter;
        return (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
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
              background: 'transparent',
              border: 0,
              cursor: 'pointer',
            }}
          >
            {t.label}
            <span className="meta" style={{ fontSize: 10 }}>{t.count}</span>
          </button>
        );
      })}
      <div style={{ flex: 1 }} />
      {canShowCompleted && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--fg-3)', paddingBottom: 4 }}>
          <input
            type="checkbox"
            checked={includeCompleted}
            onChange={(e) => setIncludeCompleted(e.target.checked)}
          />
          Show completed tasks
        </label>
      )}
    </div>
  );
}

function TaskRow({ task, last, onClick, onToggle }: {
  task: Task;
  last: boolean;
  onClick: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="row-hover" onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px',
      borderBottom: last ? 'none' : '1px solid var(--border-subtle)',
      cursor: 'pointer',
    }}>
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        style={{
          width: 18, height: 18,
          border: `1.5px solid ${task.done ? 'var(--path-primary)' : 'var(--border-strong)'}`,
          background: task.done ? 'var(--path-primary)' : 'transparent',
          borderRadius: 4, padding: 0, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
        {task.done && <Icon name="check" size={12} color="var(--fg-on-primary)" />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13.5,
          color: task.done ? 'var(--fg-4)' : 'var(--fg-1)',
          fontWeight: 500,
          textDecoration: task.done ? 'line-through' : 'none',
        }}>{task.title}</div>
      </div>
      {(task.attachments?.length ?? 0) > 0 && (
        <span className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, color: 'var(--fg-4)' }}>
          <Icon name="paperclip" size={11} /> {task.attachments!.length}
        </span>
      )}
      {task.priority && <PriorityPill priority={task.priority} />}
      {task.due && <DuePill due={task.due} done={task.done} />}
      <Avatar who={task.owner} size={22} />
    </div>
  );
}

function TaskEditor({ task, last, onCollapse, onPatch, onDelete }: {
  task: Task;
  last: boolean;
  onCollapse: () => void;
  onPatch: (patch: Partial<Task>) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  // Normalise legacy string dues into an ISO date for the date picker.
  const [dueIso, setDueIso] = useState(toDateInputValue(task.due));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewing, setViewing] = useState<Attachment | null>(null);
  const navigate = useUI((s) => s.navigate);

  const attachments = task.attachments ?? [];

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
      navigate('backlog', att.ref);
      return;
    }
    setViewing(att);
  };

  return (
    <div style={{
      background: 'var(--bg-surface)',
      borderTop: '1px solid var(--border-subtle)',
      borderBottom: last ? 'none' : '1px solid var(--border-subtle)',
      borderLeft: '3px solid var(--path-primary-light-2)',
    }}>
      <button
        type="button"
        onClick={onCollapse}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, width: '100%',
          padding: '10px 16px', background: 'var(--bg-sunken)', border: 0,
          borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', textAlign: 'left', color: 'inherit',
        }}
      >
        <span
          onClick={(e) => { e.stopPropagation(); onPatch({ done: !task.done } as Partial<Task>); }}
          style={{
            width: 18, height: 18,
            border: `1.5px solid ${task.done ? 'var(--path-primary)' : 'var(--border-strong)'}`,
            background: task.done ? 'var(--path-primary)' : 'transparent',
            borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
          {task.done && <Icon name="check" size={12} color="var(--fg-on-primary)" />}
        </span>
        <span style={{ flex: 1, fontSize: 13.5, color: 'var(--fg-1)', fontWeight: 500, textDecoration: task.done ? 'line-through' : 'none' }}>{task.title}</span>
        <Avatar who={task.owner} size={20} />
        <Icon name="chevron-up" size={14} color="var(--fg-3)" />
      </button>

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Single line: title (flexes) · due · priority · owner. Wraps on narrow screens. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <TField label="Title" grow>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => { if (title.trim() && title !== task.title) onPatch({ title: title.trim() }); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className="input"
              style={{ width: '100%', height: 34 }}
            />
          </TField>
          <TField label="Due">
            <input
              type="date"
              value={dueIso}
              onChange={(e) => {
                const v = e.target.value;
                setDueIso(v);
                onPatch({ due: v });
              }}
              className="input"
              style={{ height: 34, fontFamily: 'var(--font-mono)', width: 150 }}
            />
          </TField>
          <TField label="Priority">
            <div style={{ display: 'inline-flex', border: '1px solid var(--border-subtle)', borderRadius: 6, overflow: 'hidden', height: 34 }}>
              {(['P1', 'P2', 'P3'] as const).map((p) => {
                const active = task.priority === p;
                const style = PRIORITY_STYLE[p];
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onPatch({ priority: active ? null : p })}
                    style={{
                      width: 38,
                      border: 0,
                      background: active ? style.bg : 'transparent',
                      color: active ? style.fg : 'var(--fg-3)',
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                      borderRight: p !== 'P3' ? '1px solid var(--border-subtle)' : 0,
                    }}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </TField>
          <TField label="Owner">
            <div style={{ display: 'inline-flex', border: '1px solid var(--border-subtle)', borderRadius: 6, overflow: 'hidden', height: 34 }}>
              {(['D', 'R'] as const).map((k) => {
                const active = task.owner === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => onPatch({ owner: k })}
                    style={{
                      width: 56,
                      border: 0,
                      background: active ? 'var(--bg-active)' : 'transparent',
                      color: active ? 'var(--fg-1)' : 'var(--fg-3)',
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: 'pointer',
                      borderRight: k === 'D' ? '1px solid var(--border-subtle)' : 0,
                    }}
                  >
                    {k === 'D' ? 'Dave' : 'Raj'}
                  </button>
                );
              })}
            </div>
          </TField>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Attachments</span>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              title="Attach document, file, backlog item, or link"
              aria-label="Attach"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 26,
                height: 26,
                border: '1px solid var(--border-subtle)',
                borderRadius: 6,
                background: 'var(--bg-surface)',
                color: 'var(--fg-2)',
                cursor: 'pointer',
              }}
            >
              <Icon name="paperclip" size={13} />
            </button>
          </div>
          <AttachmentChipRow
            attachments={attachments}
            onOpen={openAttachment}
            onRemove={(_att, idx) => removeAttachment(idx)}
          />
          {attachments.length === 0 && (
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg-4)' }}>
              None yet — use the paperclip to attach a doc, file, backlog item, or link.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
          <button
            type="button"
            className="btn btn-subtle"
            style={{ color: 'var(--danger-fg)', padding: '6px 10px', fontSize: 12 }}
            onClick={() => { if (confirm('Delete this task?')) onDelete(); }}
          >
            <Icon name="close" size={12} /> Delete
          </button>
          <span className="mono" style={{ fontSize: 10, color: 'var(--fg-4)' }}>Changes save automatically</span>
        </div>
      </div>

      {pickerOpen && (
        <AttachPickerDrawer
          existing={attachments}
          onAdd={(att) => addAttachment(att)}
          onClose={() => setPickerOpen(false)}
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

function TField({ label, children, grow }: { label: string; children: React.ReactNode; grow?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: grow ? '1 1 220px' : '0 0 auto', minWidth: 0 }}>
      <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
      {children}
    </label>
  );
}

function PriorityPill({ priority }: { priority: TaskPriority }) {
  const s = PRIORITY_STYLE[priority];
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '1px 6px',
      fontSize: 10,
      fontWeight: 600,
      color: s.fg,
      background: s.bg,
      border: `1px solid ${s.border}`,
      borderRadius: 4,
      letterSpacing: '0.04em',
    }}>{priority}</span>
  );
}

function DuePill({ due, done }: { due: string; done: boolean }) {
  const today = startOfDay(new Date());
  const d = parseDue(due);
  const overdue = !done && d != null && d < today;
  return (
    <span className="mono" style={{
      fontSize: 10,
      color: overdue ? 'var(--danger-fg)' : 'var(--fg-4)',
      whiteSpace: 'nowrap',
    }}>{formatDueShort(due)}</span>
  );
}

function NewTaskRow({ owner, onCreate }: { owner: FounderKey; onCreate: (body: { title: string; owner: FounderKey; due: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(todayIso());

  const submit = () => {
    const t = title.trim();
    if (!t) { setOpen(false); setTitle(''); return; }
    onCreate({ title: t, owner, due: due || todayIso() });
    setTitle('');
    setDue(todayIso());
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          background: 'var(--bg-surface)',
          border: '1px dashed var(--border-default)',
          borderRadius: 8,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          color: 'var(--fg-4)',
          fontSize: 13,
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <Icon name="plus" size={14} color="var(--fg-4)" />
        New task — press to add
      </button>
    );
  }

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-default)',
      borderRadius: 8,
      padding: '10px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}>
      <span style={{ width: 18, height: 18, border: '1.5px solid var(--border-strong)', borderRadius: 4, flexShrink: 0 }} />
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setTitle(''); setOpen(false); } }}
        placeholder="New task title…"
        className="input"
        style={{ flex: 1, height: 30, padding: '0 8px', fontSize: 13.5, border: 0, background: 'transparent' }}
      />
      <input
        type="date"
        value={due}
        onChange={(e) => setDue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        className="input"
        style={{ width: 140, height: 28, padding: '0 8px', fontSize: 11, fontFamily: 'var(--font-mono)' }}
      />
      <button onClick={submit} className="btn btn-primary" style={{ padding: '6px 10px', fontSize: 12 }}>Save</button>
    </div>
  );
}
