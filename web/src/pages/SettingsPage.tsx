import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import type { Connection } from '../../../src/shared/api.js';
import { getProvider, PROVIDER_IDS, PROVIDERS, type ConnectionCategory, type ProviderId } from '../../../src/shared/providers.js';
import { api } from '../api';
import { useWorkspace } from './WorkspaceLayout';

const CATEGORY_TITLES: Record<ConnectionCategory, string> = {
  repository: 'Code repositories',
  collaboration: 'Collaboration tools',
};

export function SettingsPage() {
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<number, { ok: boolean; text: string }>>({});

  const load = useCallback(() => {
    api.listConnections(workspace.id).then(setConnections, (err: Error) => setError(err.message));
  }, [workspace.id]);
  useEffect(load, [load]);

  const remove = async (c: Connection) => {
    if (!confirm(`Remove ${c.label}?`)) return;
    await api.deleteConnection(workspace.id, c.id).catch((err: Error) => setError(err.message));
    load();
  };

  const test = async (c: Connection) => {
    setTests((t) => ({ ...t, [c.id]: { ok: true, text: 'Testing…' } }));
    const result = await api.testConnection(workspace.id, c.id).catch((err: Error) => ({ ok: false as const, error: err.message }));
    const status = result.ok
      ? { ok: true, text: result.account ? `Connected as ${result.account}` : 'No connection test for this provider yet' }
      : { ok: false, text: result.error };
    setTests((t) => ({ ...t, [c.id]: status }));
  };

  const deleteWorkspace = async () => {
    if (!confirm(`Delete workspace "${workspace.name}" and all its data?`)) return;
    await api.deleteWorkspace(workspace.id);
    navigate('/');
  };

  return (
    <>
      {error && <p className="error">{error}</p>}
      {(Object.keys(CATEGORY_TITLES) as ConnectionCategory[]).map((category) => (
        <section key={category}>
          <h2>{CATEGORY_TITLES[category]}</h2>
          <ul className="list">
            {connections
              .filter((c) => c.category === category)
              .map((c) => (
                <li key={c.id}>
                  <span className="badge">{PROVIDERS[c.provider].name}</span>
                  {c.label}
                  {c.baseUrl && <span className="muted"> · {c.baseUrl}</span>}
                  {c.scope.length > 0 && <span className="muted"> · {c.scope.join(', ')}</span>}
                  <span className="muted"> · {c.lastSyncedAt ? `synced ${new Date(c.lastSyncedAt).toLocaleString()}` : 'never synced'}</span>
                  <span className="spacer" />
                  {tests[c.id] && <span className={tests[c.id]!.ok ? 'muted' : 'error'}>{tests[c.id]!.text}</span>}
                  <button className="link" onClick={() => test(c)}>
                    Test
                  </button>
                  <button className="link danger" onClick={() => remove(c)}>
                    Remove
                  </button>
                </li>
              ))}
          </ul>
          <ConnectionForm category={category} workspaceId={workspace.id} onCreated={load} />
        </section>
      ))}

      <section>
        <h2>Danger zone</h2>
        <button className="danger" onClick={deleteWorkspace}>
          Delete workspace
        </button>
      </section>
    </>
  );
}

interface FormProps {
  category: ConnectionCategory;
  workspaceId: number;
  onCreated: () => void;
}

function ConnectionForm({ category, workspaceId, onCreated }: FormProps) {
  const options = PROVIDER_IDS.filter((id) => PROVIDERS[id].category === category);
  const [provider, setProvider] = useState<ProviderId>(options[0]!);
  const [label, setLabel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [username, setUsername] = useState('');
  const [secret, setSecret] = useState('');
  const [scope, setScope] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const def = getProvider(provider); // widened type: the form handles every optional field

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.createConnection(workspaceId, {
        provider,
        label: label.trim() || def.name,
        baseUrl: baseUrl.trim() || undefined,
        username: username.trim() || undefined,
        secret,
        scope: scope.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
      });
      setLabel('');
      setBaseUrl('');
      setUsername('');
      setSecret('');
      setScope('');
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card form" onSubmit={submit}>
      <label>
        Provider
        <select value={provider} onChange={(e) => setProvider(e.target.value as ProviderId)}>
          {options.map((id) => (
            <option key={id} value={id}>
              {PROVIDERS[id].name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Label
        <input value={label} placeholder={def.name} onChange={(e) => setLabel(e.target.value)} />
      </label>
      {def.baseUrl && (
        <label>
          Base URL{def.baseUrl.required ? '' : ' (optional)'}
          <input value={baseUrl} placeholder={def.baseUrl.placeholder} required={def.baseUrl.required} onChange={(e) => setBaseUrl(e.target.value)} />
        </label>
      )}
      {def.username && (
        <label>
          {def.username.label}
          <input value={username} required onChange={(e) => setUsername(e.target.value)} />
        </label>
      )}
      <label>
        {def.secretLabel}
        <input type="password" autoComplete="off" value={secret} required onChange={(e) => setSecret(e.target.value)} />
      </label>
      <label>
        Scope (optional, comma or newline separated)
        <textarea rows={2} value={scope} placeholder={def.scopeHint} onChange={(e) => setScope(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={!secret || busy}>
        {busy ? 'Verifying…' : `Add ${def.name}`}
      </button>
    </form>
  );
}
