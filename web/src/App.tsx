import { useCallback, useEffect, useState } from 'react';
import { Route, Routes } from 'react-router';
import type { SessionInfo } from '../../src/shared/api.js';
import { api, UNAUTHORIZED_EVENT } from './api';
import { LoginPage } from './pages/LoginPage';
import { ReportPage } from './pages/ReportPage';
import { SettingsPage } from './pages/SettingsPage';
import { WorkspaceLayout } from './pages/WorkspaceLayout';
import { WorkspacesPage } from './pages/WorkspacesPage';

export function App() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.session().then(setSession, (err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(UNAUTHORIZED_EVENT, refresh);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, refresh);
  }, [refresh]);

  if (error) return <main className="centered error">Cannot reach the local server: {error}</main>;
  if (!session) return <main className="centered muted">Loading…</main>;
  if (!session.authenticated) return <LoginPage user={session.user} onLogin={setSession} />;

  const logout = () => api.logout().finally(refresh);

  return (
    <Routes>
      <Route path="/" element={<WorkspacesPage user={session.user} onLogout={logout} />} />
      <Route path="/workspaces/:workspaceId" element={<WorkspaceLayout onLogout={logout} />}>
        <Route index element={<ReportPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
