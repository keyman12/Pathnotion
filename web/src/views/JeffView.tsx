// Jeff — the workspace assistant. Real-wired to the Anthropic backend, with memory and scheduled jobs.
// Tabs: Conversation · Memory · Schedule · Run log · Access.
// The status header surfaces the model name, memory count, and a link to Jeff's Drive folder.

import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Avatar } from '../components/primitives';
import { Dropdown } from '../components/Dropdown';
import { Icon } from '../components/Icon';
import type { JeffMemory, AgentConversationMessage, JeffToolCall } from '../lib/api';
import type { AgentJob } from '../lib/types';
import { useUI } from '../lib/store';
import {
  useAccess,
  useAgentJobs,
  useAgentRuns,
  useClearJeffConversation,
  useClearMemories,
  useCreateAgentJob,
  useDeleteAgentJob,
  useDriveConfig,
  useJeffConversation,
  useJeffMemories,
  useJeffSettings,
  useJeffStatus,
  useJobPromptDefaults,
  usePatchAgentJob,
  usePinnedFolders,
  useRunAgentJob,
  useScanDriveFiles,
  useScanMemories,
  useSendJeffMessage,
} from '../lib/queries';

type JeffTab = 'chat' | 'memory' | 'schedule' | 'log' | 'access';

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
  const statusQ = useJeffStatus();
  const runsQ = useAgentRuns();
  const status = statusQ.data;
  const driveCfgQ = useDriveConfig();
  const jeffFolderId = driveCfgQ.data?.jeffFolderId ?? null;

  // Compact status badge: "latest Sonnet · 24 memories · link"
  const subNode = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: status?.ready ? 'var(--success-dot)' : 'var(--danger-fg)',
        }} />
        {status?.ready ? 'Ready' : (status?.reason ?? 'Checking…')}
      </span>
      <span style={{ color: 'var(--fg-4)' }}>·</span>
      <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-3)' }}>{status?.model ?? '…'}</span>
      <span style={{ color: 'var(--fg-4)' }}>·</span>
      <span style={{ fontSize: 12.5, color: 'var(--fg-3)' }}>
        {status?.memories.total ?? 0} memor{status?.memories.total === 1 ? 'y' : 'ies'}
      </span>
      {jeffFolderId && (
        <>
          <span style={{ color: 'var(--fg-4)' }}>·</span>
          <a
            href={`https://drive.google.com/drive/folders/${jeffFolderId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12.5, color: 'var(--path-primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <Icon name="folder" size={12} color="var(--path-primary)" />
            Open Jeff folder in Drive
            <Icon name="arrow-up-right" size={10} color="var(--path-primary)" />
          </a>
        </>
      )}
    </span>
  );

  return (
    <div className="screen-enter">
      <PageHeader<JeffTab>
        title="Jeff"
        sub={subNode}
        tabs={[
          { id: 'chat', label: 'Conversation' },
          { id: 'schedule', label: 'Schedule' },
          { id: 'log', label: 'Run log', count: runsQ.data?.length ?? 0 },
          { id: 'access', label: 'Access' },
          { id: 'memory', label: 'Memory', count: status?.memories.total },
        ]}
        activeTab={tab}
        onTab={setTab}
      />

      {tab === 'chat' && <ChatTab />}
      {tab === 'memory' && <MemoryTab />}
      {tab === 'schedule' && <ScheduleTab />}
      {tab === 'log' && <LogTab />}
      {tab === 'access' && <AccessTab />}
    </div>
  );
}

// ─── Chat tab ──────────────────────────────────────────────────────────────

function ChatTab() {
  const convoQ = useJeffConversation();
  const send = useSendJeffMessage();
  const clear = useClearJeffConversation();
  const [draft, setDraft] = useState('');
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const jeffPrefill = useUI((s) => s.jeffPrefill);
  const clearJeffPrefill = useUI((s) => s.clearJeffPrefill);

  // Another view ("Ask Jeff") dropped a prompt in the store — pull it into the draft once, then clear it.
  useEffect(() => {
    if (jeffPrefill && !draft) {
      setDraft(jeffPrefill);
      clearJeffPrefill();
    }
  }, [jeffPrefill, draft, clearJeffPrefill]);

  const messages: AgentConversationMessage[] = convoQ.data ?? [];

  // Auto-scroll the chat column to the bottom when new messages arrive.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, pendingUser, send.isPending]);

  const onSend = async () => {
    const text = draft.trim();
    if (!text || send.isPending) return;
    setDraft('');
    setPendingUser(text);
    try {
      await send.mutateAsync(text);
    } catch (err) {
      alert(`Jeff couldn't reply: ${(err as Error).message}`);
    } finally {
      setPendingUser(null);
    }
  };

  const showEmpty = !convoQ.isLoading && messages.length === 0 && !pendingUser;

  const onClear = async () => {
    if (!confirm('Clear this chat? Jeff\'s long-term memory isn\'t affected — just the conversation history.')) return;
    try { await clear.mutateAsync(); }
    catch (err) { alert(`Couldn't clear: ${(err as Error).message}`); }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 220px', gap: 20, height: 'calc(100vh - 260px)' }}>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {/* Floating Clear button — hidden when the chat is already empty. */}
        {messages.length > 0 && (
          <button
            onClick={onClear}
            disabled={clear.isPending}
            title="Clear chat history"
            className="btn btn-subtle"
            style={{
              position: 'absolute',
              top: 10, right: 10,
              zIndex: 2,
              padding: '4px 10px',
              fontSize: 11,
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <Icon name="trash" size={11} /> {clear.isPending ? 'Clearing…' : 'Clear chat'}
          </button>
        )}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {showEmpty && (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--fg-3)', fontSize: 13 }}>
              <div style={{ fontSize: 14, color: 'var(--fg-2)', fontWeight: 500, marginBottom: 6 }}>Start a thread with Jeff.</div>
              <div>Ask about articles he's read, the week ahead, or anything in the workspace.</div>
            </div>
          )}
          {messages.map((m) => {
            const actions = typeof m.actions === 'object' && m.actions ? (m.actions as { toolCalls?: JeffToolCall[] }) : null;
            const toolCalls = actions?.toolCalls ?? [];
            return (
              <ChatBubble key={m.id} from={m.role === 'user' ? 'D' : 'A'} text={m.text} toolCalls={toolCalls} />
            );
          })}
          {pendingUser && <ChatBubble from="D" text={pendingUser} />}
          {send.isPending && <ChatBubble from="A" text="Thinking…" typing />}
        </div>
        {/* Input row — textarea auto-grows a little for multi-line but starts at button height. */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', padding: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
            placeholder="Ask Jeff — e.g. 'summarise this week' or 'what's in the dashboard spec?'"
            rows={1}
            style={{
              flex: 1,
              resize: 'none',
              height: 34,
              maxHeight: 120,
              border: '1px solid var(--border-default)',
              borderRadius: 6,
              padding: '7px 10px',
              fontFamily: 'var(--font-primary)',
              fontSize: 13,
              lineHeight: 1.4,
              outline: 'none',
              background: 'var(--bg-surface)',
              color: 'var(--fg-1)',
              boxSizing: 'border-box',
            }}
          />
          <button
            className="btn btn-primary"
            onClick={onSend}
            disabled={!draft.trim() || send.isPending}
            style={{ height: 34, padding: '0 14px' }}
          >
            <Icon name="send" size={13} /> {send.isPending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>

      <ChatSidebar onQuickPrompt={(p) => setDraft(p)} />
    </div>
  );
}

function ChatBubble({ from, text, typing, toolCalls }: { from: 'A' | 'D'; text: string; typing?: boolean; toolCalls?: JeffToolCall[] }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexDirection: from === 'D' ? 'row-reverse' : 'row' }}>
      <Avatar who={from} size={28} />
      <div style={{
        maxWidth: 640,
        background: from === 'D' ? 'var(--path-primary-tint)' : 'var(--bg-sunken)',
        border: '1px solid var(--border-subtle)',
        color: 'var(--fg-1)',
        padding: '10px 14px',
        borderRadius: 10,
        fontSize: 13.5,
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
        fontStyle: typing ? 'italic' : 'normal',
        opacity: typing ? 0.7 : 1,
      }}>
        {toolCalls && toolCalls.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {toolCalls.map((t, i) => <ToolCallChip key={i} call={t} />)}
          </div>
        )}
        {text}
      </div>
    </div>
  );
}

function ToolCallChip({ call }: { call: JeffToolCall }) {
  const [open, setOpen] = useState(false);
  const pretty = call.name.replace(/_/g, ' ');
  return (
    <span
      onClick={() => setOpen((v) => !v)}
      title="Click to see input + result"
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        padding: open ? '4px 8px' : '2px 8px',
        borderRadius: 4,
        background: call.isError ? 'var(--danger-bg)' : 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        fontSize: 10.5,
        fontFamily: 'var(--font-mono)',
        color: call.isError ? 'var(--danger-fg)' : 'var(--fg-3)',
        cursor: 'pointer',
        maxWidth: '100%',
      }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <Icon name={call.isError ? 'close' : 'check'} size={10} /> {pretty}
      </span>
      {open && (
        <div style={{ marginTop: 6, fontSize: 10, color: 'var(--fg-3)', whiteSpace: 'pre-wrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <div><b>input:</b> {JSON.stringify(call.input)}</div>
          <div style={{ marginTop: 4 }}><b>result:</b> {call.result.slice(0, 400)}{call.result.length > 400 ? '…' : ''}</div>
        </div>
      )}
    </span>
  );
}

function ChatSidebar({ onQuickPrompt }: { onQuickPrompt: (p: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      <div>
        <div className="meta" style={{ fontSize: 10, marginBottom: 8 }}>Quick prompts</div>
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, background: 'var(--bg-sunken)', padding: 6 }}>
          {[
            'Summarise this week',
            "What's in the dashboard spec?",
            "What's overdue?",
            'Draft release notes from the last changes',
          ].map((q) => (
            <button key={q} onClick={() => onQuickPrompt(q)} className="row-hover" style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '7px 8px', background: 'transparent', border: 0,
              fontSize: 12.5, color: 'var(--fg-2)', cursor: 'pointer', borderRadius: 5, fontFamily: 'inherit',
            }}>→ {q}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Memory tab ────────────────────────────────────────────────────────────

function MemoryTab() {
  const memQ = useJeffMemories(undefined, 200);
  const scan = useScanMemories();
  const scanDrive = useScanDriveFiles();
  const clear = useClearMemories();
  const pinnedQ = usePinnedFolders();
  const settingsQ = useJeffSettings();
  const [kindFilter, setKindFilter] = useState<string>('all');
  const pinnedCount = pinnedQ.data?.length ?? 0;
  const scanCap = settingsQ.data?.scanCap ?? 40;

  const memories: JeffMemory[] = memQ.data?.memories ?? [];
  const filtered = useMemo(
    () => kindFilter === 'all' ? memories : memories.filter((m) => m.kind === kindFilter),
    [memories, kindFilter],
  );
  const counts = memQ.data?.counts ?? { total: 0, byKind: {} };

  const onScan = async () => {
    try {
      const r = await scan.mutateAsync();
      alert(`Article scan complete: ${r.updated} new/updated, ${r.skipped} unchanged.`);
    } catch (err) {
      alert(`Scan failed: ${(err as Error).message}`);
    }
  };

  const onScanDrive = async () => {
    try {
      const r = await scanDrive.mutateAsync();
      if (r.skippedNoKey) { alert('Drive scan skipped — paste an ANTHROPIC_API_KEY into api/.env first.'); return; }
      if (r.skippedNoPins) { alert('Nothing to scan — pin folders in Docs first so Jeff knows what to read.'); return; }
      alert(`Drive scan complete: ${r.updated} new/updated, ${r.skipped} unchanged (${r.scanned} files walked).`);
    } catch (err) {
      alert(`Drive scan failed: ${(err as Error).message}`);
    }
  };

  const onClear = async () => {
    if (!confirm('Clear every memory? Jeff will start fresh the next time you scan.')) return;
    await clear.mutateAsync(undefined);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
      }}>
        <Icon name="sparkle" size={14} color="var(--path-primary)" />
        <div style={{ flex: 1, fontSize: 13, color: 'var(--fg-2)' }}>
          <b style={{ color: 'var(--fg-1)' }}>{counts.total}</b> summaries stored.
          Jeff reads the 20 most recent when you chat with him.
          {' '}
          <span style={{ color: 'var(--fg-4)' }}>
            Drive scans {pinnedCount === 0 ? 'the whole shared drive' : `${pinnedCount} pinned folder${pinnedCount === 1 ? '' : 's'}`} · cap {scanCap} files/run.
          </span>
        </div>
        <KindFilter value={kindFilter} onChange={setKindFilter} counts={counts.byKind} />
        <button className="btn btn-ghost" onClick={onClear} disabled={clear.isPending || counts.total === 0}>
          <Icon name="trash" size={12} /> Clear
        </button>
        <button
          className="btn btn-ghost"
          onClick={onScanDrive}
          disabled={scanDrive.isPending}
          title="Walks the shared drive and summarises up to 40 files. Heavier than the article scan."
        >
          <Icon name="folder" size={12} /> {scanDrive.isPending ? 'Scanning Drive…' : 'Scan Drive files'}
        </button>
        <button className="btn btn-primary" onClick={onScan} disabled={scan.isPending}>
          <Icon name="refresh" size={12} /> {scan.isPending ? 'Scanning…' : 'Scan articles'}
        </button>
      </div>

      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-surface)' }}>
        {filtered.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--fg-3)' }}>
            <div style={{ fontSize: 14, color: 'var(--fg-2)', fontWeight: 500 }}>No memories yet.</div>
            <div style={{ fontSize: 12.5, marginTop: 6 }}>Click "Scan articles" to have Jeff read the workspace.</div>
          </div>
        )}
        {filtered.map((m) => <MemoryRow key={m.id} m={m} />)}
      </div>
    </div>
  );
}

function KindFilter({ value, onChange, counts }: { value: string; onChange: (v: string) => void; counts: Record<string, number> }) {
  const kinds = [
    { id: 'all', label: 'All' },
    { id: 'article', label: 'Articles' },
    { id: 'drive-file', label: 'Drive files' },
    { id: 'weekly-summary', label: 'Weeklies' },
  ];
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--border-default)', borderRadius: 6, padding: 2, background: 'var(--bg-surface)' }}>
      {kinds.map((k) => (
        <button key={k.id} onClick={() => onChange(k.id)} style={{
          border: 0, cursor: 'pointer', padding: '4px 10px', borderRadius: 4,
          background: value === k.id ? 'var(--bg-sunken)' : 'transparent',
          color: value === k.id ? 'var(--fg-1)' : 'var(--fg-3)',
          fontSize: 12, fontFamily: 'inherit',
        }}>
          {k.label}
          {k.id !== 'all' && typeof counts[k.id] === 'number' && (
            <span className="meta" style={{ fontSize: 10, marginLeft: 6 }}>{counts[k.id]}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function MemoryRow({ m }: { m: JeffMemory }) {
  const icon = m.kind === 'article' ? 'docs' : m.kind === 'drive-file' ? 'file' : m.kind === 'weekly-summary' ? 'sparkle' : 'paperclip';
  return (
    <div style={{
      padding: '12px 16px',
      borderBottom: '1px solid var(--border-subtle)',
      display: 'flex',
      gap: 12,
      alignItems: 'flex-start',
    }}>
      <Icon name={icon} size={14} color="var(--fg-3)" style={{ marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--fg-1)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</span>
          <span className="mono" style={{ fontSize: 10, color: 'var(--fg-4)' }}>{m.kind}{m.scope ? ` · ${m.scope}` : ''}</span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--fg-3)', lineHeight: 1.5, marginTop: 4 }}>{m.summary}</div>
      </div>
      <span className="mono" style={{ fontSize: 10, color: 'var(--fg-4)', flexShrink: 0 }}>{formatAgo(m.updatedAt)}</span>
    </div>
  );
}

function formatAgo(iso: string): string {
  const t = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ─── Schedule tab ──────────────────────────────────────────────────────────

// ─── Schedule model ─────────────────────────────────────────────────────────
// Modern scheduler uses structured fields that compose into the stored cron expression. Users
// pick a frequency; the other fields appear only when they apply. Power users can still drop to
// Custom and write raw cron.

type ScheduleMode = 'hourly' | 'minutes' | 'daily' | 'weekdays' | 'weekly' | 'custom';

interface ScheduleParts {
  mode: ScheduleMode;
  time: string;   // 'HH:MM'
  dow: number;    // 0=Sun..6=Sat
  minutes: number;
  raw: string;    // only used when mode === 'custom'
}

const DEFAULT_SCHEDULE_PARTS: ScheduleParts = {
  mode: 'daily',
  time: '09:00',
  dow: 1,
  minutes: 15,
  raw: '',
};

const DOW_LABELS: Record<number, string> = {
  0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday',
  4: 'Thursday', 5: 'Friday', 6: 'Saturday',
};
const DOW_PLURAL: Record<number, string> = {
  0: 'Sundays', 1: 'Mondays', 2: 'Tuesdays', 3: 'Wednesdays',
  4: 'Thursdays', 5: 'Fridays', 6: 'Saturdays',
};

/** Turn a stored schedule string into structured fields. Falls back to 'custom' if we can't
 *  decode cleanly — user still sees their raw value and can edit. */
function decomposeSchedule(expr: string): ScheduleParts {
  const s = (expr || '').trim();
  const fallback = (): ScheduleParts => ({ ...DEFAULT_SCHEDULE_PARTS, mode: 'custom', raw: s });

  if (s === '@hourly' || s === '0 * * * *') return { ...DEFAULT_SCHEDULE_PARTS, mode: 'hourly' };
  const mEvery = /^(\d+)\s*m$/.exec(s);
  if (mEvery) return { ...DEFAULT_SCHEDULE_PARTS, mode: 'minutes', minutes: Number(mEvery[1]) };

  const parts = s.split(/\s+/);
  if (parts.length === 5) {
    const [minStr, hrStr, dom, mon, dow] = parts;
    const minute = Number(minStr);
    const hour = Number(hrStr);
    if (Number.isFinite(minute) && Number.isFinite(hour) && dom === '*' && mon === '*') {
      const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      if (dow === '*')   return { ...DEFAULT_SCHEDULE_PARTS, mode: 'daily',    time };
      if (dow === '1-5') return { ...DEFAULT_SCHEDULE_PARTS, mode: 'weekdays', time };
      const n = Number(dow);
      if (Number.isFinite(n) && n >= 0 && n <= 6) return { ...DEFAULT_SCHEDULE_PARTS, mode: 'weekly', time, dow: n };
    }
  }
  return fallback();
}

/** Build a cron-ish expression from the structured fields. */
function composeSchedule(p: ScheduleParts): string {
  if (p.mode === 'hourly')   return '@hourly';
  if (p.mode === 'minutes')  return `${Math.max(1, Math.min(59, Math.round(p.minutes || 15)))} m`;
  if (p.mode === 'custom')   return p.raw.trim();

  const [hh, mm] = (p.time || '09:00').split(':');
  const hour = Math.max(0, Math.min(23, Number(hh) || 0));
  const minute = Math.max(0, Math.min(59, Number(mm) || 0));
  if (p.mode === 'daily')    return `${minute} ${hour} * * *`;
  if (p.mode === 'weekdays') return `${minute} ${hour} * * 1-5`;
  if (p.mode === 'weekly')   return `${minute} ${hour} * * ${p.dow}`;
  return '';
}

/** Human label for the card (not the editor). */
function humaniseSchedule(expr: string): string {
  const p = decomposeSchedule(expr);
  if (p.mode === 'hourly')   return 'Hourly';
  if (p.mode === 'minutes')  return `Every ${p.minutes} min`;
  if (p.mode === 'daily')    return `Daily ${p.time}`;
  if (p.mode === 'weekdays') return `Weekdays ${p.time}`;
  if (p.mode === 'weekly')   return `${DOW_PLURAL[p.dow]} ${p.time}`;
  return 'Custom';
}

const JOB_KINDS: Array<{ value: string; label: string; defaultName: string; defaultSchedule: string; description: string }> = [
  { value: 'scan-memories',       label: 'Scan articles',          defaultName: 'Scan articles',        defaultSchedule: '@hourly',      description: 'Reads new / edited articles and builds a short summary Jeff can recall later.' },
  { value: 'scan-drive-files',    label: 'Scan Drive files',       defaultName: 'Scan Drive files',     defaultSchedule: '0 4 * * *',    description: 'Reads pinned Drive folders and adds a summary to memory.' },
  { value: 'weekly-summary',      label: 'Weekly summary',         defaultName: 'Weekly summary',       defaultSchedule: '0 7 * * 1',    description: 'Drafts the week ahead from backlog, tasks and calendar. Saves a markdown copy to the Jeff Drive folder.' },
  { value: 'daily-news',          label: 'Daily news scan',        defaultName: 'Daily news scan',      defaultSchedule: '30 7 * * 1-5', description: 'Scans the web for news relevant to Path and the watched competitors, posts a digest to the Week view.' },
  { value: 'competitor-features', label: 'Competitor feature watch', defaultName: 'Competitor feature watch', defaultSchedule: '0 9 * * 1', description: 'Fetches each competitor\'s product pages and tracks what\'s changed.' },
  { value: 'research-refresh',    label: 'Research materials refresh', defaultName: 'Research materials refresh', defaultSchedule: '0 6 * * 1', description: 'Refreshes research on each tracked competitor and records findings.' },
];

function ScheduleTab() {
  const jobsQ = useAgentJobs();
  const patch = usePatchAgentJob();
  const runNow = useRunAgentJob();
  const deleteJob = useDeleteAgentJob();
  const jobs: AgentJob[] = jobsQ.data ?? [];
  const [editing, setEditing] = useState<AgentJob | 'new' | null>(null);

  if (jobsQ.isLoading) return <div style={{ padding: 20, color: 'var(--fg-3)' }}>Loading…</div>;

  const onToggle = (j: AgentJob) => patch.mutate({ id: j.id, patch: { enabled: !j.enabled } });
  const onRun = async (j: AgentJob) => {
    try {
      const r = await runNow.mutateAsync(j.id);
      alert(`Ran ${j.name}: ${r.summary}`);
    } catch (err) {
      alert(`Run failed: ${(err as Error).message}`);
    }
  };
  const onDelete = async (j: AgentJob) => {
    if (!confirm(`Delete job "${j.name}"? This is permanent.`)) return;
    try { await deleteJob.mutateAsync(j.id); }
    catch (err) { alert(`Delete failed: ${(err as Error).message}`); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          <Icon name="plus" size={13} /> New job
        </button>
      </div>

      {jobs.map((j) => (
        <div key={j.id} style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 8,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}>
          {/* Green play while enabled, grey pause while off — matches the prototype's lead glyph. */}
          <button
            onClick={() => onRun(j)}
            disabled={runNow.isPending}
            title={j.enabled ? 'Run this job now' : 'Run this job now (disabled on schedule)'}
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: j.enabled ? 'var(--path-primary-tint)' : 'var(--bg-sunken)',
              border: '1px solid var(--border-subtle)',
              color: j.enabled ? 'var(--path-primary)' : 'var(--fg-4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <Icon name={j.enabled ? 'play' : 'pause'} size={12} />
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13.5, color: 'var(--fg-1)', fontWeight: 500 }}>{j.name}</span>
              {/* Only show Next for enabled jobs — disabled jobs don't run so there's nothing
                  to say. The cadence itself lives in the edit dialog. */}
              {j.enabled && j.nextRunAt && (
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-3)' }}>
                  Next: {formatNextRun(j.nextRunAt)}
                </span>
              )}
              {j.prompt && (
                <span style={{ fontSize: 10, color: 'var(--path-primary)', fontFamily: 'var(--font-mono)' }} title="This job has a custom prompt override">
                  custom prompt
                </span>
              )}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--fg-3)', marginTop: 3, lineHeight: 1.4 }}>{j.description}</div>
          </div>

          <button
            className="btn btn-subtle btn-icon"
            title="Edit job"
            onClick={() => setEditing(j)}
          >
            <Icon name="pencil" size={13} />
          </button>
          <button
            className="btn btn-subtle btn-icon"
            title="Delete job"
            onClick={() => onDelete(j)}
          >
            <Icon name="trash" size={13} />
          </button>
          {/* Enable/disable toggle — mirrors the prototype. */}
          <label onClick={() => onToggle(j)} style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <span style={{
              width: 32, height: 18, borderRadius: 10,
              background: j.enabled ? 'var(--path-primary)' : 'var(--border-strong)',
              position: 'relative', transition: 'background 120ms',
            }}>
              <span style={{
                position: 'absolute', top: 2,
                left: j.enabled ? 16 : 2,
                width: 14, height: 14, borderRadius: '50%',
                background: 'var(--bg-surface)', transition: 'left 120ms',
              }} />
            </span>
          </label>
        </div>
      ))}

      {editing !== null && (
        <JobDialog
          existing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/** Shared create / edit dialog. Creating = pick a kind + preset schedule; editing = tweak name,
 *  schedule, description, prompt, enabled. Cron syntax is unforgiving so we offer presets up front. */
function JobDialog({ existing, onClose }: { existing: AgentJob | null; onClose: () => void }) {
  const create = useCreateAgentJob();
  const patch = usePatchAgentJob();
  const defaultsQ = useJobPromptDefaults();

  const [kind, setKind] = useState<string>(existing?.kind ?? JOB_KINDS[0].value);
  const [name, setName] = useState<string>(existing?.name ?? JOB_KINDS[0].defaultName);
  const [schedule, setSchedule] = useState<string>(existing?.schedule ?? JOB_KINDS[0].defaultSchedule);
  const [description, setDescription] = useState<string>(existing?.description ?? JOB_KINDS[0].description);
  // Prompt state: empty string means "use the default". We show the default as placeholder.
  const [prompt, setPrompt] = useState<string>(existing?.prompt ?? '');

  const defaultsMap = defaultsQ.data ?? {};
  const defaultPrompt = defaultsMap[kind] ?? '';

  // When the user picks a new kind (creating only), auto-fill sensible defaults.
  const onKindChange = (k: string) => {
    setKind(k);
    if (!existing) {
      const preset = JOB_KINDS.find((x) => x.value === k);
      if (preset) {
        setName(preset.defaultName);
        setSchedule(preset.defaultSchedule);
        setDescription(preset.description);
        setPrompt(''); // fresh kind -> back to default
      }
    }
  };

  const submit = async () => {
    try {
      // Empty prompt = use default (store null). Trimmed non-empty = override.
      const promptValue = prompt.trim() ? prompt.trim() : null;
      if (existing) {
        await patch.mutateAsync({ id: existing.id, patch: { name, schedule, description, prompt: promptValue } });
      } else {
        await create.mutateAsync({ name, kind, schedule, description, prompt: promptValue, enabled: false });
      }
      onClose();
    } catch (err) {
      alert(`Save failed: ${(err as Error).message}`);
    }
  };

  const resetPrompt = () => setPrompt('');
  const busy = create.isPending || patch.isPending;
  const isCustomPrompt = prompt.trim() !== '';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,26,0.55)' }} />
      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        style={{
          position: 'relative',
          width: '100%', maxWidth: 560,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 10,
          padding: 22,
          display: 'flex', flexDirection: 'column', gap: 12,
          boxSizing: 'border-box',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 16, color: 'var(--fg-1)' }}>{existing ? 'Edit job' : 'New job'}</h2>
          <button type="button" onClick={onClose} className="btn btn-subtle btn-icon"><Icon name="close" size={13} /></button>
        </div>

        {!existing && (
          <JobField label="Kind">
            <Dropdown<string>
              value={kind}
              onChange={onKindChange}
              options={JOB_KINDS.map((k) => ({ value: k.value, label: k.label }))}
              ariaLabel="Job kind"
            />
          </JobField>
        )}

        <JobField label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </JobField>

        <JobField label="Schedule">
          <ScheduleEditor value={schedule} onChange={setSchedule} />
        </JobField>

        <JobField label="Description">
          <textarea
            className="input"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ resize: 'vertical' }}
          />
        </JobField>

        {/* Prompt — the actual instruction Jeff receives when the job runs. Leave blank to use
            the built-in default (shown as placeholder). Edit as you learn what works better. */}
        <JobField label="Instruction (prompt)">
          <textarea
            className="input"
            rows={8}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={defaultPrompt || 'Loading default…'}
            style={{ resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.5 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 11, color: 'var(--fg-4)', flexWrap: 'wrap' }}>
            <span>
              {isCustomPrompt ? 'Using a custom instruction.' : 'Leave blank to use the built-in default (shown greyed out).'}
              {' '}The live context (competitor list, today\'s date, etc.) is appended automatically.
            </span>
            {isCustomPrompt && (
              <button type="button" className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 11 }} onClick={resetPrompt}>
                Reset to default
              </button>
            )}
          </div>
        </JobField>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim() || !schedule.trim()}>
            {busy ? 'Saving…' : existing ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Structured schedule editor — Frequency / Time / Day of week / minutes / Custom-fallback.
 *  Internally composes the stored string (cron or @alias or "N m"); parents just bind to `value`. */
function ScheduleEditor({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const [parts, setParts] = useState<ScheduleParts>(() => decomposeSchedule(value));

  // If the incoming value changes (e.g. Kind switch in the dialog), resync.
  useEffect(() => { setParts(decomposeSchedule(value)); }, [value]);

  const update = (patch: Partial<ScheduleParts>) => {
    const next = { ...parts, ...patch };
    setParts(next);
    // Emit the composed value up. For Custom we emit the raw input so the user can type freely.
    onChange(composeSchedule(next));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) minmax(140px, 1fr) minmax(120px, 1fr)', gap: 10 }}>
        {/* Frequency */}
        <div>
          <SubLabel>Frequency</SubLabel>
          <Dropdown<ScheduleMode>
            value={parts.mode}
            onChange={(v) => update({ mode: v })}
            options={[
              { value: 'hourly',   label: 'Hourly' },
              { value: 'minutes',  label: 'Every N minutes' },
              { value: 'daily',    label: 'Daily' },
              { value: 'weekdays', label: 'Weekdays (Mon–Fri)' },
              { value: 'weekly',   label: 'Weekly' },
              { value: 'custom',   label: 'Custom cron' },
            ]}
            ariaLabel="Frequency"
          />
        </div>

        {/* Day — only for Weekly */}
        {parts.mode === 'weekly' && (
          <div>
            <SubLabel>Day</SubLabel>
            <Dropdown<number>
              value={parts.dow}
              onChange={(v) => update({ dow: v })}
              options={[1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: d, label: DOW_LABELS[d] }))}
              ariaLabel="Day of week"
            />
          </div>
        )}

        {/* Time — for daily / weekdays / weekly */}
        {(parts.mode === 'daily' || parts.mode === 'weekdays' || parts.mode === 'weekly') && (
          <div>
            <SubLabel>Time</SubLabel>
            <input
              type="time"
              className="input"
              value={parts.time}
              onChange={(e) => update({ time: e.target.value })}
              style={{ width: '100%' }}
            />
          </div>
        )}

        {/* Minutes interval — for Every N minutes */}
        {parts.mode === 'minutes' && (
          <div>
            <SubLabel>Minutes</SubLabel>
            <input
              type="number"
              min={1}
              max={59}
              className="input"
              value={parts.minutes}
              onChange={(e) => update({ minutes: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
          </div>
        )}

        {/* Custom cron expression */}
        {parts.mode === 'custom' && (
          <div style={{ gridColumn: 'span 2' }}>
            <SubLabel>Cron expression</SubLabel>
            <input
              className="input"
              value={parts.raw}
              onChange={(e) => update({ raw: e.target.value })}
              placeholder="e.g. 0 7 * * 1 or 15 m"
              style={{ width: '100%', fontFamily: 'var(--font-mono)' }}
            />
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, color: 'var(--fg-4)' }}>
        Runs <b style={{ color: 'var(--fg-2)' }}>{humaniseSchedule(composeSchedule(parts)) || '—'}</b>.
      </div>
    </div>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono" style={{ fontSize: 10, color: 'var(--fg-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
      {children}
    </div>
  );
}

function JobField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
      {children}
    </label>
  );
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Friendlier "Next: …" — says "11:00 today" or "07:00 tomorrow" for imminent runs. */
function formatNextRun(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(d) - startOf(now)) / 86_400_000);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (days === 0) return `${time} today`;
  if (days === 1) return `${time} tomorrow`;
  if (days > 1 && days < 7) {
    return d.toLocaleDateString('en-GB', { weekday: 'short' }) + ` · ${time}`;
  }
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + ` · ${time}`;
}

// ─── Log tab ───────────────────────────────────────────────────────────────

function LogTab() {
  const runsQ = useAgentRuns();
  const runs = runsQ.data ?? [];

  if (runsQ.isLoading) return <div style={{ padding: 20, color: 'var(--fg-3)' }}>Loading…</div>;
  if (!runs.length) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--fg-3)' }}>
        <div style={{ fontSize: 14, color: 'var(--fg-2)', fontWeight: 500 }}>Nothing run yet.</div>
        <div style={{ fontSize: 12.5, marginTop: 6 }}>Head to Schedule and hit "Run now" on a job to try it.</div>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
      {runs.map((r, i) => {
        const when = r.ranAt ?? r.when ?? '';
        const isOk = r.status === 'ok' || r.status === 'done';
        const isErr = r.status === 'error';
        return (
          <div key={r.id} className="row-hover" style={{
            display: 'flex', alignItems: 'flex-start', gap: 14,
            padding: '14px 18px',
            borderBottom: i < runs.length - 1 ? '1px solid var(--border-subtle)' : 'none',
          }}>
            <span className="meta" style={{ fontSize: 10, width: 150, flexShrink: 0, paddingTop: 2 }}>{formatWhen(when)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
                <span style={{ fontSize: 13.5, color: 'var(--fg-1)', fontWeight: 500 }}>{r.job ?? r.jobId ?? 'job'}</span>
                <span className={`chip ${isOk ? 'chip-later' : isErr ? 'chip-overdue' : 'chip-next'}`}>
                  {isOk ? 'Done' : isErr ? 'Error' : 'Changes'}
                </span>
                {typeof r.changes === 'number' && r.changes > 0 && (
                  <span className="meta" style={{ fontSize: 10 }}>{r.changes} {r.changes === 1 ? 'change' : 'changes'}</span>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--fg-3)', lineHeight: 1.5 }}>{r.summary}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Access tab (unchanged from before) ────────────────────────────────────

function AccessTab() {
  const accessQ = useAccess();
  // Keeping the visual identical to the prototype — the real grant state from the API is
  // overlaid onto the known module labels. Modules the API doesn't know about fall back to
  // the static description.
  const byModule = Object.fromEntries((accessQ.data ?? []).map((g) => [g.module, g]));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {ACCESS_ROWS.map((a) => {
        const granted = byModule[a.name.toLowerCase() as 'calendar' | 'backlog' | 'tasks' | 'docs'];
        const level = granted
          ? granted.write ? 'read-write' : granted.read ? 'read-only' : 'none'
          : a.level;
        return (
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
              width: 32, height: 32, borderRadius: 8,
              background: 'var(--bg-sunken)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name={a.icon} size={16} color="var(--fg-2)" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, color: 'var(--fg-1)', fontWeight: 500 }}>{a.name}</div>
              <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 2 }}>{a.sub}</div>
            </div>
            <span className="chip chip-neutral" style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase', fontSize: 9.5 }}>{level}</span>
          </div>
        );
      })}
    </div>
  );
}
