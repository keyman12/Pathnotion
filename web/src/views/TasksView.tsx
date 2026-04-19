import { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Avatar } from '../components/primitives';
import { Icon } from '../components/Icon';
import { useBacklog, useCreateTask, useDeleteTask, usePatchTask, useTasks } from '../lib/queries';
import { PRODUCT_DOCS } from '../lib/seed';
import { useSession } from '../lib/useSession';
import type { FounderKey, Task } from '../lib/types';

type TaskFilter = 'all' | 'open' | 'mine' | 'raj' | 'done';

const GROUPS = ['today', 'tomorrow', 'Fri', 'Mon', '15 Apr', 'later'];

export function TasksView() {
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const session = useSession();
  const tasksQ = useTasks();
  const backlogQ = useBacklog();
  const createTask = useCreateTask();
  const patchTask = usePatchTask();
  const deleteTask = useDeleteTask();

  const tasks = tasksQ.data ?? [];
  const backlogItems = backlogQ.data ?? [];
  const me: FounderKey = (session.data?.key as FounderKey) ?? 'D';

  const shown = tasks.filter((t) => {
    if (filter === 'mine') return t.owner === me;
    if (filter === 'raj') return t.owner === (me === 'D' ? 'R' : 'D');
    if (filter === 'done') return t.done;
    if (filter === 'open') return !t.done;
    return true;
  });

  const byGroup = GROUPS
    .map((g) => ({ g, items: shown.filter((t) => t.due === g) }))
    .filter((x) => x.items.length);

  const otherDues = Array.from(new Set(shown.map((t) => t.due))).filter((d) => !GROUPS.includes(d));
  for (const g of otherDues) byGroup.push({ g, items: shown.filter((t) => t.due === g) });

  return (
    <div className="screen-enter">
      <PageHeader<TaskFilter>
        title="Tasks"
        sub="Shared to-do. Tag each other. Link to backlog items or docs where it helps."
        right={<>
          <button className="btn btn-ghost"><Icon name="filter" size={14} /> Owner</button>
        </>}
        tabs={[
          { id: 'all', label: 'All', count: tasks.length },
          { id: 'open', label: 'Open', count: tasks.filter((t) => !t.done).length },
          { id: 'mine', label: 'Mine', count: tasks.filter((t) => t.owner === me).length },
          { id: 'raj', label: me === 'D' ? "Raj's" : "Dave's", count: tasks.filter((t) => t.owner !== me).length },
          { id: 'done', label: 'Done', count: tasks.filter((t) => t.done).length },
        ]}
        activeTab={filter}
        onTab={setFilter}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {byGroup.map(({ g, items }) => (
          <div key={g}>
            <div className="section-h" style={{ marginBottom: 8 }}>
              <h2 style={{ fontSize: 15, textTransform: 'capitalize' }}>{g}</h2>
              <span className="meta">{items.length}</span>
            </div>
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
              {items.map((t, i) => (
                expandedId === (t.id as number)
                  ? <TaskEditor
                      key={t.id}
                      task={t}
                      last={i === items.length - 1}
                      backlogItems={backlogItems}
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

        <NewTaskRow
          owner={me}
          onCreate={(body) => createTask.mutate(body)}
        />
      </div>
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
        {task.link && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <Icon name="link" size={11} color="var(--fg-4)" />
            <span style={{ fontSize: 11.5, color: 'var(--fg-3)', fontFamily: 'var(--font-secondary)' }}>
              {task.link.type === 'backlog'
                ? <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-3)' }}>{task.link.ref}</span>
                : task.link.ref}
            </span>
          </div>
        )}
      </div>
      <span className="meta" style={{
        fontSize: 10,
        color: task.due === 'today' ? 'var(--danger-fg)' : 'var(--fg-4)',
      }}>{task.due}</span>
      <Avatar who={task.owner} size={22} />
    </div>
  );
}

function TaskEditor({ task, last, backlogItems, onCollapse, onPatch, onDelete }: {
  task: Task;
  last: boolean;
  backlogItems: Array<{ id: string; title: string }>;
  onCollapse: () => void;
  onPatch: (patch: Partial<Task>) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [due, setDue] = useState(task.due);
  const [linkType, setLinkType] = useState<'' | 'backlog' | 'doc'>(task.link?.type ?? '');
  const [linkRef, setLinkRef] = useState<string>(task.link?.ref ?? '');

  const commitLink = (type: '' | 'backlog' | 'doc', ref: string) => {
    if (!type || !ref) {
      if (task.link) onPatch({ link: null });
      return;
    }
    if (task.link?.type !== type || task.link?.ref !== ref) {
      onPatch({ link: { type, ref } } as Partial<Task>);
    }
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

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <TField label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { if (title.trim() && title !== task.title) onPatch({ title: title.trim() }); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="input"
            style={{ width: '100%' }}
          />
        </TField>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <TField label="Due">
            <input
              value={due}
              onChange={(e) => setDue(e.target.value)}
              onBlur={() => { if (due !== task.due) onPatch({ due }); }}
              className="input"
              placeholder="today, Fri, 15 Apr…"
            />
          </TField>
          <TField label="Owner">
            <select
              value={task.owner}
              onChange={(e) => onPatch({ owner: e.target.value as FounderKey })}
              className="input"
            >
              <option value="D">Dave</option>
              <option value="R">Raj</option>
            </select>
          </TField>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, alignItems: 'end' }}>
          <TField label="Attach">
            <select
              value={linkType}
              onChange={(e) => {
                const t = e.target.value as '' | 'backlog' | 'doc';
                setLinkType(t);
                if (!t) { setLinkRef(''); commitLink('', ''); }
              }}
              className="input"
            >
              <option value="">None</option>
              <option value="backlog">Backlog item</option>
              <option value="doc">Document</option>
            </select>
          </TField>
          {linkType === 'backlog' ? (
            <TField label="Backlog item">
              <select
                value={linkRef}
                onChange={(e) => { setLinkRef(e.target.value); commitLink('backlog', e.target.value); }}
                className="input"
              >
                <option value="">— pick one —</option>
                {backlogItems.map((b) => <option key={b.id} value={b.id}>{b.id} — {b.title}</option>)}
              </select>
            </TField>
          ) : linkType === 'doc' ? (
            <TField label="Document">
              <select
                value={linkRef}
                onChange={(e) => { setLinkRef(e.target.value); commitLink('doc', e.target.value); }}
                className="input"
              >
                <option value="">— pick one —</option>
                {PRODUCT_DOCS.map((d) => <option key={d.id} value={d.title}>{d.title}</option>)}
              </select>
            </TField>
          ) : <div />}
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
    </div>
  );
}

function TField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="meta" style={{ fontSize: 9.5 }}>{label}</span>
      {children}
    </label>
  );
}

function NewTaskRow({ owner, onCreate }: { owner: FounderKey; onCreate: (body: { title: string; owner: FounderKey; due: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('today');

  const submit = () => {
    const t = title.trim();
    if (!t) { setOpen(false); setTitle(''); return; }
    onCreate({ title: t, owner, due: due || 'today' });
    setTitle('');
    setDue('today');
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
        value={due}
        onChange={(e) => setDue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        placeholder="today"
        className="input"
        style={{ width: 80, height: 28, padding: '0 8px', fontSize: 11 }}
      />
      <button onClick={submit} className="btn btn-primary" style={{ padding: '6px 10px', fontSize: 12 }}>Save</button>
    </div>
  );
}
