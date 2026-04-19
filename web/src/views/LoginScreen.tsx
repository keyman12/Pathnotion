import { useState } from 'react';
import { useLogin } from '../lib/useSession';
import { Icon } from '../components/Icon';

export function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ username: username.trim(), password });
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-canvas)',
      padding: 24,
    }}>
      <form onSubmit={submit} style={{
        width: 360,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 12,
        padding: '28px 28px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        boxShadow: 'var(--shadow-2)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 4 }}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--fg-4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Path · Pathnotion
          </div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--fg-1)' }}>Sign in</h1>
          <div style={{ fontSize: 13, color: 'var(--fg-3)' }}>
            Two-founder workspace — your daily surface.
          </div>
        </div>

        <Field label="Username">
          <input
            type="text"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="input"
            style={{ width: '100%', height: 38 }}
          />
        </Field>

        <Field label="Password">
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            style={{ width: '100%', height: 38 }}
          />
        </Field>

        {login.isError && (
          <div style={{
            fontSize: 12.5,
            color: 'var(--danger-fg)',
            background: 'var(--danger-bg)',
            padding: '8px 12px',
            borderRadius: 6,
          }}>
            {login.error instanceof Error ? login.error.message : 'Sign-in failed'}
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={login.isPending || !username.trim() || !password}
          style={{ justifyContent: 'center', height: 40 }}
        >
          {login.isPending ? 'Signing in…' : <>Continue <Icon name="arrow-right" size={14} /></>}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, color: 'var(--fg-3)', fontWeight: 500 }}>{label}</span>
      {children}
    </label>
  );
}
