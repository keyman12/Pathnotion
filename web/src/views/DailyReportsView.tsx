import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../components/PageHeader';
import { api, type ReportSummary } from '../lib/api';
import { useUI } from '../lib/store';

export function DailyReportsView() {
  const reportsQ = useQuery({ queryKey: ['reports'], queryFn: () => api.reports.list() });
  const theme = useUI((s) => s.theme);
  const reports = reportsQ.data ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const activeDate = selected ?? reports[0]?.date ?? null;
  const active = reports.find((r) => r.date === activeDate) ?? null;

  return (
    <div className="screen-enter">
      <PageHeader
        title="Daily Reports"
        sub="Automated UK card-payment provider comparison, refreshed each morning. Previous days are archived on the left."
      />

      {reportsQ.isLoading && (
        <div style={{ color: 'var(--fg-3)', fontSize: 13 }}>Loading…</div>
      )}

      {!reportsQ.isLoading && reports.length === 0 && (
        <div style={{
          padding: '32px 16px', textAlign: 'center', color: 'var(--fg-4)', fontSize: 13,
          border: '1px dashed var(--border-default)', borderRadius: 8,
        }}>
          No reports published yet. The daily job posts here each morning.
        </div>
      )}

      {reports.length > 0 && activeDate && (
        <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: 16, alignItems: 'start' }}>
          {/* Archive */}
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 8, overflow: 'hidden',
          }}>
            <div style={{
              padding: '10px 14px', borderBottom: '1px solid var(--border-default)',
              fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              Archive · {reports.length}
            </div>
            {reports.map((r) => (
              <button
                key={r.date}
                type="button"
                onClick={() => setSelected(r.date)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px',
                  border: 'none', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer',
                  background: r.date === activeDate ? 'var(--bg-sunken)' : 'transparent',
                  color: 'var(--fg-1)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: r.date === activeDate ? 600 : 500 }}>
                  {formatDate(r.date)}
                </div>
                <div style={{ marginTop: 4 }}><Counts counts={r.counts} /></div>
              </button>
            ))}
          </div>

          {/* Active report */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {active?.title ?? formatDate(activeDate)}
              </div>
              <a
                href={api.reports.htmlUrl(activeDate, theme)}
                target="_blank"
                rel="noopener"
                style={{ fontSize: 12, color: 'var(--fg-link, var(--path-primary))', whiteSpace: 'nowrap' }}
              >
                Open in new tab ↗
              </a>
            </div>
            {/* Sandboxed: the report HTML contains scraped third-party text, so it must not reach
                the app, cookies, or same-origin APIs. allow-scripts lets its theme toggle run; the
                absence of allow-same-origin makes it an opaque origin. */}
            <iframe
              key={`${activeDate}:${theme}`}
              title={`Report ${activeDate}`}
              src={api.reports.htmlUrl(activeDate, theme)}
              sandbox="allow-scripts"
              style={{
                width: '100%', height: '78vh', border: '1px solid var(--border-default)',
                borderRadius: 8, background: 'var(--bg-surface)',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Counts({ counts }: { counts: ReportSummary['counts'] }) {
  if (!counts) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 8, fontSize: 10.5 }}>
      <span style={{ color: 'var(--path-primary)' }}>{counts.ok} ok</span>
      <span style={{ color: 'var(--warning-fg)' }}>{counts.lowConfidence} review</span>
      <span style={{ color: 'var(--danger-fg)' }}>{counts.failed} failed</span>
    </span>
  );
}

function formatDate(d: string): string {
  try {
    return new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch {
    return d;
  }
}
