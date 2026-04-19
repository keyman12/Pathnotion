import { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Avatar } from '../components/primitives';
import { Icon } from '../components/Icon';
import { useCreateUser, usePatchUser, useResetUserPassword, useUsers } from '../lib/queries';
import { useSession } from '../lib/useSession';
import type { SessionUser } from '../lib/api';

type Tab = 'users' | 'products' | 'notifications';

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
          { id: 'notifications', label: 'Notifications' },
        ]}
        activeTab={tab}
        onTab={setTab}
      />

      {tab === 'users' && (isAdmin ? <UsersTab /> : <NotAllowed />)}
      {tab === 'products' && <Placeholder title="Products" note="Add / rename / recolour products. Lands in Phase 3." />}
      {tab === 'notifications' && <Placeholder title="Notifications" note="Daily digest via SMTP. Lands in Phase 3." />}
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

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px dashed var(--border-default)',
      borderRadius: 8,
      padding: '24px 28px',
    }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-1)', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12.5, color: 'var(--fg-3)' }}>{note}</div>
    </div>
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
