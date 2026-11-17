import { useState, type FormEvent } from 'react';
import type { SessionInfo } from '../../../src/shared/api.js';
import { api } from '../api';

interface Props {
  user: string;
  onLogin: (session: SessionInfo) => void;
}

export function LoginPage({ user, onLogin }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLogin(await api.login(password));
    } catch (err) {
      setError((err as Error).message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="centered">
      <form className="card login" onSubmit={submit}>
        <h1>Bragger</h1>
        <p className="muted">
          Enter the system password for <strong>{user}</strong> to unlock.
        </p>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy || !password}>
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </main>
  );
}
