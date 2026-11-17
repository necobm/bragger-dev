import type { Activity } from '../../shared/api.js';
import type { ActivityKind, ProviderId } from '../../shared/providers.js';
import type { DB } from '../db/index.js';
import type { CollectedActivity } from '../integrations/collector.js';

interface ActivityRow {
  id: number;
  connection_id: number;
  provider: ProviderId;
  kind: ActivityKind;
  title: string;
  url: string | null;
  occurred_at: string;
}

export class ActivityRepository {
  constructor(private readonly db: DB) {}

  /** Inserts or refreshes an activity; returns true if it was new. */
  upsert(workspaceId: number, connectionId: number, provider: ProviderId, a: CollectedActivity): boolean {
    const existed = this.db
      .prepare('SELECT 1 FROM activities WHERE connection_id = ? AND kind = ? AND external_id = ?')
      .get(connectionId, a.kind, a.externalId);
    this.db
      .prepare(
        `INSERT INTO activities (workspace_id, connection_id, provider, kind, external_id, title, url, occurred_at, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (connection_id, kind, external_id) DO UPDATE SET
           title = excluded.title, url = excluded.url, occurred_at = excluded.occurred_at, payload_json = excluded.payload_json`,
      )
      .run(
        workspaceId,
        connectionId,
        provider,
        a.kind,
        a.externalId,
        a.title,
        a.url ?? null,
        a.occurredAt.toISOString(),
        a.payload === undefined ? null : JSON.stringify(a.payload),
      );
    return !existed;
  }

  listInRange(workspaceId: number, since: Date, until: Date): Activity[] {
    const rows = this.db
      .prepare(
        `SELECT id, connection_id, provider, kind, title, url, occurred_at FROM activities
         WHERE workspace_id = ? AND occurred_at >= ? AND occurred_at < ?
         ORDER BY occurred_at DESC`,
      )
      .all(workspaceId, since.toISOString(), until.toISOString()) as ActivityRow[];
    return rows.map((r) => ({
      id: r.id,
      connectionId: r.connection_id,
      provider: r.provider,
      kind: r.kind,
      title: r.title,
      url: r.url,
      occurredAt: r.occurred_at,
    }));
  }
}
