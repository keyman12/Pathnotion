import { useEffect, useMemo, useRef, useState } from 'react';
import { Dropdown } from '../components/Dropdown';
import { Icon } from '../components/Icon';
import { Badge, Button, Card, MetaLabel } from '../components/primitives';
import { api } from '../lib/api';
import { useCreateSalesBrief, useCreateSalesOpportunity, useDeleteSalesOpportunity, useFindMeetingNotes, useFindSalesLinkedIn, usePatchSalesOpportunity, useReorderSalesOpportunities, useSalesOpportunity, useSalesOpportunities, useSalesSummary } from '../lib/queries';
import { useUI } from '../lib/store';
import type { FounderKey, SalesForecastLabel, SalesOpportunity, SalesStage, SalesStatus, SalesSummary } from '../lib/types';

type SalesTab = 'opportunities' | 'pipeline' | 'forecast' | 'contacts' | 'docs';

const STAGE_OPTIONS: Array<{ value: SalesStage; label: string }> = [
  { value: 'lead', label: 'Lead' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'proposal', label: 'Proposal / Commercials' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'commit', label: 'Commit' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

const PIPELINE_STAGES: SalesStage[] = ['lead', 'qualified', 'proposal', 'negotiation', 'commit'];

const STATUS_OPTIONS: Array<{ value: SalesStatus; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'parked', label: 'Parked' },
];

const FORECAST_OPTIONS: Array<{ value: SalesForecastLabel; label: string }> = [
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'best_case', label: 'Best case' },
  { value: 'commit', label: 'Commit' },
];

const PROBABILITY_OPTIONS = [0, 20, 40, 60, 80, 100].map((value) => ({ value, label: `${value}%` }));

const FORECAST_DEFAULTS: Record<SalesStage, Record<SalesForecastLabel, number>> = {
  lead:        { pipeline: 10, best_case: 15, commit: 20 },
  qualified:   { pipeline: 20, best_case: 30, commit: 40 },
  proposal:    { pipeline: 35, best_case: 50, commit: 60 },
  negotiation: { pipeline: 50, best_case: 65, commit: 75 },
  commit:      { pipeline: 70, best_case: 85, commit: 95 },
  won:         { pipeline: 100, best_case: 100, commit: 100 },
  lost:        { pipeline: 0, best_case: 0, commit: 0 },
};

const DEFAULT_FORM = {
  name: '',
  accountName: '',
  contactFirstName: '',
  contactSurname: '',
  contactPhone: '',
  contactEmail: '',
  website: '',
  valueAmount: 0,
  ownerKey: 'D' as FounderKey,
  stage: 'lead' as SalesStage,
  status: 'active' as SalesStatus,
  forecastLabel: 'pipeline' as SalesForecastLabel,
  forecastProbability: 20,
  expectedCloseDate: '',
  nextActionDate: '',
  nextAction: '',
  documentFile: null as File | null,
};

export function SalesView() {
  const [tab, setTab] = useState<SalesTab>('opportunities');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const opportunitiesQ = useSalesOpportunities();
  const summaryQ = useSalesSummary();
  const opportunities = opportunitiesQ.data ?? [];
  const summary = summaryQ.data;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return opportunities;
    return opportunities.filter((o) =>
      [o.name, o.accountName, o.contactName, o.contactTitle, o.contactLocation, o.contactPhone, o.contactEmail, o.website]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [opportunities, query]);

  if (creating) return <CreateOpportunity onDone={(id) => { setCreating(false); if (id) setSelectedId(id); }} />;
  if (selectedId) return <OpportunityEdit id={selectedId} onBack={() => setSelectedId(null)} />;

  const tabs: Array<{ id: SalesTab; label: string; count?: string | number }> = [
    { id: 'opportunities', label: 'Opportunities', count: opportunities.length },
    { id: 'pipeline', label: 'Pipeline', count: opportunities.filter((o) => o.status === 'active').length },
    { id: 'forecast', label: 'Forecast', count: summary ? money(summary.weightedForecast) : undefined },
    { id: 'contacts', label: 'Contacts', count: new Set(opportunities.map((o) => o.contactEmail || o.contactName)).size },
    { id: 'docs', label: 'Docs', count: opportunities.reduce((sum, o) => sum + (o.links?.length ?? 0), 0) || 6 },
  ];

  return (
    <div className="screen-enter sales-screen">
      <div className="sales-head">
        <div>
          <div className="meta" style={{ fontSize: 10, marginBottom: 10 }}>
            SALES · {summary?.needsAttention ?? 0} NEED ATTENTION
          </div>
          <h1 className="sales-title">
            Sales pipeline. <span>{money(summary?.openPipeline ?? 0)} open, {money(summary?.weightedForecast ?? 0)} weighted, {money(summary?.commitWeightedThisMonth ?? 0)} commit this month.</span>
          </h1>
        </div>
        <Button variant="primary" icon={<Icon name="plus" size={14} />} onClick={() => setCreating(true)}>New opportunity</Button>
      </div>

      <div className="sales-menu">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'is-active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
            {t.count !== undefined && <span className="sales-badge">{t.count}</span>}
          </button>
        ))}
        <label className="sales-search">
          <Icon name="search" size={13} color="var(--fg-3)" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search opportunities, accounts, contacts…" />
        </label>
      </div>

      <MetricStrip summary={summary} />

      {tab === 'opportunities' && <OpportunitiesList opportunities={filtered} onOpen={setSelectedId} />}
      {tab === 'pipeline' && <PipelineBoard opportunities={filtered} onOpen={setSelectedId} />}
      {tab === 'forecast' && <ForecastView summary={summary} />}
      {tab === 'contacts' && <ContactsView opportunities={filtered} onOpen={setSelectedId} />}
      {tab === 'docs' && <DocsView />}
    </div>
  );
}

function MetricStrip({ summary }: { summary?: SalesSummary }) {
  const metrics = [
    { label: 'Open pipeline', value: money(summary?.openPipeline ?? 0), foot: `${summary?.activeCount ?? 0} active opportunities`, tone: 'tertiary' },
    { label: 'Weighted forecast', value: money(summary?.weightedForecast ?? 0), foot: 'Probability from stage + label' },
    { label: 'Commit this month', value: money(summary?.commitRawThisMonth ?? 0), foot: `${money(summary?.commitWeightedThisMonth ?? 0)} weighted`, good: true },
    { label: 'Needs attention', value: String(summary?.needsAttention ?? 0), foot: 'Overdue · stale · missing data', tone: 'tertiary' },
  ];
  return (
    <div className="sales-metrics">
      {metrics.map((m) => (
        <Card key={m.label} className="sales-metric">
          <div className="sales-metric__label">{m.label}</div>
          <div className={`sales-metric__value ${m.tone === 'tertiary' ? 'is-tertiary' : ''}`}>{m.value}</div>
          <div className={m.good ? 'fg-success' : 'fg-3'}>{m.foot}</div>
        </Card>
      ))}
    </div>
  );
}

function OpportunitiesList({ opportunities, onOpen }: { opportunities: SalesOpportunity[]; onOpen: (id: string) => void }) {
  return (
    <section>
      <div className="section-h"><h2>Opportunities</h2></div>
      <div className="sales-table-wrap">
        <table className="sales-table">
          <thead>
            <tr>
              {['Opportunity', 'Contact', 'Stage', 'Value', 'Forecast', 'Next action', 'Close'].map((h) => (
                <th key={h}><button>{h} <Icon name="chevron-down" size={10} /></button></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {opportunities.map((o) => (
              <tr key={o.id} onClick={() => onOpen(o.id)}>
                <td><strong>{o.accountName}</strong><div>{o.name}</div></td>
                <td>{o.contactName}<div>{o.contactPhone || o.contactEmail || 'Missing contact'}</div></td>
                <td><Badge>{stageLabel(o.stage)}</Badge></td>
                <td>{money(o.valueAmount)}</td>
                <td><Badge tone={o.forecastLabel === 'commit' ? 'success' : 'neutral'}>{o.forecastProbability}%</Badge></td>
                <td className={o.attentionFlags.some((f) => f.kind === 'overdue') ? 'fg-danger' : o.attentionFlags.length ? 'fg-warning' : ''}>{o.nextAction ?? 'No next action'}</td>
                <td>{shortDate(o.expectedCloseDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PipelineBoard({ opportunities, onOpen }: { opportunities: SalesOpportunity[]; onOpen: (id: string) => void }) {
  const reorder = useReorderSalesOpportunities();
  const [dragging, setDragging] = useState<string | null>(null);
  const byStage = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, opportunities.filter((o) => o.stage === s && o.status === 'active')])) as Record<SalesStage, SalesOpportunity[]>;

  const onDrop = async (stage: SalesStage) => {
    if (!dragging) return;
    const current = opportunities.find((o) => o.id === dragging);
    if (!current) return;
    const stageItems = byStage[stage].filter((o) => o.id !== dragging);
    await reorder.mutateAsync([{ id: dragging, stage, sortOrder: stageItems.length + 1 }]);
    setDragging(null);
  };

  return (
    <section>
      <div className="section-h">
        <h2>Pipeline board</h2>
        <span className="meta">Drag an opportunity into another stage to update status</span>
      </div>
      <div className="sales-board">
        {PIPELINE_STAGES.map((stage) => {
          const rows = byStage[stage] ?? [];
          return (
            <div
              key={stage}
              className="sales-stage"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(stage)}
            >
              <div className="sales-stage__head">
                <strong>{stageLabel(stage)}</strong>
                <span>{money(rows.reduce((sum, o) => sum + o.valueAmount, 0))}</span>
              </div>
              {rows.map((o) => (
                <div
                  key={o.id}
                  className="sales-card row-hover"
                  draggable
                  onDragStart={() => setDragging(o.id)}
                  onDragEnd={() => setDragging(null)}
                  onClick={() => onOpen(o.id)}
                >
                  <Icon name="drag" size={13} color="var(--fg-4)" />
                  <div style={{ minWidth: 0 }}>
                    <strong>{o.accountName}</strong>
                    <p>{o.nextAction ?? o.name}</p>
                    <div className="sales-card__foot">
                      <Badge tone={o.forecastLabel === 'commit' ? 'success' : 'neutral'}>{money(o.valueAmount)} · {o.forecastProbability}%</Badge>
                      {o.attentionFlags[0] && <Badge tone={o.attentionFlags[0].kind === 'overdue' ? 'danger' : 'warning'}>{o.attentionFlags[0].label}</Badge>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ForecastView({ summary }: { summary?: SalesSummary }) {
  return (
    <div className="sales-forecast-grid">
      <Card>
        <div className="section-h"><h2>Forecast by month</h2></div>
        <div className="sales-table-wrap">
          <table className="sales-table">
            <thead><tr><th>Month</th><th>Raw pipeline</th><th>Weighted</th><th>Commit raw</th><th>Commit weighted</th></tr></thead>
            <tbody>
              {(summary?.forecastByMonth ?? []).map((m) => (
                <tr key={m.month}><td>{monthLabel(m.month)}</td><td>{money(m.rawPipeline)}</td><td>{money(m.weighted)}</td><td>{money(m.commitRaw)}</td><td>{money(m.commitWeighted)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <div className="section-h"><h2>Probability model</h2><span className="meta">Stage + label defaults</span></div>
        {[
          ['Qualified', '20-40%', 40],
          ['Proposal', '35-60%', 60],
          ['Negotiation', '50-75%', 75],
          ['Commit', '70-95%', 95],
        ].map(([label, range, width]) => (
          <div key={label} className="sales-bar-row">
            <span>{label}</span>
            <div><i style={{ width: `${width}%` }} /></div>
            <span>{range}</span>
          </div>
        ))}
        <p className="fg-3" style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 16 }}>
          Users can override the percentage when they know more than the stage implies. Jeff can explain forecast movement but should not silently change probability.
        </p>
      </Card>
    </div>
  );
}

function ContactsView({ opportunities, onOpen }: { opportunities: SalesOpportunity[]; onOpen: (id: string) => void }) {
  return (
    <div className="sales-table-wrap">
      <table className="sales-table">
        <thead><tr><th>Contact</th><th>Account</th><th>Phone</th><th>Email</th><th>Opportunity</th></tr></thead>
        <tbody>
          {opportunities.map((o) => (
            <tr key={o.id} onClick={() => onOpen(o.id)}>
              <td>{o.contactName}</td>
              <td>{o.accountName}</td>
              <td className={!o.contactPhone ? 'fg-danger' : ''}>{o.contactPhone || 'Missing'}</td>
              <td className={!o.contactEmail ? 'fg-danger' : ''}>{o.contactEmail || 'Missing'}</td>
              <td>{money(o.valueAmount)} · {stageLabel(o.stage)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DocsView() {
  const navigate = useUI((s) => s.navigate);
  return (
    <Card>
      <div className="section-h"><h2>Sales docs</h2><button onClick={() => navigate('sales-docs')} className="fg-brand">Open Sales Docs route</button></div>
      {['Acme Bank proposal', 'Northstar pricing notes', 'Standard commercial pack'].map((name, i) => (
        <div key={name} className="sales-doc-row">
          <div><strong>{name}</strong><p>{i === 2 ? 'Template' : `Linked to CRM-0${14 + i * 4}`}</p></div>
          <span className="fg-3">{i === 0 ? '2d ago' : i === 1 ? 'today' : '1w ago'}</span>
        </div>
      ))}
    </Card>
  );
}

function CreateOpportunity({ onDone }: { onDone: (id?: string) => void }) {
  const create = useCreateSalesOpportunity();
  const [form, setForm] = useState(DEFAULT_FORM);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const updateStage = (stage: SalesStage) => {
    setForm((f) => ({
      ...f,
      stage,
      forecastProbability: defaultForecastProbability(stage, f.forecastLabel),
    }));
  };
  const updateForecastLabel = (forecastLabel: SalesForecastLabel) => {
    setForm((f) => ({
      ...f,
      forecastLabel,
      forecastProbability: defaultForecastProbability(f.stage, forecastLabel),
    }));
  };
  const weighted = Math.round((Number(form.valueAmount) || 0) * form.forecastProbability / 100);
  const contactName = [form.contactFirstName, form.contactSurname].map((part) => part.trim()).filter(Boolean).join(' ');
  const emailError = form.contactEmail && !isValidEmail(form.contactEmail) ? 'Enter a valid email address.' : undefined;
  const websiteError = form.website && !isValidWebsite(form.website) ? 'Enter a valid web address.' : undefined;

  const submit = async () => {
    const created = await create.mutateAsync({
      ...form,
      contactName,
    });
    if (form.documentFile) await api.sales.uploadAttachment(created.id, form.documentFile);
    onDone(created.id);
  };

  return (
    <div className="screen-enter sales-screen">
      <div className="sales-head">
        <div><MetaLabel>Quick create</MetaLabel><h1 className="sales-title">Capture a real opportunity in one short form.</h1></div>
        <Button variant="outline" onClick={() => onDone()}>Back to Sales</Button>
      </div>
      <div className="sales-create">
        <aside>
          <MetaLabel>New sales opportunity</MetaLabel>
          <h2>Fast capture, enough detail to follow up.</h2>
          <Card><div className="fg-3">Weighted value preview</div><strong>{money(weighted)}</strong><p>{money(Number(form.valueAmount) || 0)} × {form.forecastProbability}%</p></Card>
          <Card><strong>Jeff can help next</strong><p>After save, ask Jeff to research the account, draft follow-up, or prepare a meeting brief.</p></Card>
          <Card><strong>Required fields</strong><p>Opportunity description, account, contact, value, stage, close date, and next action.</p></Card>
        </aside>
        <div className="sales-form">
          <Field label="Opportunity description"><input className="input" value={form.name} onChange={(e) => update('name', e.target.value)} /></Field>
          <Field label="Account"><input className="input" value={form.accountName} onChange={(e) => update('accountName', e.target.value)} /></Field>
          <Field label="First name"><input className="input" value={form.contactFirstName} onChange={(e) => update('contactFirstName', e.target.value)} /></Field>
          <Field label="Surname"><input className="input" value={form.contactSurname} onChange={(e) => update('contactSurname', e.target.value)} /></Field>
          <Field label="Phone number"><input className="input" value={form.contactPhone} onChange={(e) => update('contactPhone', e.target.value)} /></Field>
          <Field label="Email" error={emailError}><input className={`input ${emailError ? 'is-invalid' : ''}`} type="email" value={form.contactEmail} onChange={(e) => update('contactEmail', e.target.value)} /></Field>
          <Field label="Website" error={websiteError}><input className={`input ${websiteError ? 'is-invalid' : ''}`} inputMode="url" value={form.website} onChange={(e) => update('website', e.target.value)} /></Field>
          <Field label="Value (£)"><MoneyInput value={form.valueAmount} onChange={(value) => update('valueAmount', value)} /></Field>
          <Field label="Owner"><Dropdown value={form.ownerKey} onChange={(v) => update('ownerKey', v as FounderKey)} options={[{ value: 'D', label: 'Dave' }, { value: 'R', label: 'Raj' }]} /></Field>
          <Field label="Stage"><Dropdown value={form.stage} onChange={(v) => updateStage(v as SalesStage)} options={STAGE_OPTIONS} /></Field>
          <Field label="Forecast label"><Dropdown value={form.forecastLabel} onChange={(v) => updateForecastLabel(v as SalesForecastLabel)} options={FORECAST_OPTIONS} /></Field>
          <Field label="Forecast %"><Dropdown value={form.forecastProbability} onChange={(v) => update('forecastProbability', Number(v))} options={PROBABILITY_OPTIONS} /></Field>
          <Field label="Expected close"><DateTextInput value={form.expectedCloseDate} onChange={(v) => update('expectedCloseDate', v)} /></Field>
          <Field label="Next action date"><DateTextInput value={form.nextActionDate} onChange={(v) => update('nextActionDate', v)} /></Field>
          <Field label="Next action" wide><input className="input" value={form.nextAction} onChange={(e) => update('nextAction', e.target.value)} /></Field>
          <Field label="Attach document" wide>
            <div className="sales-attach">
              <label className="sales-file-pick">
                <Icon name="upload" size={14} />
                <span>{form.documentFile ? form.documentFile.name : 'Choose file from this PC'}</span>
                <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,image/*,application/pdf" onChange={(e) => update('documentFile', e.target.files?.[0] ?? null)} />
              </label>
            </div>
          </Field>
          <div className="sales-form-actions">
            <Button variant="primary" onClick={submit} disabled={create.isPending || !form.name || !form.accountName || !contactName || !!emailError || !!websiteError}>Create opportunity</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OpportunityEdit({ id, onBack }: { id: string; onBack: () => void }) {
  const opportunityQ = useSalesOpportunity(id);
  const patch = usePatchSalesOpportunity();
  const remove = useDeleteSalesOpportunity();
  const findLinkedIn = useFindSalesLinkedIn();
  const createBrief = useCreateSalesBrief();
  const findMeetingNotes = useFindMeetingNotes();
  const opportunity = opportunityQ.data;
  const [note, setNote] = useState('');
  const [noteActionDate, setNoteActionDate] = useState('');
  const [draft, setDraft] = useState<Partial<SalesOpportunity>>({});
  const [filesBusy, setFilesBusy] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  if (!opportunity) return <div className="screen-enter">Loading opportunity…</div>;

  const value = { ...opportunity, ...draft };
  const [firstName, surname] = splitName(value.contactName);
  const emailError = value.contactEmail && !isValidEmail(value.contactEmail) ? 'Enter a valid email address.' : undefined;
  const websiteError = value.website && !isValidWebsite(value.website) ? 'Enter a valid web address.' : undefined;
  const hasPendingChanges = Object.keys(draft).length > 0 || !!note.trim();
  const update = <K extends keyof SalesOpportunity>(key: K, next: SalesOpportunity[K]) => {
    setSaveState('idle');
    setDraft((d) => ({ ...d, [key]: next }));
  };
  const updateStage = (stage: SalesStage) => {
    setSaveState('idle');
    setDraft((d) => ({
      ...d,
      stage,
      forecastProbability: defaultForecastProbability(stage, (d.forecastLabel ?? opportunity.forecastLabel) as SalesForecastLabel),
    }));
  };
  const updateForecastLabel = (forecastLabel: SalesForecastLabel) => {
    setSaveState('idle');
    setDraft((d) => ({
      ...d,
      forecastLabel,
      forecastProbability: defaultForecastProbability((d.stage ?? opportunity.stage) as SalesStage, forecastLabel),
    }));
  };
  const save = async () => {
    if (!hasPendingChanges || emailError || websiteError) return;
    setSaveState('saving');
    try {
      await Promise.all([
        patch.mutateAsync({ id, patch: { ...draft, note: note.trim() || undefined, noteActionDate: note.trim() && noteActionDate ? noteActionDate : undefined } }),
        delay(500),
      ]);
      setDraft({});
      setNote('');
      setNoteActionDate('');
      setSaveState('saved');
    } catch {
      setSaveState('idle');
    }
  };
  const deleteOpportunity = async () => {
    if (!confirm(`Delete ${opportunity.accountName}? This removes the opportunity and its timeline.`)) return;
    await remove.mutateAsync(id);
    onBack();
  };
  const uploadFile = async (file: File | null | undefined) => {
    if (!file) return;
    setFilesBusy(true);
    try {
      await api.sales.uploadAttachment(id, file);
      await opportunityQ.refetch();
    } finally {
      setFilesBusy(false);
    }
  };
  const removeFile = async (linkId: string) => {
    setFilesBusy(true);
    try {
      await api.sales.removeLink(linkId);
      await opportunityQ.refetch();
    } finally {
      setFilesBusy(false);
    }
  };
  const enrichLinkedIn = async () => {
    try {
      await findLinkedIn.mutateAsync(id);
      await opportunityQ.refetch();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Jeff could not add a LinkedIn link.');
    }
  };
  const enrichBrief = async () => {
    try {
      await createBrief.mutateAsync(id);
      await opportunityQ.refetch();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Jeff could not create the company brief.');
    }
  };
  const scanMeetingNotes = async () => {
    try {
      const result = await findMeetingNotes.mutateAsync(id);
      await opportunityQ.refetch();
      if (!result.linked) window.alert('Jeff did not find any new meeting notes for this opportunity.');
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Jeff could not scan meeting notes.');
    }
  };

  return (
    <div className="screen-enter sales-screen">
      <div className="sales-head sales-head--edit">
        <div>
          <Button
            variant="ghost"
            size="sm"
            icon={<Icon name="chevron-left" size={13} />}
            onClick={onBack}
            style={{ marginBottom: 10, paddingLeft: 0 }}
          >
            Back to Sales
          </Button>
          <MetaLabel>Opportunity edit</MetaLabel>
          <h1 className="sales-title">Edit {opportunity.accountName}.</h1>
        </div>
      </div>
      <Card className="sales-edit">
        <div className="sales-edit__head">
          <div><MetaLabel>{opportunity.id}</MetaLabel><h2>{value.accountName}</h2><p>{value.name}</p></div>
          <ContactProfileCard opportunity={value as SalesOpportunity} />
        </div>
        <div className="sales-form">
          <Field label="Value (£)"><MoneyInput value={value.valueAmount} onChange={(next) => update('valueAmount', next)} /></Field>
          <Field label="Expected close date"><DateTextInput value={value.expectedCloseDate ?? ''} onChange={(v) => update('expectedCloseDate', v)} /></Field>
          <Field label="Owner"><Dropdown value={value.ownerKey} onChange={(v) => update('ownerKey', v as FounderKey)} options={[{ value: 'D', label: 'Dave' }, { value: 'R', label: 'Raj' }]} /></Field>
          <Field label="Status"><Dropdown value={value.status} onChange={(v) => update('status', v as SalesStatus)} options={STATUS_OPTIONS} /></Field>
          <Field label="Stage"><Dropdown value={value.stage} onChange={(v) => updateStage(v as SalesStage)} options={STAGE_OPTIONS} /></Field>
          <Field label="Forecast"><Dropdown value={value.forecastLabel} onChange={(v) => updateForecastLabel(v as SalesForecastLabel)} options={FORECAST_OPTIONS} /></Field>
          <Field label="First name"><input className="input" value={firstName} onChange={(e) => update('contactName', combineName(e.target.value, surname))} /></Field>
          <Field label="Surname"><input className="input" value={surname} onChange={(e) => update('contactName', combineName(firstName, e.target.value))} /></Field>
          <Field label="Forecast %"><Dropdown value={value.forecastProbability} onChange={(v) => update('forecastProbability', Number(v))} options={PROBABILITY_OPTIONS} /></Field>
          <Field label="Phone"><input className="input" value={value.contactPhone ?? ''} onChange={(e) => update('contactPhone', e.target.value)} /></Field>
          <Field label="Email" error={emailError}><input className={`input ${emailError ? 'is-invalid' : ''}`} type="email" value={value.contactEmail ?? ''} onChange={(e) => update('contactEmail', e.target.value)} /></Field>
          <Field label="Website" error={websiteError}><input className={`input ${websiteError ? 'is-invalid' : ''}`} inputMode="url" value={value.website ?? ''} onChange={(e) => update('website', e.target.value)} /></Field>
          <Field label="Notes / next action" wide>
            <div className="sales-note-input">
              <textarea className="input" rows={3} value={note} onChange={(e) => { setSaveState('idle'); setNote(e.target.value); }} placeholder="Add the latest note or next action." />
              <DateIconButton value={noteActionDate} onChange={(v) => { setSaveState('idle'); setNoteActionDate(v); }} />
            </div>
          </Field>
        </div>
        <FilesSection
          opportunity={value as SalesOpportunity}
          links={opportunity.links ?? []}
          busy={filesBusy || findLinkedIn.isPending || createBrief.isPending || findMeetingNotes.isPending}
          onUpload={uploadFile}
          onRemove={removeFile}
          onFindLinkedIn={enrichLinkedIn}
          onCreateBrief={enrichBrief}
          onFindMeetingNotes={scanMeetingNotes}
          findingLinkedIn={findLinkedIn.isPending}
          creatingBrief={createBrief.isPending}
          findingMeetingNotes={findMeetingNotes.isPending}
        />
        <div className="section-h" style={{ marginTop: 16 }}><h2>Timeline</h2><span className="fg-3">Newest first</span></div>
        <div className="sales-timeline">
          {opportunity.nextAction && (
            <div>
              <strong>Next action</strong>
              <p>{opportunity.nextAction}{opportunity.nextActionDate ? ` · ${toDmy(opportunity.nextActionDate)}` : ''}</p>
            </div>
          )}
          {(opportunity.activities ?? []).map((a) => (
            <div key={a.id}>
              <strong>{a.type === 'jeff' ? 'Jeff' : a.type === 'stage' ? 'Stage update' : a.type === 'link' ? 'Linked item' : 'Note'}</strong>
              <p>{a.body}</p>
            </div>
          ))}
        </div>
        <div className="sales-form-actions">
          <Button
            variant="danger"
            onClick={deleteOpportunity}
            disabled={remove.isPending}
            style={{ marginRight: 'auto' }}
          >
            {remove.isPending ? 'Deleting…' : 'Delete'}
          </Button>
          <Button variant="outline" onClick={onBack}>Cancel</Button>
          <Button
            variant="primary"
            onClick={save}
            disabled={!hasPendingChanges || saveState !== 'idle' || patch.isPending || !!emailError || !!websiteError}
          >
            {saveState === 'saving' || patch.isPending ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save changes'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function ContactProfileCard({ opportunity }: { opportunity: SalesOpportunity }) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [opportunity.contactPhotoUrl]);
  const detail = [opportunity.contactTitle, opportunity.contactLocation].filter(Boolean).join(' · ');
  const photoUrl = imageFailed ? null : opportunity.contactPhotoUrl;
  return (
    <div className="sales-contact-profile">
      <div className="sales-contact-profile__avatar" aria-hidden="true">
        {photoUrl ? (
          <img src={photoUrl} alt="" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />
        ) : (
          <span>{initials(opportunity.contactName || opportunity.accountName)}</span>
        )}
      </div>
      <div>
        <strong>{opportunity.contactName || 'Contact'}</strong>
        <p>{detail || opportunity.contactEmail || 'LinkedIn enrichment pending'}</p>
      </div>
    </div>
  );
}

function FilesSection({
  opportunity,
  links,
  busy,
  onUpload,
  onRemove,
  onFindLinkedIn,
  onCreateBrief,
  onFindMeetingNotes,
  findingLinkedIn,
  creatingBrief,
  findingMeetingNotes,
}: {
  opportunity: SalesOpportunity;
  links: NonNullable<SalesOpportunity['links']>;
  busy: boolean;
  onUpload: (file: File | null | undefined) => void;
  onRemove: (id: string) => void;
  onFindLinkedIn: () => void;
  onCreateBrief: () => void;
  onFindMeetingNotes: () => void;
  findingLinkedIn: boolean;
  creatingBrief: boolean;
  findingMeetingNotes: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useUI((s) => s.navigate);
  const files = links
    .filter((link) => link.linkType === 'upload' || link.linkType === 'drive' || link.linkType === 'doc' || link.linkType === 'url')
    .sort((a, b) => linkPriority(a) - linkPriority(b));
  const hasLinkedIn = files.some((link) => /linkedin\.com/i.test(link.linkRef));
  const hasBrief = files.some((link) => link.linkType === 'doc' && /^Jeff brief ·/i.test(link.label ?? ''));
  const browserHref = (link: NonNullable<SalesOpportunity['links']>[number]) => {
    if (link.linkType === 'url') return normalizeUrl(link.linkRef);
    if (link.linkType === 'drive') return googleDriveOpenUrl(link.linkRef);
    return null;
  };
  const openLink = async (link: NonNullable<SalesOpportunity['links']>[number]) => {
    if (link.linkType === 'url') {
      openExternalUrl(normalizeUrl(link.linkRef));
      return;
    }
    if (link.linkType === 'drive') {
      openExternalUrl(googleDriveOpenUrl(link.linkRef));
      return;
    }
    if (link.linkType === 'upload') {
      const opened = window.open('', '_blank');
      try {
        if (opened) {
          opened.document.title = 'Opening file';
          opened.document.body.innerHTML = '<p style="font: 14px system-ui; padding: 24px;">Opening in Google Drive...</p>';
        }
        const result = await api.sales.openLink(link.id);
        if (opened) {
          opened.opener = null;
          opened.location.href = result.url;
        } else {
          window.open(result.url, '_blank', 'noopener,noreferrer');
        }
      } catch (err) {
        opened?.close();
        window.alert(err instanceof Error ? err.message : 'Could not open this file.');
      }
      return;
    }
    if (link.linkType === 'doc') {
      navigate('sales-docs', link.linkRef);
    }
  };
  return (
    <section className="sales-files">
      <div className="section-h">
        <h2>Files and links</h2>
        <div className="sales-file-tools">
          <button type="button" onClick={onFindLinkedIn} disabled={busy}>
            {findingLinkedIn ? 'Finding LinkedIn…' : hasLinkedIn ? 'Refresh LinkedIn' : 'Find LinkedIn'}
          </button>
          <button type="button" onClick={onCreateBrief} disabled={busy}>
            {creatingBrief ? 'Briefing…' : hasBrief ? 'Refresh brief' : 'Create brief'}
          </button>
          <button type="button" onClick={onFindMeetingNotes} disabled={busy}>
            {findingMeetingNotes ? 'Scanning…' : 'Find meeting notes'}
          </button>
          <button type="button" className="fg-brand" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? 'Working…' : 'Upload file'}
          </button>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        className="sales-file-hidden"
        accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,image/*,application/pdf"
        onChange={(e) => {
          onUpload(e.target.files?.[0]);
          e.currentTarget.value = '';
        }}
      />
      <div className="sales-file-list">
        {files.length ? files.map((link) => (
          <FileRow key={link.id} opportunity={opportunity} link={link} href={browserHref(link)} busy={busy} onOpen={openLink} onRemove={onRemove} />
        )) : (
          <div className="sales-file-empty">No files attached yet.</div>
        )}
      </div>
    </section>
  );
}

function FileRow({ opportunity, link, href, busy, onOpen, onRemove }: {
  opportunity: SalesOpportunity;
  link: NonNullable<SalesOpportunity['links']>[number];
  href: string | null;
  busy: boolean;
  onOpen: (link: NonNullable<SalesOpportunity['links']>[number]) => void | Promise<void>;
  onRemove: (id: string) => void;
}) {
  const isLinkedIn = /linkedin\.com/i.test(link.linkRef);
  const label = isLinkedIn ? (link.label ?? opportunity.contactName ?? link.linkRef) : (link.label ?? link.linkRef);
  const detail = isLinkedIn
    ? [opportunity.contactTitle, opportunity.contactLocation].filter(Boolean).join(' · ') || 'LinkedIn profile'
    : link.linkType === 'upload' ? uploadActionLabel(label) : link.linkType;
  const openHref = href ?? undefined;
  return (
    <div
      className="sales-file-row"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(link)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(link);
        }
      }}
      title="Open document"
    >
      <Icon name={link.linkType === 'url' ? 'arrow-up-right' : 'docs'} size={14} color="var(--fg-3)" />
      <div>
        {href ? (
          <a
            className="sales-file-link"
            href={openHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openExternalUrl(href);
            }}
          >
            {label}
          </a>
        ) : (
          <button type="button" className="sales-file-link sales-file-link--button" onClick={(e) => { e.stopPropagation(); onOpen(link); }}>
            {label}
          </button>
        )}
        <p>{detail}</p>
      </div>
      <div className="sales-file-actions">
        {href ? (
          <a
            href={openHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openExternalUrl(href);
            }}
          >
            Open
          </a>
        ) : (
          <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(link); }}>Open</button>
        )}
        <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(link.id); }} disabled={busy}>Remove</button>
      </div>
    </div>
  );
}

function Field({ label, wide, error, children }: { label: string; wide?: boolean; error?: string | false | null; children: React.ReactNode }) {
  return <label className={wide ? 'sales-field is-wide' : 'sales-field'}><span>{label}</span>{children}{error && <em>{error}</em>}</label>;
}

function MoneyInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const display = value ? new Intl.NumberFormat('en-GB').format(value) : '';
  return (
    <input
      className="input"
      inputMode="numeric"
      value={display}
      placeholder="0"
      onChange={(e) => onChange(parseMoney(e.target.value))}
    />
  );
}

function DateTextInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const openPicker = () => {
    const picker = pickerRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (picker?.showPicker) picker.showPicker();
    else picker?.click();
  };
  return (
    <div className="sales-date-input">
      <input
        ref={inputRef}
        className="input"
        value={toDmy(value)}
        placeholder="dd-mm-yyyy"
        onChange={(e) => onChange(fromDmy(e.target.value))}
        onFocus={openPicker}
        onClick={openPicker}
      />
      <input
        ref={pickerRef}
        type="date"
        value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}

function DateIconButton({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const openPicker = () => {
    const picker = pickerRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (picker?.showPicker) picker.showPicker();
    else picker?.click();
  };
  return (
    <button
      type="button"
      className={`sales-note-date ${value ? 'has-date' : ''}`}
      title={value ? `Next action date ${toDmy(value)}` : 'Set next action date'}
      aria-label={value ? `Next action date ${toDmy(value)}` : 'Set next action date'}
      onClick={openPicker}
    >
      <Icon name="calendar" size={14} />
      <input
        ref={pickerRef}
        type="date"
        value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
      />
    </button>
  );
}

function parseMoney(value: string): number {
  const cleaned = value.replace(/[£,\s]/g, '');
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed);
}

function defaultForecastProbability(stage: SalesStage, label: SalesForecastLabel): number {
  return FORECAST_DEFAULTS[stage]?.[label] ?? 0;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function money(value: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(value || 0).replace('£', '£');
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidWebsite(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  if (/^[\w.-]+$/i.test(trimmed) && /[a-z0-9]/i.test(trimmed)) return true;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return /^[a-z0-9.-]+$/i.test(url.hostname) && /[a-z0-9]/i.test(url.hostname);
  } catch {
    return false;
  }
}

function normalizeUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function googleDriveOpenUrl(fileIdOrUrl: string): string {
  if (/^https?:\/\//i.test(fileIdOrUrl)) return fileIdOrUrl;
  return `https://drive.google.com/open?id=${encodeURIComponent(fileIdOrUrl)}`;
}

function openExternalUrl(url: string) {
  const opened = window.open(url, '_blank');
  if (opened) {
    opened.opener = null;
  } else {
    window.location.href = url;
  }
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : value.slice(0, 2)).toUpperCase();
}

function uploadActionLabel(name: string): string {
  return canPreviewUploadedFile(name) ? 'Open preview' : 'Open in Drive';
}

function canPreviewUploadedFile(name: string): boolean {
  return /\.(pdf|png|jpe?g|gif|txt|md|csv)$/i.test(name);
}

function linkPriority(link: NonNullable<SalesOpportunity['links']>[number]): number {
  if (/linkedin\.com/i.test(link.linkRef)) return 0;
  if (link.linkType === 'doc' && /^Jeff brief ·/i.test(link.label ?? '')) return 1;
  if (link.linkType === 'upload' || link.linkType === 'drive') return 2;
  if (link.linkType === 'doc') return 3;
  return 4;
}

function splitName(value: string): [string, string] {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return [parts[0] ?? '', ''];
  return [parts[0], parts.slice(1).join(' ')];
}

function combineName(firstName: string, surname: string): string {
  return [firstName.trim(), surname.trim()].filter(Boolean).join(' ');
}

function stageLabel(stage: SalesStage) {
  return STAGE_OPTIONS.find((s) => s.value === stage)?.label ?? stage;
}

function forecastLabel(label: SalesForecastLabel) {
  return FORECAST_OPTIONS.find((f) => f.value === label)?.label ?? label;
}

function shortDate(value: string | null | undefined) {
  if (!value) return 'No date';
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function monthLabel(value: string) {
  if (value === 'No date') return value;
  return new Date(`${value}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function toDmy(value: string | null | undefined) {
  if (!value) return '';
  const [y, m, d] = value.slice(0, 10).split('-');
  if (!y || !m || !d) return value;
  return `${d}-${m}-${y}`;
}

function fromDmy(value: string) {
  const cleaned = value.trim();
  const match = cleaned.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return cleaned;
  return `${match[3]}-${match[2]}-${match[1]}`;
}
