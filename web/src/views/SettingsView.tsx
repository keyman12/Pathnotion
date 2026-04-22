import { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Avatar, InfoTip } from '../components/primitives';
import { Dropdown } from '../components/Dropdown';
import { Icon } from '../components/Icon';
import {
  useBusinessCategories,
  useClearJeffLogo,
  useCompetitors,
  useConnectGoogleCalendar,
  useCreateBusinessCategory,
  useCreateCompetitor,
  useCreateProduct,
  useCreateUser,
  useDeleteBusinessCategory,
  useDeleteCompetitor,
  useDeleteProduct,
  useDisconnectGoogleCalendar,
  useDriveConfig,
  useGoogleCalendarStatus,
  useJeffSettings,
  useJeffStyleSheet,
  useNotificationPrefs,
  usePatchBusinessCategory,
  usePatchCompetitor,
  usePatchNotificationPrefs,
  usePatchProduct,
  usePatchUser,
  usePinnedFolders,
  useProducts,
  useResetUserPassword,
  useSaveJeffSettings,
  useSaveJeffStyleSheet,
  useSendDigestTest,
  useSetWorkspaceDrive,
  useSharedDrives,
  useTestGoogleCalendar,
  useUnpinFolder,
  useUploadJeffLogo,
  useUsers,
} from '../lib/queries';
import { useSession } from '../lib/useSession';
import { useUI } from '../lib/store';
import { api } from '../lib/api';
import type { BusinessCategory, JeffCompetitor, JeffLogoRef, JeffStyleSheet, JeffTypeScale, NotificationPrefs, SessionUser } from '../lib/api';
import type { Product } from '../lib/types';

type Tab = 'users' | 'products' | 'categories' | 'jeff' | 'google' | 'notifications';

export function SettingsView() {
  const [tab, setTab] = useState<Tab>('users');
  const session = useSession();
  const isAdmin = session.data?.role === 'admin';

  return (
    <div className="screen-enter">
      <PageHeader<Tab>
        title="Settings"
        sub="Workspace configuration"
        tabs={[
          { id: 'users', label: 'Users' },
          { id: 'products', label: 'Products' },
          { id: 'categories', label: 'Business categories' },
          { id: 'jeff', label: 'Jeff' },
          { id: 'google', label: 'Google' },
          { id: 'notifications', label: 'Notifications' },
        ]}
        activeTab={tab}
        onTab={setTab}
      />

      {tab === 'users' && (isAdmin ? <UsersTab /> : <NotAllowed />)}
      {tab === 'products' && (isAdmin ? <ProductsTab /> : <NotAllowed />)}
      {tab === 'categories' && (isAdmin ? <CategoriesTab /> : <NotAllowed />)}
      {tab === 'jeff' && (isAdmin ? <JeffTab /> : <NotAllowed />)}
      {tab === 'google' && <GoogleTab />}
      {tab === 'notifications' && <NotificationsTab />}
    </div>
  );
}

function NotAllowed() {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 8,
      padding: '24px 28px',
      fontSize: 13,
      color: 'var(--fg-3)',
    }}>
      This section is admin-only.
    </div>
  );
}

function ProductsTab() {
  const productsQ = useProducts();
  const createProd = useCreateProduct();
  const patchProd = usePatchProduct();
  const deleteProd = useDeleteProduct();
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const products = productsQ.data ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12.5, color: 'var(--fg-3)' }}>
          {products.length} product{products.length === 1 ? '' : 's'} — columns in the backlog kanban and entries in the sidebar.
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          <Icon name="plus" size={14} /> New product
        </button>
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
        {products.map((p, i) => (
          <div key={p.id} style={{
            display: 'grid',
            gridTemplateColumns: '28px 130px 1fr 80px 70px 32px 28px',
            alignItems: 'center',
            gap: 14,
            padding: '12px 16px',
            borderBottom: i < products.length - 1 ? '1px solid var(--border-subtle)' : 'none',
          }}>
            <span style={{ width: 14, height: 14, borderRadius: 3, background: p.color, border: '1px solid var(--border-subtle)' }} />
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-4)' }}>{p.id}</span>
            <span style={{ fontSize: 13.5, color: 'var(--fg-1)', fontWeight: 500 }}>{p.label}</span>
            <span className="mono" style={{ fontSize: 10, color: 'var(--fg-4)' }}>{p.count ?? 0} items</span>
            <span className="mono" style={{ fontSize: 10, color: 'var(--fg-4)' }}>{p.color}</span>
            <button className="btn btn-subtle btn-icon" title="Edit" onClick={() => setEditing(p)}>
              <Icon name="edit" size={13} />
            </button>
            <button
              className="btn btn-subtle btn-icon"
              title="Delete"
              onClick={() => {
                if ((p.count ?? 0) > 0) { alert(`Can't delete "${p.label}" while ${p.count} backlog items are attached.`); return; }
                if (confirm(`Delete product "${p.label}"?`)) deleteProd.mutate(p.id);
              }}
              style={{ color: 'var(--danger-fg)' }}
            >
              <Icon name="close" size={13} />
            </button>
          </div>
        ))}
      </div>

      {showNew && (
        <ProductDialog
          title="New product"
          onClose={() => setShowNew(false)}
          onSubmit={(body) => createProd.mutate(body, { onSuccess: () => setShowNew(false) })}
        />
      )}
      {editing && (
        <ProductDialog
          title={`Edit ${editing.label}`}
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={(body) => patchProd.mutate({ id: editing.id, patch: body }, { onSuccess: () => setEditing(null) })}
        />
      )}
    </div>
  );
}

function ProductDialog({ title, initial, onClose, onSubmit }: {
  title: string;
  initial?: Product;
  onClose: () => void;
  onSubmit: (body: { id: string; label: string; color: string; accent?: string }) => void;
}) {
  const [id, setId] = useState(initial?.id ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [color, setColor] = useState(initial?.color ?? '#297D2D');
  const [accent, setAccent] = useState(initial?.accent ?? initial?.color ?? '#49BC4E');
  const isEdit = !!initial;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !label.trim() || !color.trim()) return;
    onSubmit({ id: id.trim().toLowerCase(), label: label.trim(), color, accent });
  };

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Labelled label="ID">
          <input
            value={id}
            onChange={(e) => setId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            disabled={isEdit}
            placeholder="e.g. hr-platform"
            className="input"
            style={{ height: 32, width: '100%', opacity: isEdit ? 0.6 : 1 }}
          />
        </Labelled>
        <Labelled label="Label">
          <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} className="input" style={{ height: 32, width: '100%' }} />
        </Labelled>
        <Labelled label="Colour">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 44, height: 32, border: 'none', padding: 0, background: 'transparent', cursor: 'pointer' }} />
            <input value={color} onChange={(e) => setColor(e.target.value)} className="input" style={{ height: 32, flex: 1 }} />
          </div>
        </Labelled>
        <Labelled label="Accent">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} style={{ width: 44, height: 32, border: 'none', padding: 0, background: 'transparent', cursor: 'pointer' }} />
            <input value={accent} onChange={(e) => setAccent(e.target.value)} className="input" style={{ height: 32, flex: 1 }} />
          </div>
        </Labelled>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!id.trim() || !label.trim() || !color.trim()}>
            {isEdit ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CategoriesTab() {
  const q = useBusinessCategories();
  const createCat = useCreateBusinessCategory();
  const patchCat = usePatchBusinessCategory();
  const deleteCat = useDeleteBusinessCategory();
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<BusinessCategory | null>(null);

  const cats = q.data ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12.5, color: 'var(--fg-3)' }}>
          {cats.length} categor{cats.length === 1 ? 'y' : 'ies'} — surfaced in the sidebar under Business.
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          <Icon name="plus" size={14} /> New category
        </button>
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
        {cats.map((c, i) => (
          <div key={c.id} style={{
            display: 'grid',
            gridTemplateColumns: '32px 120px 1fr 80px 32px 28px',
            alignItems: 'center',
            gap: 14,
            padding: '12px 16px',
            borderBottom: i < cats.length - 1 ? '1px solid var(--border-subtle)' : 'none',
          }}>
            <Icon name={c.icon as any} size={16} color="var(--fg-2)" />
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-4)' }}>{c.id}</span>
            <span style={{ fontSize: 13.5, color: 'var(--fg-1)', fontWeight: 500 }}>{c.label}</span>
            <span className="mono" style={{ fontSize: 10, color: 'var(--fg-4)' }}>sort {c.sortOrder}</span>
            <button className="btn btn-subtle btn-icon" title="Edit" onClick={() => setEditing(c)}>
              <Icon name="edit" size={13} />
            </button>
            <button
              className="btn btn-subtle btn-icon"
              title="Delete"
              onClick={() => { if (confirm(`Delete category "${c.label}"? Docs under this category will be orphaned.`)) deleteCat.mutate(c.id); }}
              style={{ color: 'var(--danger-fg)' }}
            >
              <Icon name="close" size={13} />
            </button>
          </div>
        ))}
        {!cats.length && (
          <div style={{ padding: '24px 18px', textAlign: 'center', color: 'var(--fg-4)', fontSize: 13 }}>
            No categories yet.
          </div>
        )}
      </div>

      {showNew && (
        <CategoryDialog
          title="New category"
          onClose={() => setShowNew(false)}
          onSubmit={(body) => createCat.mutate(body, { onSuccess: () => setShowNew(false) })}
        />
      )}
      {editing && (
        <CategoryDialog
          title={`Edit ${editing.label}`}
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={(body) => patchCat.mutate({ id: editing.id, patch: body }, { onSuccess: () => setEditing(null) })}
        />
      )}
    </div>
  );
}

function CategoryDialog({ title, initial, onClose, onSubmit }: {
  title: string;
  initial?: BusinessCategory;
  onClose: () => void;
  onSubmit: (body: { id: string; label: string; icon?: string }) => void;
}) {
  const [id, setId] = useState(initial?.id ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? 'money');
  const isEdit = !!initial;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !label.trim()) return;
    onSubmit({ id: id.trim().toLowerCase(), label: label.trim(), icon });
  };

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Labelled label="ID">
          <input
            value={id}
            onChange={(e) => setId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            disabled={isEdit}
            placeholder="hr, operations, …"
            className="input"
            style={{ height: 32, width: '100%', opacity: isEdit ? 0.6 : 1 }}
          />
        </Labelled>
        <Labelled label="Label">
          <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} className="input" style={{ height: 32, width: '100%' }} />
        </Labelled>
        <Labelled label="Icon">
          <Dropdown<string>
            value={icon}
            onChange={setIcon}
            options={['money', 'trend-up', 'scale', 'users', 'file', 'sheet', 'settings', 'boarding', 'shield', 'sparkle'].map((o) => ({ value: o, label: o }))}
            style={{ width: 180 }}
            ariaLabel="Icon"
          />
        </Labelled>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!id.trim() || !label.trim()}>
            {isEdit ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function GoogleTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <CalendarTab />
      <DriveTab />
    </div>
  );
}

function DriveTab() {
  const cfgQ = useDriveConfig();
  const drivesQ = useSharedDrives();
  const setDrive = useSetWorkspaceDrive();
  const [status, setStatus] = useState<{ kind: 'idle' | 'ok' | 'err'; msg?: string }>({ kind: 'idle' });

  const cfg = cfgQ.data;
  const drives = drivesQ.data ?? [];
  const drivesError = drivesQ.error as (Error & { status?: number }) | undefined;

  const pick = async (driveId: string, driveName: string) => {
    setStatus({ kind: 'idle' });
    try {
      await setDrive.mutateAsync({ driveId, driveName });
      setStatus({ kind: 'ok', msg: `Connected to "${driveName}". Jeff's folder created.` });
    } catch (err) {
      setStatus({ kind: 'err', msg: (err as Error).message });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-1)', marginBottom: 4 }}>Drive workspace</div>
        <div style={{ fontSize: 12.5, color: 'var(--fg-3)', maxWidth: 640 }}>
          PathNotion reads and writes files inside one shared drive. Pick the drive both founders use, and we'll
          create a <b>Jeff</b> folder at its root for agent outputs.
        </div>
      </div>

      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        padding: '18px 20px',
        maxWidth: 640,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        {drivesQ.isLoading && <div style={{ fontSize: 12.5, color: 'var(--fg-3)' }}>Loading your shared drives…</div>}

        {drivesError && (
          <div style={{ fontSize: 12.5, color: 'var(--danger-fg)' }}>
            {drivesError.status === 404 ? 'Connect Google first (above), then reload.' : `Couldn't list shared drives: ${drivesError.message}`}
          </div>
        )}

        {!drivesQ.isLoading && !drivesError && drives.length === 0 && (
          <div style={{ fontSize: 12.5, color: 'var(--fg-3)' }}>
            No shared drives visible to your account. Create one in Google Drive first, or ask your Workspace admin.
          </div>
        )}

        {drives.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {drives.map((d) => {
              const selected = cfg?.driveId === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => pick(d.id, d.name)}
                  disabled={setDrive.isPending}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    border: '1px solid ' + (selected ? 'var(--path-primary)' : 'var(--border-subtle)'),
                    background: selected ? 'var(--path-primary-tint)' : 'var(--bg-surface)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: d.colorRgb ?? 'var(--fg-3)', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: 'var(--fg-1)', fontWeight: 500, flex: 1 }}>{d.name}</span>
                  {selected && (
                    <span className="mono" style={{ fontSize: 10, color: 'var(--path-primary)' }}>SELECTED</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {cfg?.driveName && (
          <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>
            Current: <b>{cfg.driveName}</b>
            {cfg.jeffFolderId && <span style={{ marginLeft: 8, color: 'var(--path-primary)' }}>Jeff folder ready.</span>}
          </div>
        )}

        {status.kind === 'ok' && <span style={{ fontSize: 12, color: 'var(--path-primary)' }}>{status.msg}</span>}
        {status.kind === 'err' && <span style={{ fontSize: 12, color: 'var(--danger-fg)' }}>{status.msg}</span>}
      </div>
    </div>
  );
}

function CalendarTab() {
  const session = useSession();
  const statusQ = useGoogleCalendarStatus();
  const connect = useConnectGoogleCalendar();
  const disconnect = useDisconnectGoogleCalendar();
  const test = useTestGoogleCalendar();
  const [testResult, setTestResult] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  // The OAuth popup sends a postMessage when it can, but Chrome strips the window.opener link
  // after the cross-origin hop to accounts.google.com, so we can't rely on it. Belt-and-braces:
  // react to postMessage if we get it, and also poll for the popup's closed state so the status
  // refetch still happens the moment the user finishes (or dismisses) the consent flow.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'pn:calendar-connected') {
        statusQ.refetch();
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [statusQ]);

  const s = statusQ.data;

  const startConnect = async () => {
    try {
      const { url } = await connect.mutateAsync();
      // Open the Google consent in a popup; callback tab closes itself.
      const popup = window.open(url, 'pn-google-connect', 'width=540,height=720');
      // Poll for the popup closing. Fires after consent completes (popup self-closes) or after
      // the user dismisses the popup. Either way we refetch so the main window reflects reality.
      if (popup) {
        const interval = window.setInterval(() => {
          if (popup.closed) {
            window.clearInterval(interval);
            statusQ.refetch();
          }
        }, 500);
      }
    } catch (err) {
      setTestResult({ kind: 'err', msg: (err as Error).message });
    }
  };

  const runTest = async () => {
    setTestResult(null);
    try {
      const r = await test.mutateAsync();
      if (r.ok) setTestResult({ kind: 'ok', msg: `Connected to "${r.primaryCalendar ?? 'primary'}".` });
      else setTestResult({ kind: 'err', msg: r.error ?? 'Test failed.' });
    } catch (err) {
      setTestResult({ kind: 'err', msg: (err as Error).message });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ fontSize: 12.5, color: 'var(--fg-3)', maxWidth: 640 }}>
        Each person connects their own Google Calendar. Events sync in both directions — changes here push
        back to your Google calendar, and changes in Google flow in.
      </div>

      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        padding: '18px 20px',
        maxWidth: 640,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar who={(session.data?.key as 'D' | 'R' | 'A') ?? 'A'} size={32} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13.5, color: 'var(--fg-1)', fontWeight: 500 }}>
              {session.data?.displayName ?? 'You'}
            </div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>
              {statusQ.isLoading ? 'checking…'
                : !s?.configured ? 'Not configured on server (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).'
                : s.connected ? (s.email ?? 'Connected')
                : 'Not connected'}
            </div>
          </div>
          {s?.configured && !s.connected && (
            <button className="btn btn-primary" onClick={startConnect} disabled={connect.isPending}>
              <Icon name="plus" size={13} /> {connect.isPending ? 'Opening…' : 'Connect Google Calendar'}
            </button>
          )}
          {s?.connected && (
            <button
              className="btn btn-ghost"
              onClick={() => { if (confirm('Disconnect Google Calendar? Your synced events will remain.')) disconnect.mutate(); }}
              disabled={disconnect.isPending}
            >
              Disconnect
            </button>
          )}
        </div>

        {s?.connected && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-ghost" onClick={runTest} disabled={test.isPending}>
              {test.isPending ? 'Testing…' : 'Test connection'}
            </button>
            {s.lastSyncAt && (
              <span className="mono" style={{ fontSize: 10, color: 'var(--fg-4)' }}>
                Last sync: {s.lastSyncAt}
              </span>
            )}
            {testResult && (
              <span style={{ fontSize: 12, color: testResult.kind === 'ok' ? 'var(--path-primary)' : 'var(--danger-fg)' }}>
                {testResult.msg}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function NotificationsTab() {
  const prefsQ = useNotificationPrefs();
  const patch = usePatchNotificationPrefs();
  const sendTest = useSendDigestTest();
  const [status, setStatus] = useState<{ kind: 'idle' | 'ok' | 'err'; msg?: string }>({ kind: 'idle' });

  const prefs: NotificationPrefs | undefined = prefsQ.data;
  const [enabled, setEnabled] = useState(prefs?.enabled ?? true);
  const [time, setTime] = useState(prefs?.deliveryTime ?? '07:00');
  const [sections, setSections] = useState(prefs?.sections ?? { meetings: true, overdue: true, tasks: true, upcoming: true });

  useEffect(() => {
    if (!prefs) return;
    setEnabled(prefs.enabled);
    setTime(prefs.deliveryTime);
    setSections(prefs.sections);
  }, [prefs?.enabled, prefs?.deliveryTime, prefs?.sections?.meetings, prefs?.sections?.overdue, prefs?.sections?.tasks, prefs?.sections?.upcoming]);

  const save = () => {
    patch.mutate({ enabled, deliveryTime: time, sections });
  };

  const test = async () => {
    setStatus({ kind: 'idle' });
    try {
      await sendTest.mutateAsync();
      setStatus({ kind: 'ok', msg: 'Test email sent.' });
    } catch (err: any) {
      setStatus({ kind: 'err', msg: err?.message ?? 'Failed to send' });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ fontSize: 12.5, color: 'var(--fg-3)', maxWidth: 640 }}>
        Daily digest sent to your account email via the configured SMTP server. Toggle sections, pick a delivery time
        (local server time), and send a test email to confirm delivery.
      </div>

      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        maxWidth: 640,
      }}>
        <ToggleRow label="Send daily digest" value={enabled} onChange={setEnabled} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--fg-1)', fontWeight: 500, flex: 1 }}>Delivery time</div>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            disabled={!enabled}
            className="input"
            style={{ height: 32, padding: '0 8px', width: 120 }}
          />
        </div>

        <div>
          <div style={{ fontSize: 13, color: 'var(--fg-1)', fontWeight: 500, marginBottom: 10 }}>Sections</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ToggleRow small label="Today's meetings" value={sections.meetings} onChange={(v) => setSections({ ...sections, meetings: v })} />
            <ToggleRow small label="Overdue backlog items" value={sections.overdue} onChange={(v) => setSections({ ...sections, overdue: v })} />
            <ToggleRow small label="Tasks due today / tomorrow" value={sections.tasks} onChange={(v) => setSections({ ...sections, tasks: v })} />
            <ToggleRow small label="Up next (backlog)" value={sections.upcoming} onChange={(v) => setSections({ ...sections, upcoming: v })} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={save} disabled={patch.isPending}>
            {patch.isPending ? 'Saving…' : 'Save changes'}
          </button>
          <button className="btn btn-ghost" onClick={test} disabled={sendTest.isPending}>
            {sendTest.isPending ? 'Sending…' : 'Send test email'}
          </button>
          {status.kind === 'ok' && <span style={{ fontSize: 12, color: 'var(--path-primary)' }}>{status.msg}</span>}
          {status.kind === 'err' && <span style={{ fontSize: 12, color: 'var(--danger-fg)' }}>{status.msg}</span>}
        </div>

        {prefs?.lastSentDate && (
          <div style={{ fontSize: 11, color: 'var(--fg-4)' }}>
            Last digest sent: {prefs.lastSentDate}
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleRow({ label, value, onChange, small }: { label: string; value: boolean; onChange: (v: boolean) => void; small?: boolean }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
      <span style={{
        width: small ? 28 : 32,
        height: small ? 16 : 18,
        borderRadius: 10,
        background: value ? 'var(--path-primary)' : 'var(--border-strong)',
        position: 'relative',
        transition: 'background 120ms',
      }}>
        <span style={{
          position: 'absolute',
          top: 2,
          left: value ? (small ? 14 : 16) : 2,
          width: small ? 12 : 14,
          height: small ? 12 : 14,
          borderRadius: '50%',
          background: 'var(--bg-surface)',
          transition: 'left 120ms',
        }} />
      </span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} style={{ display: 'none' }} />
      <span style={{ fontSize: small ? 12.5 : 13, color: 'var(--fg-1)', fontWeight: small ? 400 : 500 }}>{label}</span>
    </label>
  );
}

function UsersTab() {
  const usersQ = useUsers();
  const createUser = useCreateUser();
  const patchUser = usePatchUser();
  const resetPw = useResetUserPassword();
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [resettingId, setResettingId] = useState<number | null>(null);

  const users = usersQ.data ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12.5, color: 'var(--fg-3)' }}>{users.length} user{users.length === 1 ? '' : 's'}</div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          <Icon name="plus" size={14} /> New user
        </button>
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
        {users.map((u, i) => (
          <div key={u.id} style={{
            display: 'grid',
            gridTemplateColumns: '44px 1fr 120px 140px 90px 32px 28px',
            alignItems: 'center',
            gap: 14,
            padding: '12px 16px',
            borderBottom: i < users.length - 1 ? '1px solid var(--border-subtle)' : 'none',
          }}>
            <Avatar who={u.key === 'D' ? 'D' : u.key === 'R' ? 'R' : 'A'} size={28} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, color: 'var(--fg-1)', fontWeight: 500 }}>{u.displayName}</div>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg-4)' }}>@{u.username}</div>
            </div>
            <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>{u.email ?? '—'}</span>
            <span style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
              {u.role}
            </span>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-4)' }}>{u.key}</span>
            <button className="btn btn-subtle btn-icon" title="Edit" onClick={() => setEditingId(u.id)}>
              <Icon name="edit" size={13} />
            </button>
            <button className="btn btn-subtle btn-icon" title="Reset password" onClick={() => setResettingId(u.id)}>
              <Icon name="lock" size={13} />
            </button>
          </div>
        ))}
        {!users.length && (
          <div style={{ padding: '24px 18px', textAlign: 'center', color: 'var(--fg-4)', fontSize: 13 }}>
            No users yet.
          </div>
        )}
      </div>

      {showNew && (
        <NewUserDialog
          onClose={() => setShowNew(false)}
          onCreate={(body) => createUser.mutate(body, { onSuccess: () => setShowNew(false) })}
        />
      )}

      {editingId !== null && (
        <EditUserDialog
          user={users.find((u) => u.id === editingId)!}
          onClose={() => setEditingId(null)}
          onPatch={(patch) => patchUser.mutate({ id: editingId, patch }, { onSuccess: () => setEditingId(null) })}
        />
      )}

      {resettingId !== null && (
        <ResetPasswordDialog
          user={users.find((u) => u.id === resettingId)!}
          onClose={() => setResettingId(null)}
          onSubmit={(password) => resetPw.mutate({ id: resettingId, password }, { onSuccess: () => setResettingId(null) })}
        />
      )}
    </div>
  );
}

function NewUserDialog({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (body: { key: string; username: string; displayName: string; email?: string | null; password: string; role: 'admin' | 'member' }) => void;
}) {
  const [key, setKey] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim() || !username.trim() || !displayName.trim() || password.length < 8) return;
    onCreate({
      key: key.trim(),
      username: username.trim(),
      displayName: displayName.trim(),
      email: email.trim() || null,
      password,
      role,
    });
  };

  return (
    <Modal title="New user" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 10 }}>
          <Labelled label="Key">
            <input value={key} onChange={(e) => setKey(e.target.value.toUpperCase().slice(0, 3))} placeholder="e.g. D" className="input" style={{ height: 32, width: '100%' }} />
          </Labelled>
          <Labelled label="Username">
            <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} className="input" style={{ height: 32, width: '100%' }} />
          </Labelled>
        </div>
        <Labelled label="Display name">
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="input" style={{ height: 32, width: '100%' }} />
        </Labelled>
        <Labelled label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" style={{ height: 32, width: '100%' }} />
        </Labelled>
        <Labelled label="Password">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" style={{ height: 32, width: '100%' }} placeholder="Min 8 characters" />
        </Labelled>
        <Labelled label="Role">
          <Dropdown<'admin' | 'member'>
            value={role}
            onChange={setRole}
            options={[
              { value: 'member', label: 'Member' },
              { value: 'admin',  label: 'Admin' },
            ]}
            style={{ width: 140 }}
            ariaLabel="Role"
          />
        </Labelled>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!key.trim() || !username.trim() || !displayName.trim() || password.length < 8}>Create</button>
        </div>
      </form>
    </Modal>
  );
}

function EditUserDialog({ user, onClose, onPatch }: {
  user: SessionUser;
  onClose: () => void;
  onPatch: (patch: { displayName?: string; email?: string | null; role?: 'admin' | 'member' }) => void;
}) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [email, setEmail] = useState(user.email ?? '');
  const [role, setRole] = useState<'admin' | 'member'>(user.role);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onPatch({
      displayName,
      email: email.trim() || null,
      role,
    });
  };

  return (
    <Modal title={`Edit @${user.username}`} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Labelled label="Display name">
          <input autoFocus value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="input" style={{ height: 32, width: '100%' }} />
        </Labelled>
        <Labelled label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" style={{ height: 32, width: '100%' }} />
        </Labelled>
        <Labelled label="Role">
          <Dropdown<'admin' | 'member'>
            value={role}
            onChange={setRole}
            options={[
              { value: 'member', label: 'Member' },
              { value: 'admin',  label: 'Admin' },
            ]}
            style={{ width: 140 }}
            ariaLabel="Role"
          />
        </Labelled>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button type="submit" className="btn btn-primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordDialog({ user, onClose, onSubmit }: {
  user: SessionUser;
  onClose: () => void;
  onSubmit: (password: string) => void;
}) {
  const [password, setPassword] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return;
    onSubmit(password);
  };
  return (
    <Modal title={`Reset password · @${user.username}`} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Labelled label="New password">
          <input autoFocus type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" style={{ height: 32, width: '100%' }} placeholder="Min 8 characters" />
        </Labelled>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={password.length < 8}>Reset</button>
        </div>
      </form>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,26,0.55)' }} />
      <div style={{
        position: 'relative',
        width: 420,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 10,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--fg-1)' }}>{title}</h2>
          <button onClick={onClose} className="btn btn-subtle btn-icon"><Icon name="close" size={14} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>{label}</span>
      {children}
    </label>
  );
}

// ─── Jeff tab: style sheet + competitors ───────────────────────────────────

function JeffTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <ScanScopePanel />
      <StyleSheetPanel />
      <CompetitorsPanel />
    </div>
  );
}

function ScanScopePanel() {
  const settingsQ = useJeffSettings();
  const pinnedQ = usePinnedFolders();
  const save = useSaveJeffSettings();
  const unpin = useUnpinFolder();
  const [cap, setCap] = useState<number | ''>('');

  useEffect(() => {
    if (settingsQ.data && cap === '') setCap(settingsQ.data.scanCap);
  }, [settingsQ.data, cap]);

  const pinned = pinnedQ.data ?? [];

  const onSave = async () => {
    const value = Number(cap);
    if (!Number.isFinite(value) || value < 1 || value > 500) return alert('Scan cap must be a number between 1 and 500.');
    try { await save.mutateAsync({ scanCap: value }); }
    catch (err) { alert(`Save failed: ${(err as Error).message}`); }
  };

  const capTip = 'Cap is split evenly across pinned folders. Pinning a folder scans it and everything inside (up to 4 levels deep). Default 40 — bump higher once you know Anthropic cost.';
  const noPinsTip = "With no folders pinned, Jeff's Drive scan is skipped — nothing to read.";

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-1)', margin: 0 }}>Jeff's scan scope</h2>
        <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>Which folders Jeff reads on a Drive scan.</span>
      </div>

      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        padding: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 10 }}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--fg-4)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center' }}>
            Pinned folders · {pinned.length}
            {pinned.length === 0 && <InfoTip text={noPinsTip} />}
          </div>

          {/* Inline cap editor — single line. Info icon replaces the paragraph hint. */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className="mono" style={{ fontSize: 10, color: 'var(--fg-4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Cap
            </span>
            <InfoTip text={capTip} />
            <input
              type="number"
              min={1}
              max={500}
              value={cap}
              onChange={(e) => setCap(e.target.value === '' ? '' : Number(e.target.value))}
              className="input"
              style={{ width: 64, height: 28, padding: '0 8px', fontSize: 12 }}
            />
            <button
              className="btn btn-primary"
              onClick={onSave}
              disabled={save.isPending}
              style={{ height: 28, padding: '0 10px', fontSize: 12 }}
              title="Save cap"
            >
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {pinned.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--fg-3)', padding: '8px 2px' }}>
            Nothing pinned yet. Open <b>Documentation</b> and click the pin icon on any folder in the left tree.
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 8,
          }}>
            {pinned.map((p) => (
              <div key={p.driveFolderId} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 6px 6px 10px',
                border: '1px solid var(--border-subtle)', borderRadius: 6,
                background: 'var(--bg-sunken)',
                fontSize: 12, color: 'var(--fg-1)',
                minWidth: 0,
              }}>
                <Icon name="pin" size={11} color="var(--path-primary)" />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.folderName}
                </span>
                <button
                  onClick={() => unpin.mutate(p.driveFolderId)}
                  className="btn btn-subtle btn-icon"
                  title="Unpin"
                  style={{ padding: 2, width: 20, height: 20 }}
                >
                  <Icon name="close" size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Style sheet panel ──────────────────────────────────────────────────────
// Structured editor for Jeff's house style. Splits into Voice · Brand · Colours ·
// Typography · Logos · Output guides. Every field feeds Jeff's system prompt and
// the file renderers (PowerPoint today, PDF/Excel later).

const COLOUR_FIELDS: Array<{ key: keyof NonNullable<JeffStyleSheet['brand']>; label: string }> = [
  { key: 'colorPrimary',         label: 'Primary' },
  { key: 'colorPrimaryLight1',   label: 'Primary light 1' },
  { key: 'colorPrimaryLight2',   label: 'Primary light 2' },
  { key: 'colorSecondary',       label: 'Secondary' },
  { key: 'colorSecondaryLight1', label: 'Secondary light 1' },
  { key: 'colorSecondaryLight2', label: 'Secondary light 2' },
  { key: 'colorNeutralDark',     label: 'Neutral dark' },
  { key: 'colorNeutralLight',    label: 'Neutral light' },
];

const TYPE_SCALE_FIELDS: Array<{ key: keyof JeffTypeScale; label: string }> = [
  { key: 'h0', label: 'H0' },
  { key: 'h1', label: 'H1' },
  { key: 'h2', label: 'H2' },
  { key: 'h3', label: 'H3' },
  { key: 'h4', label: 'H4' },
  { key: 'p1', label: 'P1' },
  { key: 'p2', label: 'P2' },
];

const OUTPUT_FIELDS: Array<{ key: keyof NonNullable<JeffStyleSheet['outputs']>; label: string; hint: string }> = [
  { key: 'presentation',    label: 'Presentation',     hint: 'How every deck (.pptx) should be laid out.' },
  { key: 'researchPdf',     label: 'Research PDF',     hint: 'Shape for research briefs Jeff produces as PDF.' },
  { key: 'spreadsheet',     label: 'Spreadsheet',      hint: 'Shape for data pulls, trackers and comparisons (.xlsx).' },
  { key: 'competitorBrief', label: 'Competitor brief', hint: 'Structure Jeff uses when profiling a competitor.' },
  { key: 'weeklySummary',   label: 'Weekly summary',   hint: 'What the Monday digest looks like.' },
  { key: 'dailyNews',       label: 'Daily news',       hint: 'Shape of the payments-news digest.' },
];

function StyleSheetPanel() {
  const styleQ = useJeffStyleSheet();
  const save = useSaveJeffStyleSheet();
  const uploadLogo = useUploadJeffLogo();
  const clearLogo = useClearJeffLogo();
  const existing = styleQ.data?.data ?? null;

  const [draft, setDraft] = useState<JeffStyleSheet | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Sync draft from server whenever the row arrives (or after a save round-trip refetches).
  useEffect(() => {
    if (existing) setDraft(structuredClone(existing));
  }, [existing]);

  const d = draft;
  if (!d) {
    return (
      <div style={{ fontSize: 12.5, color: 'var(--fg-3)' }}>Loading style sheet…</div>
    );
  }

  // Narrowed setters — keep the brand/voice/outputs objects well-formed.
  const setBrand = (patch: Partial<NonNullable<JeffStyleSheet['brand']>>) =>
    setDraft({ ...d, brand: { ...(d.brand ?? {}), ...patch } });
  const setTypeScale = (key: keyof JeffTypeScale, val: number | undefined) => {
    const ts = { ...(d.brand?.typeScale ?? {}), [key]: val };
    setBrand({ typeScale: ts });
  };
  const setVoice = (patch: Partial<NonNullable<JeffStyleSheet['voice']>>) =>
    setDraft({ ...d, voice: { ...(d.voice ?? {}), ...patch } });
  const setOutput = (key: string, val: string) =>
    setDraft({ ...d, outputs: { ...(d.outputs ?? {}), [key]: val } });

  const onSave = async () => {
    await save.mutateAsync(d);
    setSavedAt(new Date().toLocaleTimeString());
  };

  const onLogoUpload = async (variant: 'light' | 'dark', file: File) => {
    await uploadLogo.mutateAsync({ variant, file });
  };
  const onLogoClear = async (variant: 'light' | 'dark') => {
    await clearLogo.mutateAsync(variant);
  };

  const brand = d.brand ?? {};
  const outputs = d.outputs ?? {};
  const voice = d.voice ?? {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg-1)', margin: '0 0 4px 0' }}>Jeff's style sheet</h2>
        <div style={{ fontSize: 12.5, color: 'var(--fg-3)' }}>
          Jeff applies this to every system prompt and every file he produces — brand palette, fonts, type scale, logos, plus a short guide per output format.
        </div>
      </div>

      {/* Voice ─────────────────────────────────────── */}
      <Section title="Voice" hint="How Jeff should sound across chat and written output.">
        <Field label="Tone">
          <textarea
            className="input"
            rows={2}
            value={voice.tone ?? ''}
            onChange={(e) => setVoice({ tone: e.target.value })}
            placeholder="Concise, warm, direct. No waffle."
          />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Avoid" hint="Comma-separated.">
            <input
              className="input"
              value={(voice.avoid ?? []).join(', ')}
              onChange={(e) => setVoice({ avoid: splitList(e.target.value) })}
            />
          </Field>
          <Field label="Prefer" hint="Comma-separated.">
            <input
              className="input"
              value={(voice.prefer ?? []).join(', ')}
              onChange={(e) => setVoice({ prefer: splitList(e.target.value) })}
            />
          </Field>
        </div>
      </Section>

      {/* Brand identity ───────────────────────────── */}
      <Section title="Brand identity" hint="Name, tagline, colours.">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Brand name">
            <input className="input" value={brand.name ?? ''} onChange={(e) => setBrand({ name: e.target.value })} />
          </Field>
          <Field label="Tagline">
            <input className="input" value={brand.tagline ?? ''} onChange={(e) => setBrand({ tagline: e.target.value })} />
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {COLOUR_FIELDS.map((c) => (
            <ColourField
              key={c.key}
              label={c.label}
              value={(brand[c.key] as string | undefined) ?? ''}
              onChange={(v) => setBrand({ [c.key]: v } as Partial<NonNullable<JeffStyleSheet['brand']>>)}
            />
          ))}
        </div>
      </Section>

      {/* Typography ─────────────────────────────── */}
      <Section title="Typography" hint="Font families and the type scale (points) used in generated files.">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Primary font">
            <input className="input" value={brand.fontPrimary ?? ''} onChange={(e) => setBrand({ fontPrimary: e.target.value })} placeholder="Poppins" />
          </Field>
          <Field label="Secondary font">
            <input className="input" value={brand.fontSecondary ?? brand.fontMono ?? ''} onChange={(e) => setBrand({ fontSecondary: e.target.value })} placeholder="Roboto" />
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
          {TYPE_SCALE_FIELDS.map((t) => (
            <Field key={t.key} label={t.label}>
              <input
                className="input"
                type="number"
                min={8}
                max={120}
                value={brand.typeScale?.[t.key] ?? ''}
                onChange={(e) => {
                  const n = e.target.value === '' ? undefined : Number(e.target.value);
                  setTypeScale(t.key, Number.isFinite(n) ? n : undefined);
                }}
              />
            </Field>
          ))}
        </div>
      </Section>

      {/* Logos ──────────────────────────────────── */}
      <Section title="Logos" hint="Used on title slides, PDF covers, and any other branded output.">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <LogoTile
            label="For light backgrounds"
            logo={brand.logoLight ?? null}
            busy={uploadLogo.isPending || clearLogo.isPending}
            onUpload={(f) => onLogoUpload('light', f)}
            onClear={() => onLogoClear('light')}
            background="#fff"
          />
          <LogoTile
            label="For dark backgrounds"
            logo={brand.logoDark ?? null}
            busy={uploadLogo.isPending || clearLogo.isPending}
            onUpload={(f) => onLogoUpload('dark', f)}
            onClear={() => onLogoClear('dark')}
            background={brand.colorNeutralDark ?? '#0F171A'}
          />
        </div>
      </Section>

      {/* Output style guides ────────────────────── */}
      <Section title="Output style guides" hint="Short prose guides Jeff applies when producing each kind of file. Keep to a few lines each.">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {OUTPUT_FIELDS.map((o) => (
            <Field key={String(o.key)} label={o.label} hint={o.hint}>
              <textarea
                className="input"
                rows={3}
                value={(outputs[o.key] ?? '') as string}
                onChange={(e) => setOutput(String(o.key), e.target.value)}
              />
            </Field>
          ))}
        </div>
      </Section>

      {/* Save bar ──────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        position: 'sticky', bottom: 0,
        padding: '12px 0', borderTop: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
      }}>
        <button className="btn btn-primary" onClick={onSave} disabled={save.isPending}>
          <Icon name="check" size={12} /> {save.isPending ? 'Saving…' : 'Save style sheet'}
        </button>
        {savedAt && <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>Saved at {savedAt}</span>}
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-4)', marginLeft: 'auto' }}>
          {styleQ.data?.updatedAt
            ? <>Last server save {styleQ.data.updatedAt}{styleQ.data.updatedBy ? ` · ${styleQ.data.updatedBy}` : ''}</>
            : 'Not saved yet'}
        </span>
      </div>
    </div>
  );
}

function Section(props: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-1)', margin: '0 0 2px 0' }}>{props.title}</h3>
        {props.hint && <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>{props.hint}</div>}
      </div>
      {props.children}
    </div>
  );
}

function Field(props: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--fg-2)', fontWeight: 500 }}>
      <span>{props.label}{props.hint && <span style={{ color: 'var(--fg-4)', fontWeight: 400 }}> · {props.hint}</span>}</span>
      {props.children}
    </label>
  );
}

function ColourField(props: { label: string; value: string; onChange: (hex: string) => void }) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(props.value) ? props.value : '#000000';
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--fg-2)', fontWeight: 500 }}>
      <span>{props.label}</span>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        border: '1px solid var(--border-default)', borderRadius: 8,
        padding: '4px 6px', background: 'var(--bg-surface)',
      }}>
        <input
          type="color"
          value={safe}
          onChange={(e) => props.onChange(e.target.value.toUpperCase())}
          style={{
            width: 28, height: 28, padding: 0, border: 'none', background: 'transparent',
            cursor: 'pointer',
          }}
        />
        <input
          type="text"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          className="mono"
          style={{
            flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
            fontSize: 12, color: 'var(--fg-1)',
          }}
        />
      </div>
    </label>
  );
}

function LogoTile(props: {
  label: string;
  logo: JeffLogoRef | null | undefined;
  busy: boolean;
  onUpload: (file: File) => void | Promise<void>;
  onClear: () => void | Promise<void>;
  background: string;
}) {
  const [local, setLocal] = useState<HTMLInputElement | null>(null);
  return (
    <div style={{
      border: '1px solid var(--border-default)', borderRadius: 10,
      background: 'var(--bg-surface)', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', fontSize: 12, color: 'var(--fg-2)', fontWeight: 500 }}>
        {props.label}
      </div>
      <div style={{
        minHeight: 140, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: props.background, padding: 16,
      }}>
        {(() => {
          const src = api.agent.styleSheet.logoPreviewSrc(props.logo);
          return src ? (
            <img
              src={src}
              alt={props.logo!.name}
              style={{ maxWidth: '100%', maxHeight: 120, objectFit: 'contain' }}
            />
          ) : (
            <div style={{ fontSize: 12, color: props.background === '#fff' ? '#8a8e95' : '#c7cbd1' }}>No logo yet</div>
          );
        })()}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: 10 }}>
        <input
          ref={setLocal}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) props.onUpload(f);
            e.currentTarget.value = '';
          }}
        />
        <button
          className="btn btn-ghost"
          onClick={() => local?.click()}
          disabled={props.busy}
        >
          <Icon name="upload" size={12} /> {props.logo ? 'Replace' : 'Upload'}
        </button>
        {props.logo && (
          <button className="btn btn-ghost" onClick={() => props.onClear()} disabled={props.busy}>
            <Icon name="trash" size={12} /> Remove
          </button>
        )}
      </div>
    </div>
  );
}

function splitList(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

const REGION_LABELS: Record<string, string> = {
  global:  'Global',
  uk:      'UK / Eire',
  de:      'Germany',
  fr:      'France',
  'es-pt': 'Spain / Portugal',
  it:      'Italy',
  benelux: 'Benelux',
};

const STARTER_LIST_PROMPT = "Suggest 5 platform-payments / PSP competitors for Path we're not yet tracking. Cover a mix of regions — UK/Eire, Germany, France, Spain/Portugal, Italy, Benelux. For each candidate, use web_search to confirm they're real and active, then call add_competitor with a slug id, name, homepage URL, press page / newsroom URL, the right region code, and 3-4 focus-area tags. When you're done, reply with a short list summarising what you added.";

function CompetitorsPanel() {
  const listQ = useCompetitors();
  const create = useCreateCompetitor();
  const patch = usePatchCompetitor();
  const remove = useDeleteCompetitor();
  const askJeff = useUI((s) => s.askJeff);
  const competitors = listQ.data ?? [];
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<JeffCompetitor | null>(null);

  // Group by region so long lists stay scannable. Within each group: enabled first, then by sortOrder.
  const grouped = competitors.reduce<Record<string, JeffCompetitor[]>>((acc, c) => {
    const key = c.region ?? 'other';
    (acc[key] ??= []).push(c);
    return acc;
  }, {});
  const groupKeys = Object.keys(grouped).sort((a, b) => {
    const order = ['global', 'uk', 'de', 'fr', 'es-pt', 'it', 'benelux', 'other'];
    return order.indexOf(a) - order.indexOf(b);
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg-1)', margin: '0 0 4px 0' }}>Tracked competitors</h2>
          <div style={{ fontSize: 12.5, color: 'var(--fg-3)' }}>
            Drive Jeff's news digest, competitor feature watch, and research refresh. Disable a row to skip it without deleting.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-ghost"
            onClick={() => askJeff(STARTER_LIST_PROMPT)}
            title="Open the Jeff chat with a prompt that asks him to propose + add competitors using web search"
          >
            <Icon name="sparkle" size={14} /> Ask Jeff for suggestions
          </button>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>
            <Icon name="plus" size={14} /> Add competitor
          </button>
        </div>
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
        {competitors.length === 0 && (
          <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--fg-3)' }}>
            <div style={{ fontSize: 14, color: 'var(--fg-2)', fontWeight: 500, marginBottom: 6 }}>No competitors yet.</div>
            <div style={{ fontSize: 12.5, marginBottom: 14 }}>Add one by hand, or let Jeff do the research and fill the list.</div>
            <button className="btn btn-primary" onClick={() => askJeff(STARTER_LIST_PROMPT)}>
              <Icon name="sparkle" size={13} /> Let Jeff suggest a starter list
            </button>
          </div>
        )}
        {groupKeys.map((key, gi) => (
          <div key={key}>
            {competitors.length > 0 && (
              <div className="mono" style={{
                fontSize: 10, padding: '10px 16px 6px', color: 'var(--fg-4)',
                letterSpacing: '0.08em', textTransform: 'uppercase',
                borderTop: gi === 0 ? 'none' : '1px solid var(--border-subtle)',
                background: 'var(--bg-sunken)',
              }}>
                {REGION_LABELS[key] ?? 'Other'} · {grouped[key].length}
              </div>
            )}
            {grouped[key].map((c, i) => (
              <CompetitorRow
                key={c.id}
                competitor={c}
                last={i === grouped[key].length - 1 && gi === groupKeys.length - 1}
                onToggle={() => patch.mutate({ id: c.id, patch: { enabled: !c.enabled } })}
                onEdit={() => setEditing(c)}
                onRemove={() => { if (confirm(`Remove ${c.name}? Its tracked features will be deleted too.`)) remove.mutate(c.id); }}
              />
            ))}
          </div>
        ))}
      </div>

      {showNew && <CompetitorDialog onClose={() => setShowNew(false)} onSubmit={async (body) => { await create.mutateAsync(body); setShowNew(false); }} />}
      {editing && <CompetitorDialog existing={editing} onClose={() => setEditing(null)} onSubmit={async (body) => { await patch.mutateAsync({ id: editing.id, patch: body }); setEditing(null); }} />}
    </div>
  );
}

function CompetitorRow({ competitor: c, last, onToggle, onEdit, onRemove }: {
  competitor: JeffCompetitor;
  last: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '150px 1fr 180px 70px 44px',
      alignItems: 'center',
      gap: 14,
      padding: '12px 16px',
      borderBottom: last ? 'none' : '1px solid var(--border-subtle)',
      opacity: c.enabled ? 1 : 0.55,
    }}>
      <span style={{ fontSize: 13, color: 'var(--fg-1)', fontWeight: 500 }}>{c.name}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        {c.homepage
          ? <a href={c.homepage} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.homepage}</a>
          : <i style={{ fontSize: 12, color: 'var(--fg-4)' }}>no homepage</i>}
        {c.pressPageUrl && (
          <a href={c.pressPageUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--fg-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            press · {c.pressPageUrl.replace(/^https?:\/\//, '')}
          </a>
        )}
      </div>
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {(c.focusAreas ?? []).slice(0, 4).map((t) => (
          <span key={t} className="tag" style={{ color: 'var(--fg-3)' }}>#{t}</span>
        ))}
      </span>
      <label onClick={onToggle} style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
        <span style={{
          width: 32, height: 18, borderRadius: 10,
          background: c.enabled ? 'var(--path-primary)' : 'var(--border-strong)',
          position: 'relative', transition: 'background 120ms',
        }}>
          <span style={{
            position: 'absolute', top: 2,
            left: c.enabled ? 16 : 2,
            width: 14, height: 14, borderRadius: '50%',
            background: 'var(--bg-surface)', transition: 'left 120ms',
          }} />
        </span>
      </label>
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="btn btn-subtle btn-icon" title="Edit" onClick={onEdit}><Icon name="pencil" size={12} /></button>
        <button className="btn btn-subtle btn-icon" title="Remove" onClick={onRemove}><Icon name="trash" size={12} /></button>
      </div>
    </div>
  );
}

const REGION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '',        label: '— None —' },
  { value: 'global',  label: 'Global' },
  { value: 'uk',      label: 'UK / Eire' },
  { value: 'de',      label: 'Germany' },
  { value: 'fr',      label: 'France' },
  { value: 'es-pt',   label: 'Spain / Portugal' },
  { value: 'it',      label: 'Italy' },
  { value: 'benelux', label: 'Benelux' },
];

function CompetitorDialog({ existing, onClose, onSubmit }: {
  existing?: JeffCompetitor;
  onClose: () => void;
  onSubmit: (body: Omit<JeffCompetitor, 'id'>) => Promise<void>;
}) {
  const [name, setName] = useState(existing?.name ?? '');
  const [homepage, setHomepage] = useState(existing?.homepage ?? '');
  const [pressPage, setPressPage] = useState(existing?.pressPageUrl ?? '');
  const [region, setRegion] = useState<string>(existing?.region ?? '');
  const [focus, setFocus] = useState((existing?.focusAreas ?? []).join(', '));
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [sortOrder, setSortOrder] = useState(existing?.sortOrder ?? 0);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        homepage: homepage.trim() || null,
        pressPageUrl: pressPage.trim() || null,
        region: (region || null) as JeffCompetitor['region'],
        notes: notes.trim() || null,
        focusAreas: focus.split(',').map((s) => s.trim()).filter(Boolean),
        enabled: existing?.enabled ?? true,
        sortOrder: Number(sortOrder) || 0,
      });
    } catch (err) {
      alert(`Save failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,26,0.55)' }} />
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}
        style={{
          position: 'relative', width: '100%', maxWidth: 480,
          background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 10, padding: 22,
          display: 'flex', flexDirection: 'column', gap: 12,
          boxSizing: 'border-box',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 17, color: 'var(--fg-1)' }}>{existing ? 'Edit competitor' : 'Add competitor'}</h2>
          <button type="button" onClick={onClose} className="btn btn-subtle btn-icon"><Icon name="close" size={13} /></button>
        </div>
        <CompField label="Name"><input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} /></CompField>
        <CompField label="Homepage"><input className="input" placeholder="https://..." value={homepage} onChange={(e) => setHomepage(e.target.value)} /></CompField>
        <CompField label="Press / newsroom URL (used by research-refresh)">
          <input className="input" placeholder="https://.../newsroom" value={pressPage} onChange={(e) => setPressPage(e.target.value)} />
        </CompField>
        <CompField label="Region">
          <Dropdown<string>
            value={region}
            onChange={setRegion}
            options={REGION_OPTIONS}
            ariaLabel="Region"
          />
        </CompField>
        <CompField label="Focus areas (comma separated)"><input className="input" placeholder="kyc, boarding, aml" value={focus} onChange={(e) => setFocus(e.target.value)} /></CompField>
        <CompField label="Notes"><textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ resize: 'vertical' }} /></CompField>
        <CompField label="Sort order"><input className="input" type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} /></CompField>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy ? 'Saving…' : existing ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  );
}

function CompField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
      {children}
    </label>
  );
}
