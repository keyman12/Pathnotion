import { db } from '../db/client.js';
import { sendMail } from './mailer.js';

interface UserRow {
  id: number;
  key: string;
  display_name: string;
  email: string | null;
}

interface PrefsRow {
  enabled: number;
  delivery_time: string;
  sections: string;
  last_sent_date: string | null;
}

interface Sections {
  meetings: boolean;
  overdue: boolean;
  tasks: boolean;
  upcoming: boolean;
}

const DEFAULT_SECTIONS: Sections = { meetings: true, overdue: true, tasks: true, upcoming: true };

function getPrefs(userId: number): (PrefsRow & { sectionsParsed: Sections }) | null {
  const row = db.prepare(`
    SELECT enabled, delivery_time, sections, last_sent_date
    FROM notification_prefs
    WHERE user_id = ?
  `).get(userId) as PrefsRow | undefined;
  if (!row) return null;
  let sections: Sections = DEFAULT_SECTIONS;
  try { sections = { ...DEFAULT_SECTIONS, ...JSON.parse(row.sections) }; } catch { /* default */ }
  return { ...row, sectionsParsed: sections };
}

function ensurePrefs(userId: number) {
  db.prepare(`
    INSERT INTO notification_prefs (user_id, enabled, delivery_time, sections)
    VALUES (?, 1, '07:00', ?)
    ON CONFLICT(user_id) DO NOTHING
  `).run(userId, JSON.stringify(DEFAULT_SECTIONS));
}

export interface DigestContent {
  greeting: string;
  user: UserRow;
  meetings: Array<{ time: string; title: string; who: string; durationMin: number }>;
  overdue: Array<{ id: string; title: string; product: string; due: string }>;
  tasks: Array<{ id: number; title: string; due: string; owner: string }>;
  upcomingBacklog: Array<{ id: string; title: string; product: string; stage: string }>;
}

export function buildDigest(userId: number): DigestContent | null {
  const user = db.prepare('SELECT id, key, display_name, email FROM users WHERE id = ?').get(userId) as UserRow | undefined;
  if (!user) return null;

  // Today's meetings — anything day_of_week matches today's weekday (Mon=0..Fri=4; weekends empty)
  const weekday = (new Date().getDay() + 6) % 7;
  const meetingsRows = weekday >= 0 && weekday <= 4
    ? db.prepare(`
        SELECT start_hour AS start, end_hour AS end, title, who
        FROM calendar_events
        WHERE day_of_week = ? AND (who = 'SHARED' OR who = ?)
        ORDER BY start_hour
      `).all(weekday, user.key) as Array<{ start: number; end: number; title: string; who: string }>
    : [];

  // Overdue backlog items (flag = overdue) — owner match or shared product
  const overdueRows = db.prepare(`
    SELECT id, title, product_id AS product, due_date AS due
    FROM backlog_items
    WHERE flag = 'overdue' AND (owner_key = ? OR 1=1)
    ORDER BY due_date
    LIMIT 10
  `).all(user.key) as Array<{ id: string; title: string; product: string; due: string }>;

  // Tasks due today / tomorrow for this user
  const taskRows = db.prepare(`
    SELECT id, title, due, owner_key AS owner
    FROM tasks
    WHERE done = 0 AND owner_key = ? AND (due IN ('today', 'tomorrow'))
    ORDER BY due DESC, sort_order
    LIMIT 10
  `).all(user.key) as Array<{ id: number; title: string; due: string; owner: string }>;

  // Upcoming 'next' stage backlog items (top 5) owned by this user
  const upcomingRows = db.prepare(`
    SELECT id, title, product_id AS product, stage
    FROM backlog_items
    WHERE stage = 'next' AND owner_key = ?
    ORDER BY sort_order
    LIMIT 5
  `).all(user.key) as Array<{ id: string; title: string; product: string; stage: string }>;

  return {
    user,
    greeting: `Good morning, ${user.display_name}.`,
    meetings: meetingsRows.map((m) => ({
      time: fmt(m.start),
      title: m.title,
      who: m.who,
      durationMin: Math.round((m.end - m.start) * 60),
    })),
    overdue: overdueRows,
    tasks: taskRows,
    upcomingBacklog: upcomingRows,
  };
}

function fmt(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function renderDigest(content: DigestContent, sections: Sections): { subject: string; text: string; html: string } {
  const lines: string[] = [content.greeting, ''];
  const htmlParts: string[] = [
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1E1E1E;max-width:620px;margin:0 auto;padding:24px 16px;">`,
    `<h1 style="font-size:22px;margin:0 0 8px;">${escape(content.greeting)}</h1>`,
    `<div style="font-size:13px;color:#747973;margin-bottom:24px;">Your daily summary — ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>`,
  ];

  if (sections.meetings && content.meetings.length) {
    lines.push('Today\'s meetings:');
    htmlParts.push(section('Today\'s meetings'));
    for (const m of content.meetings) {
      lines.push(`  · ${m.time}  ${m.title}  (${m.who === 'SHARED' ? 'Shared' : m.who === 'D' ? 'Dave' : 'Raj'} · ${m.durationMin}m)`);
      htmlParts.push(`<div style="display:flex;gap:12px;padding:8px 0;border-bottom:1px solid #EAECF0;"><span style="font-family:monospace;font-size:12px;color:#747973;min-width:48px;">${m.time}</span><div><div style="font-weight:500;">${escape(m.title)}</div><div style="font-size:11px;color:#747973;">${m.who === 'SHARED' ? 'Shared' : m.who === 'D' ? 'Dave' : 'Raj'} · ${m.durationMin}m</div></div></div>`);
    }
    lines.push('');
  }

  if (sections.overdue && content.overdue.length) {
    lines.push('Overdue:');
    htmlParts.push(section('Overdue'));
    for (const o of content.overdue) {
      lines.push(`  · ${o.id}  ${o.title}  (due ${o.due})`);
      htmlParts.push(`<div style="padding:8px 0;border-bottom:1px solid #EAECF0;"><span style="font-family:monospace;font-size:11px;color:#B42318;">${o.id}</span> <span style="font-weight:500;">${escape(o.title)}</span> <span style="font-size:11px;color:#B42318;">due ${escape(o.due)}</span></div>`);
    }
    lines.push('');
  }

  if (sections.tasks && content.tasks.length) {
    lines.push('Your tasks:');
    htmlParts.push(section('Your tasks'));
    for (const t of content.tasks) {
      lines.push(`  · ${t.title}  (${t.due})`);
      htmlParts.push(`<div style="padding:8px 0;border-bottom:1px solid #EAECF0;"><span style="font-weight:500;">${escape(t.title)}</span> <span style="font-size:11px;color:#747973;">${escape(t.due)}</span></div>`);
    }
    lines.push('');
  }

  if (sections.upcoming && content.upcomingBacklog.length) {
    lines.push('Up next:');
    htmlParts.push(section('Up next'));
    for (const u of content.upcomingBacklog) {
      lines.push(`  · ${u.id}  ${u.title}`);
      htmlParts.push(`<div style="padding:8px 0;border-bottom:1px solid #EAECF0;"><span style="font-family:monospace;font-size:11px;color:#747973;">${u.id}</span> <span style="font-weight:500;">${escape(u.title)}</span></div>`);
    }
    lines.push('');
  }

  if (!content.meetings.length && !content.overdue.length && !content.tasks.length && !content.upcomingBacklog.length) {
    lines.push('Nothing outstanding — enjoy your day.');
    htmlParts.push(`<div style="padding:20px 0;color:#747973;font-size:13px;">Nothing outstanding — enjoy your day.</div>`);
  }

  htmlParts.push(`<div style="margin-top:32px;font-size:11px;color:#919593;">PathNotion · daily digest — edit preferences in Settings › Notifications.</div>`);
  htmlParts.push(`</div>`);

  const subject = `Pathnotion · ${new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`;

  return { subject, text: lines.join('\n'), html: htmlParts.join('') };
}

function section(title: string): string {
  return `<h2 style="font-size:13px;font-weight:500;color:#747973;text-transform:uppercase;letter-spacing:0.06em;margin:20px 0 6px;">${escape(title)}</h2>`;
}

function escape(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export async function sendDigestToUser(userId: number): Promise<{ ok: true } | { ok: false; reason: string }> {
  ensurePrefs(userId);
  const prefs = getPrefs(userId);
  if (!prefs) return { ok: false, reason: 'No prefs row' };
  if (!prefs.enabled) return { ok: false, reason: 'Digest disabled for user' };
  const content = buildDigest(userId);
  if (!content) return { ok: false, reason: 'User not found' };
  if (!content.user.email) return { ok: false, reason: 'No email on record' };
  const rendered = renderDigest(content, prefs.sectionsParsed);
  const result = await sendMail({
    to: content.user.email,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
  });
  if (result.ok) {
    const today = new Date().toISOString().slice(0, 10);
    db.prepare('UPDATE notification_prefs SET last_sent_date = ?, updated_at = datetime(\'now\') WHERE user_id = ?').run(today, userId);
  }
  return result;
}

// Scheduler — fires every minute, sends digests whose delivery_time matches.
let timer: NodeJS.Timeout | null = null;
export function startDigestScheduler() {
  if (timer) return;
  const tick = async () => {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const today = now.toISOString().slice(0, 10);
    const due = db.prepare(`
      SELECT user_id AS userId
      FROM notification_prefs
      WHERE enabled = 1
        AND delivery_time = ?
        AND (last_sent_date IS NULL OR last_sent_date <> ?)
    `).all(hhmm, today) as Array<{ userId: number }>;
    for (const d of due) {
      try {
        const result = await sendDigestToUser(d.userId);
        if (!result.ok) console.warn(`[digest] user ${d.userId}: ${result.reason}`);
        else console.log(`[digest] sent to user ${d.userId}`);
      } catch (err) {
        console.error(`[digest] user ${d.userId} failed:`, err);
      }
    }
  };
  // Fire once immediately (covers startup after a missed minute) then every minute.
  tick().catch(() => {});
  timer = setInterval(tick, 60_000);
  timer.unref?.();
}
