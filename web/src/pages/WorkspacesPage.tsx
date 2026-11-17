import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import type { Workspace } from '../../../src/shared/api.js';
import { api } from '../api';

interface Props {
  user: string;
  onLogout: () => void;
}

/** Entry view: existing workspaces and the option to create a new one. */
export function WorkspacesPage({ user, onLogout }: Props) {
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.listWorkspaces().then(setWorkspaces, (err: Error) => setError(err.message));
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const ws = await api.createWorkspace(name.trim());
      navigate(`/workspaces/${ws.id}/settings`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <>
      <header className="topbar">
        <strong>Bragger</strong>
        <span className="spacer" />
        <span className="muted">{user}</span>
        <button className="link" onClick={onLogout}>
          Lock
        </button>
      </header>
      <main className="page narrow">
        <h1>Workspaces</h1>
        {workspaces === null ? (
          <p className="muted">Loading…</p>
        ) : workspaces.length === 0 ? (
          <p className="muted">No workspaces yet. Create your first one below.</p>
        ) : (
          <ul className="list">
            {workspaces.map((ws) => (
              <li key={ws.id}>
                <Link to={`/workspaces/${ws.id}`}>{ws.name}</Link>
              </li>
            ))}
          </ul>
        )}

        <form className="card row" onSubmit={create}>
          <input placeholder="New workspace name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          <button type="submit" disabled={!name.trim()}>
            Create
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </main>
    </>
  );
}
