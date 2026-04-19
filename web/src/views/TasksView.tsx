import { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Avatar } from '../components/primitives';
import { Icon } from '../components/Icon';
import { TASKS } from '../lib/seed';
import type { Task } from '../lib/types';

type TaskFilter = 'all' | 'open' | 'mine' | 'raj' | 'done';

const GROUPS = ['today', 'tomorrow', 'Fri', 'Mon', '15 Apr', 'later'];

export function TasksView() {
  const [tasks, setTasks] = useState<Task[]>(TASKS);
  const [filter, setFilter] = useState<TaskFilter>('all');

  const toggle = (id: Task['id']) => setTasks((xs) => xs.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

  const shown = tasks.filter((t) => {
    if (filter === 'mine') return t.owner === 'D';
    if (filter === 'raj') return t.owner === 'R';
    if (filter === 'done') return t.done;
    if (filter === 'open') return !t.done;
    return true;
  });

  const byGroup = GROUPS
    .map((g) => ({ g, items: shown.filter((t) => t.due === g) }))
    .filter((x) => x.items.length);

  return (
    <div className="screen-enter">
      <PageHeader<TaskFilter>
        title="Tasks"
        sub="Shared to-do. Tag each other. Link to backlog items or docs where it helps."
        right={<>
          <button className="btn btn-ghost"><Icon name="filter" size={14} /> Owner</button>
          <button className="btn btn-primary"><Icon name="plus" size={14} /> New task</button>
        </>}
        tabs={[
          { id: 'all', label: 'All', count: tasks.length },
          { id: 'open', label: 'Open', count: tasks.filter((t) => !t.done).length },
          { id: 'mine', label: 'Mine', count: tasks.filter((t) => t.owner === 'D').length },
          { id: 'raj', label: "Raj's", count: tasks.filter((t) => t.owner === 'R').length },
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
                <div key={t.id} className="row-hover" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  borderBottom: i < items.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                }}>
                  <button
                    onClick={() => toggle(t.id)}
                    style={{
                      width: 18,
                      height: 18,
                      border: `1.5px solid ${t.done ? 'var(--path-primary)' : 'var(--border-strong)'}`,
                      background: t.done ? 'var(--path-primary)' : 'transparent',
                      borderRadius: 4,
                      padding: 0,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    {t.done && <Icon name="check" size={12} color="var(--fg-on-primary)" />}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13.5,
                      color: t.done ? 'var(--fg-4)' : 'var(--fg-1)',
                      fontWeight: 500,
                      textDecoration: t.done ? 'line-through' : 'none',
                    }}>
                      {t.title}
                    </div>
                    {t.link && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <Icon name="link" size={11} color="var(--fg-4)" />
                        <span style={{ fontSize: 11.5, color: 'var(--fg-3)', fontFamily: 'var(--font-secondary)' }}>
                          {t.link.type === 'backlog'
                            ? <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-3)' }}>{t.link.ref}</span>
                            : t.link.ref}
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="meta" style={{
                    fontSize: 10,
                    color: t.due === 'today' ? 'var(--danger-fg)' : 'var(--fg-4)',
                  }}>{t.due}</span>
                  <Avatar who={t.owner} size={22} />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div style={{
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
        }}>
          <Icon name="plus" size={14} color="var(--fg-4)" />
          New task — press Enter to save, ⌘K to link
        </div>
      </div>
    </div>
  );
}
