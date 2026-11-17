import { useCallback, useEffect, useState } from 'react';
import type { ReportResponse, SyncResult } from '../../../src/shared/api.js';
import { ACTIVITY_KIND_LABELS, ACTIVITY_KINDS } from '../../../src/shared/providers.js';
import { DEFAULT_TIMEFRAME, localToday, resolveTimeframe, TIMEFRAME_LABELS, TIMEFRAME_PRESETS } from '../../../src/shared/timeframe.js';
import { api, type TimeframeSelection } from '../api';
import { useWorkspace } from './WorkspaceLayout';

export function ReportPage() {
  const workspace = useWorkspace();
  const [timeframe, setTimeframe] = useState<TimeframeSelection>({
    preset: DEFAULT_TIMEFRAME,
    custom: resolveTimeframe({ preset: DEFAULT_TIMEFRAME }),
  });
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [syncResults, setSyncResults] = useState<SyncResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api.report(workspace.id, timeframe).then(setReport, (err: Error) => setError(err.message));
  }, [workspace.id, timeframe]);

  useEffect(load, [load]);

  const sync = async () => {
    setBusy(true);
    try {
      setSyncResults(await api.sync(workspace.id, timeframe));
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const custom = timeframe.custom!;
  const today = localToday();

  return (
    <>
      <section className="toolbar">
        <select value={timeframe.preset} onChange={(e) => setTimeframe({ ...timeframe, preset: e.target.value as TimeframeSelection['preset'] })}>
          {TIMEFRAME_PRESETS.map((p) => (
            <option key={p} value={p}>
              {TIMEFRAME_LABELS[p]}
            </option>
          ))}
        </select>
        {timeframe.preset === 'custom' && (
          <>
            <input type="date" value={custom.from} max={today} onChange={(e) => setTimeframe({ ...timeframe, custom: { ...custom, from: e.target.value } })} />
            <span>→</span>
            <input type="date" value={custom.to} max={today} onChange={(e) => setTimeframe({ ...timeframe, custom: { ...custom, to: e.target.value } })} />
          </>
        )}
        {report && (
          <span className="muted">
            {report.range.from} → {report.range.to}
          </span>
        )}
        <span className="spacer" />
        <button onClick={sync} disabled={busy}>
          {busy ? 'Syncing…' : 'Sync activity'}
        </button>
      </section>

      {error && <p className="error">{error}</p>}

      {syncResults && (
        <p className="muted">
          {syncResults.length === 0
            ? 'No connections to sync. Add one in Settings.'
            : `Sync done: ${syncResults.filter((r) => r.status === 'ok').reduce((n, r) => n + r.imported, 0)} new items.`}
        </p>
      )}

      {syncResults?.some((r) => r.status === 'error') && (
        <ul className="card warnings">
          {syncResults
            .filter((r) => r.status === 'error')
            .map((r) => (
              <li key={r.connectionId}>
                {r.provider}: {r.error}
              </li>
            ))}
        </ul>
      )}

      {report && (
        <>
          <section className="stats">
            {ACTIVITY_KINDS.map((kind) => (
              <div key={kind} className="card stat">
                <span className="stat-value">{report.totals[kind] ?? 0}</span>
                <span className="muted">{ACTIVITY_KIND_LABELS[kind]}</span>
              </div>
            ))}
          </section>

          <section>
            <h2>Activity</h2>
            {report.activities.length === 0 ? (
              <p className="muted">No activity in this period. Configure connections in Settings, then sync.</p>
            ) : (
              <ul className="list">
                {report.activities.map((a) => (
                  <li key={a.id}>
                    <span className="badge">{ACTIVITY_KIND_LABELS[a.kind]}</span>
                    {a.url ? (
                      <a href={a.url} target="_blank" rel="noreferrer">
                        {a.title}
                      </a>
                    ) : (
                      a.title
                    )}
                    <span className="muted"> · {new Date(a.occurredAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
