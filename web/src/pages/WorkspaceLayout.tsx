import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useOutletContext, useParams } from 'react-router';
import type { Workspace } from '../../../src/shared/api.js';
import { api } from '../api';

export interface WorkspaceContext {
  workspace: Workspace;
}

export const useWorkspace = () => useOutletContext<WorkspaceContext>().workspace;

export function WorkspaceLayout({ onLogout }: { onLogout: () => void }) {
  const id = Number(useParams().workspaceId);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getWorkspace(id).then(setWorkspace, (err: Error) => setError(err.message));
  }, [id]);

  return (
    <>
      <header className="topbar">
        <Link to="/">← Workspaces</Link>
        <strong>{workspace?.name}</strong>
        <nav>
          <NavLink to="" end>
            Report
          </NavLink>
          <NavLink to="settings">Settings</NavLink>
        </nav>
        <span className="spacer" />
        <button className="link" onClick={onLogout}>
          Lock
        </button>
      </header>
      <main className="page">
        {error && <p className="error">{error}</p>}
        {workspace && <Outlet context={{ workspace } satisfies WorkspaceContext} />}
      </main>
    </>
  );
}
