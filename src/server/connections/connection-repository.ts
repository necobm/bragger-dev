import type { Connection } from '../../shared/api.js';
import { getProvider, type ProviderId } from '../../shared/providers.js';
import type { SecretBox } from '../crypto/secret-box.js';
import type { DB } from '../db/index.js';
import { HttpError } from '../http-error.js';
import type { ConnectionCredentials } from '../integrations/collector.js';

interface ConnectionRow {
  id: number;
  workspace_id: number;
  category: Connection['category'];
  provider: ProviderId;
  label: string;
  base_url: string | null;
  username: string | null;
  scope_json: string;
  last_synced_at: string | null;
  created_at: string;
  secret_enc: string;
}

/** A connection plus its decrypted secret. Only for server-side collectors, never serialize it. */
export type ConnectionWithSecret = Connection & ConnectionCredentials;

const toConnection = (r: ConnectionRow): Connection => ({
  id: r.id,
  workspaceId: r.workspace_id,
  category: r.category,
  provider: r.provider,
  label: r.label,
  baseUrl: r.base_url,
  username: r.username,
  scope: JSON.parse(r.scope_json) as string[],
  lastSyncedAt: r.last_synced_at,
  createdAt: r.created_at,
});

export class ConnectionRepository {
  constructor(
    private readonly db: DB,
    private readonly secrets: SecretBox,
  ) {}

  list(workspaceId: number): Connection[] {
    const rows = this.db.prepare('SELECT * FROM connections WHERE workspace_id = ? ORDER BY category, provider, label').all(workspaceId);
    return (rows as ConnectionRow[]).map(toConnection);
  }

  listWithSecrets(workspaceId: number): ConnectionWithSecret[] {
    const rows = this.db.prepare('SELECT * FROM connections WHERE workspace_id = ?').all(workspaceId) as ConnectionRow[];
    return rows.map((r) => this.withSecret(r));
  }

  getWithSecret(workspaceId: number, id: number): ConnectionWithSecret {
    const row = this.db.prepare('SELECT * FROM connections WHERE id = ? AND workspace_id = ?').get(id, workspaceId) as ConnectionRow | undefined;
    if (!row) throw HttpError.notFound('Connection');
    return this.withSecret(row);
  }

  create(workspaceId: number, label: string, credentials: ConnectionCredentials): Connection {
    const provider = getProvider(credentials.provider);
    const row = this.db
      .prepare(
        `INSERT INTO connections (workspace_id, category, provider, label, base_url, username, auth_type, secret_enc, scope_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .get(
        workspaceId,
        provider.category,
        credentials.provider,
        label,
        credentials.baseUrl,
        credentials.username,
        provider.authType,
        this.secrets.seal(credentials.secret),
        JSON.stringify(credentials.scope),
      ) as ConnectionRow;
    return toConnection(row);
  }

  markSynced(id: number): void {
    this.db.prepare(`UPDATE connections SET last_synced_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).run(id);
  }

  delete(workspaceId: number, id: number): void {
    const { changes } = this.db.prepare('DELETE FROM connections WHERE id = ? AND workspace_id = ?').run(id, workspaceId);
    if (changes === 0) throw HttpError.notFound('Connection');
  }

  private withSecret(row: ConnectionRow): ConnectionWithSecret {
    return { ...toConnection(row), secret: this.secrets.open(row.secret_enc) };
  }
}
