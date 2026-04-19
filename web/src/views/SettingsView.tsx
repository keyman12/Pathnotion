import { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Avatar } from '../components/primitives';
import { Icon } from '../components/Icon';
import {
  useBusinessCategories,
  useCreateBusinessCategory,
  useCreateSubfolder,
  useCreateUser,
  useDeleteBusinessCategory,
  useDeleteSubfolder,
  useNotificationPrefs,
  usePatchBusinessCategory,
  usePatchNotificationPrefs,
  usePatchSubfolder,
  usePatchUser,
  useProducts,
  useResetUserPassword,
  useSendDigestTest,
  useSubfolders,
  useUsers,
} from '../lib/queries';
import { useSession } from '../lib/useSession';
import type { BusinessCategory, NotificationPrefs, SessionUser, Subfolder } from '../lib/api';

type Tab = 'users' | 'categories' | 'subfolders' | 'notifications';

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
          { id: 'categories', label: 'Business categories' },
          { id: 'subfolders', label: 'Sub-folders' },
          { id: 'notifications', label: 'Notifications' },
        ]}
        activeTab={tab}
        onTab={setTab}
      />

      {tab === 'users' && (isAdmin ? <UsersTab /> : <NotAllowed />)}
      {tab === 'categories' && (isAdmin ? <CategoriesTab /> : <NotAllowed />)}
      {tab === 'subfolders' && (isAdmin ? <SubfoldersTab /> : <NotAllowed />)}
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
          <select value={icon} onChange={(e) => setIcon(e.target.value)} className="input" style={{ height: 32, padding: '0 8px', width: 180 }}>
            {['money', 'trend-up', 'scale', 'users', 'file', 'sheet', 'settings', 'boarding', 'shield', 'sparkle'].map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
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

function SubfoldersTab() {
  const productsQ = useProducts();
  const subfoldersQ = useSubfolders();
  const createSf = useCreateSubfolder();
  const patchSf = usePatchSubfolder();
  const deleteSf = useDeleteSubfolder();
  const [newForProduct, setNewForProduct] = useState<string | null>(null);
  const [editing, setEditing] = useState<Subfolder | null>(null);

  const products = productsQ.data ?? [];
  const subfolders = subfoldersQ.data ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 12.5, color: 'var(--fg-3)' }}>
        Sub-folders scope backlog items inside a product (e.g. Dashboard / dave). Tag items with a sub-folder in the Backlog view.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {products.map((p) => {
          const my = subfolders.filter((sf) => sf.productId === p.id);
          return (
            <div key={p.id} style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 8,
              padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: my.length ? 10 : 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
                <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--fg-1)' }}>{p.label}</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--fg-4)' }}>{my.length} sub-folder{my.length === 1 ? '' : 's'}</span>
                <div style={{ flex: 1 }} />
                <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => setNewForProduct(p.id)}>
                  <Icon name="plus" size={12} /> Add
                </button>
              </div>
              {my.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {my.map((sf) => (
                    <div key={sf.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 6,
                    }}>
                      <span style={{ fontSize: 13, color: 'var(--fg-2)', flex: 1 }}>{sf.name}</span>
                      <button className="btn btn-subtle btn-icon" title="Edit" onClick={() => setEditing(sf)}>
                        <Icon name="edit" size={12} />
                      </button>
                      <button
                        className="btn btn-subtle btn-icon"
                        title="Delete"
                        onClick={() => { if (confirm(`Delete sub-folder "${sf.name}"?`)) deleteSf.mutate(sf.id); }}
                        style={{ color: 'var(--danger-fg)' }}
                      >
                        <Icon name="close" size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {newForProduct && (
        <SubfolderDialog
          title={`New sub-folder · ${products.find((p) => p.id === newForProduct)?.label ?? ''}`}
          onClose={() => setNewForProduct(null)}
          onSubmit={(name) => createSf.mutate({ productId: newForProduct, name }, { onSuccess: () => setNewForProduct(null) })}
        />
      )}
      {editing && (
        <SubfolderDialog
          title="Rename sub-folder"
          initial={editing.name}
          onClose={() => setEditing(null)}
          onSubmit={(name) => patchSf.mutate({ id: editing.id, patch: { name } }, { onSuccess: () => setEditing(null) })}
        />
      )}
    </div>
  );
}

function SubfolderDialog({ title, initial = '', onClose, onSubmit }: {
  title: string;
  initial?: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit(name.trim());
  };
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Labelled label="Name">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="input" style={{ height: 32, width: '100%' }} />
        </Labelled>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!name.trim()}>Save</button>
        </div>
      </form>
    </Modal>
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
          <select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'member')} className="input" style={{ height: 32, padding: '0 8px', width: 140 }}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
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
          <select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'member')} className="input" style={{ height: 32, padding: '0 8px', width: 140 }}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
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
