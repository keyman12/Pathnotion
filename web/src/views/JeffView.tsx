import { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Avatar } from '../components/primitives';
import { Icon } from '../components/Icon';
import { AGENT_RUNS } from '../lib/seed';

type JeffTab = 'chat' | 'schedule' | 'log' | 'access';

interface Msg { from: 'A' | 'D'; text: string }

const INITIAL_MSGS: Msg[] = [
  { from: 'A', text: "Morning. I drafted this week's summary and swept the calendar — there's one clash on Wednesday I'd like to resolve." },
  { from: 'D', text: 'Show me the clash.' },
  { from: 'A', text: "Wed 10:00–11:30 Notable investor call (shared) overlaps Raj's Ops review (10:30–11:00). I can move Ops review to 15:30 — both free. Accept?" },
];

const SCHEDULE_JOBS = [
  { name: 'Weekly summary', when: 'Mon 07:00', next: 'Next: Mon 20 Apr · 07:00', on: true, note: "Draft of all activity across modules, routed to both founders' inbox." },
  { name: 'Clash sweep', when: 'Hourly', next: 'Next: 11:00 today', on: true, note: 'Scans both calendars for overlaps and proposes moves.' },
  { name: 'Doc sync', when: 'On change', next: 'Triggered by backlog edits', on: true, note: 'Keeps product docs and decks in step with backlog changes.' },
  { name: 'Overdue nudge', when: 'Daily 08:30', next: 'Next: Tue 14 Apr · 08:30', on: false, note: 'Gentle reminder for anything overdue > 5 days. Off by default.' },
];

const ACCESS_ROWS: { icon: any; name: string; sub: string; level: string }[] = [
  { icon: 'calendar', name: 'Calendar', sub: 'Read + propose. Never writes without accept.', level: 'read-write' },
  { icon: 'backlog', name: 'Backlog', sub: 'Read all. Edits limited to linking/tagging.', level: 'read-limited' },
  { icon: 'docs', name: 'Documentation', sub: 'Read product docs. Write drafts only.', level: 'read-draft' },
  { icon: 'money', name: 'Finance', sub: 'No access to finance documentation.', level: 'none' },
  { icon: 'tasks', name: 'Tasks', sub: 'Can create tasks for either founder.', level: 'read-write' },
  { icon: 'mcp', name: 'External tools', sub: 'Bank CalDAV, Notion mirror, GitHub.', level: 'read-only' },
];

export function JeffView() {
  const [tab, setTab] = useState<JeffTab>('chat');

  return (
    <div className="screen-enter">
      <PageHeader<JeffTab>
        title="Jeff"
        sub={<>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success-dot)' }} /> Idle
          </span> · Scheduled + on-demand. Knows your calendar, docs, backlog and tasks.
        </>}
        right={<>
          <button className="btn btn-ghost"><Icon name="shield" size={14} /> Access</button>
          <button className="btn btn-primary"><Icon name="play" size={12} /> Run job</button>
        </>}
        tabs={[
          { id: 'chat', label: 'Conversation' },
          { id: 'schedule', label: 'Schedule' },
          { id: 'log', label: 'Run log', count: AGENT_RUNS.length },
          { id: 'access', label: 'Access' },
        ]}
        activeTab={tab}
        onTab={setTab}
      />

      {tab === 'chat' && <ChatTab />}
      {tab === 'schedule' && <ScheduleTab />}
      {tab === 'log' && <LogTab />}
      {tab === 'access' && <AccessTab />}
    </div>
  );
}

function ChatTab() {
  const [msgs, setMsgs] = useState<Msg[]>(INITIAL_MSGS);
  const [draft, setDraft] = useState('');

  const send = () => {
    if (!draft.trim()) return;
    setMsgs((xs) => [...xs, { from: 'D', text: draft }, { from: 'A', text: 'Working on it...' }]);
    setDraft('');
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px', gap: 24, height: 'calc(100vh - 230px)' }}>
      {/* chat column */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {msgs.map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexDirection: m.from === 'D' ? 'row-reverse' : 'row' }}>
              <Avatar who={m.from === 'A' ? 'A' : 'D'} size={28} />
              <div style={{
                maxWidth: 520,
                background: m.from === 'D' ? 'var(--path-primary-tint)' : 'var(--bg-sunken)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--fg-1)',
                padding: '10px 14px',
                borderRadius: 10,
                fontSize: 13.5,
                lineHeight: 1.5,
              }}>
                {m.text}
                {m.from === 'A' && i === 2 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button className="btn btn-primary" style={{ padding: '5px 10px', fontSize: 12 }}>Accept move</button>
                    <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }}>Show both calendars</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid var(--border-subtle)', padding: 14, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask Jeff — e.g. 'draft release notes from this week's PTH changes'"
            style={{
              flex: 1,
              resize: 'none',
              minHeight: 42,
              maxHeight: 120,
              border: '1px solid var(--border-default)',
              borderRadius: 8,
              padding: '10px 12px',
              fontFamily: 'var(--font-primary)',
              fontSize: 13,
              outline: 'none',
              background: 'var(--bg-surface)',
              color: 'var(--fg-1)',
            }} />
          <button className="btn btn-primary" onClick={send}><Icon name="send" size={14} /> Send</button>
        </div>
      </div>
      {/* context sidebar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <div className="meta" style={{ fontSize: 10, marginBottom: 8 }}>Capabilities</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Cap name="Calendar clashes" sub="Schedule sweeps, propose reschedules" on />
            <Cap name="Doc sync" sub="Keep docs and decks in step with backlog" on />
            <Cap name="Weekly summary" sub="Mondays 07:00, every week" on />
          </div>
        </div>
        <div>
          <div className="meta" style={{ fontSize: 10, marginBottom: 8 }}>Recent context</div>
          <div style={{ fontSize: 12.5, color: 'var(--fg-3)', lineHeight: 1.6 }}>
            Read 14 backlog items, 6 docs, this week's calendar for both founders.
          </div>
        </div>
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 14, background: 'var(--bg-sunken)' }}>
          <div style={{ fontSize: 12, color: 'var(--fg-2)', marginBottom: 8, fontWeight: 500 }}>Quick runs</div>
          {['Summarise this week', 'Find clashes', 'Draft release notes', "What's overdue?"].map((q) => (
            <button key={q} className="row-hover" style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '7px 8px',
              background: 'transparent',
              border: 0,
              fontSize: 12.5,
              color: 'var(--fg-2)',
              cursor: 'pointer',
              borderRadius: 5,
              fontFamily: 'inherit',
            }}>→ {q}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Cap({ name, sub, on }: { name: string; sub: string; on: boolean }) {
  return (
    <div style={{ padding: '10px 12px', border: '1px solid var(--border-subtle)', borderRadius: 6, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: on ? 'var(--success-dot)' : 'var(--fg-4)', marginTop: 5 }} />
      <div>
        <div style={{ fontSize: 12.5, color: 'var(--fg-1)', fontWeight: 500 }}>{name}</div>
        <div style={{ fontSize: 11, color: 'var(--fg-3)', lineHeight: 1.4, marginTop: 1 }}>{sub}</div>
      </div>
    </div>
  );
}

function ScheduleTab() {
  const [jobs, setJobs] = useState(SCHEDULE_JOBS);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {jobs.map((j, i) => (
        <div key={j.name} style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 8,
          padding: '16px 18px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
        }}>
          <Icon name={j.on ? 'play' : 'pause'} size={14} color={j.on ? 'var(--path-primary)' : 'var(--fg-4)'} style={{ marginTop: 4 }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span style={{ fontSize: 14, color: 'var(--fg-1)', fontWeight: 500 }}>{j.name}</span>
              <span className="meta" style={{ fontSize: 10 }}>{j.when}</span>
              <span style={{ fontSize: 11.5, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>{j.next}</span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--fg-3)', marginTop: 4 }}>{j.note}</div>
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => setJobs((xs) => xs.map((x, idx) => idx === i ? { ...x, on: !x.on } : x))}>
            <span style={{
              width: 32,
              height: 18,
              borderRadius: 10,
              background: j.on ? 'var(--path-primary)' : 'var(--border-strong)',
              position: 'relative',
              transition: 'background 120ms',
            }}>
              <span style={{
                position: 'absolute',
                top: 2,
                left: j.on ? 16 : 2,
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: 'var(--bg-surface)',
                transition: 'left 120ms',
              }} />
            </span>
          </label>
        </div>
      ))}
    </div>
  );
}

function LogTab() {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
      {AGENT_RUNS.map((r, i) => (
        <div key={r.id} className="row-hover" style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
          padding: '14px 18px',
          borderBottom: i < AGENT_RUNS.length - 1 ? '1px solid var(--border-subtle)' : 'none',
          cursor: 'pointer',
        }}>
          <span className="meta" style={{ fontSize: 10, width: 130, flexShrink: 0, paddingTop: 2 }}>{r.when}</span>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
              <span style={{ fontSize: 13.5, color: 'var(--fg-1)', fontWeight: 500 }}>{r.job}</span>
              <span className={`chip ${r.status === 'done' ? 'chip-later' : 'chip-next'}`}>
                {r.status === 'done' ? 'Done' : 'Needs review'}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--fg-3)', lineHeight: 1.5 }}>{r.summary}</div>
          </div>
          <Icon name="chevron-right" size={14} color="var(--fg-4)" />
        </div>
      ))}
    </div>
  );
}

function AccessTab() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {ACCESS_ROWS.map((a) => (
        <div key={a.name} style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 8,
          padding: '16px 18px',
          display: 'flex',
          gap: 14,
          alignItems: 'flex-start',
        }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'var(--bg-sunken)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Icon name={a.icon} size={16} color="var(--fg-2)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, color: 'var(--fg-1)', fontWeight: 500 }}>{a.name}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 2 }}>{a.sub}</div>
          </div>
          <span className="chip chip-neutral" style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase', fontSize: 9.5 }}>{a.level}</span>
        </div>
      ))}
    </div>
  );
}
