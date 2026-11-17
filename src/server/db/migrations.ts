/**
 * Append-only list of schema migrations. Never edit a migration that has shipped;
 * add a new one instead.
 */
export interface Migration {
  id: number;
  name: string;
  sql: string;
}

const NOW = `(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: 'initial schema',
    sql: `
      CREATE TABLE workspaces (
        id          INTEGER PRIMARY KEY,
        name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
        created_at  TEXT NOT NULL DEFAULT ${NOW},
        updated_at  TEXT NOT NULL DEFAULT ${NOW}
      );

      -- Repository (e.g. GitHub) and collaboration (e.g. Notion) accounts. Provider ids come from src/shared/providers.ts.
      CREATE TABLE connections (
        id               INTEGER PRIMARY KEY,
        workspace_id     INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        category         TEXT NOT NULL CHECK (category IN ('repository', 'collaboration')),
        provider         TEXT NOT NULL,
        label            TEXT NOT NULL,
        base_url         TEXT,
        username         TEXT,
        auth_type        TEXT NOT NULL CHECK (auth_type IN ('personal_access_token', 'api_key')),
        secret_enc       TEXT NOT NULL,           -- AES-256-GCM, see crypto/secret-box.ts
        scope_json       TEXT NOT NULL DEFAULT '[]',
        last_synced_at   TEXT,
        created_at       TEXT NOT NULL DEFAULT ${NOW}
      );
      CREATE INDEX connections_workspace ON connections(workspace_id);

      -- Normalized activity items imported from connections.
      CREATE TABLE activities (
        id             INTEGER PRIMARY KEY,
        workspace_id   INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        connection_id  INTEGER NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
        provider       TEXT NOT NULL,
        kind           TEXT NOT NULL,
        external_id    TEXT NOT NULL,
        title          TEXT NOT NULL,
        url            TEXT,
        occurred_at    TEXT NOT NULL,             -- ISO-8601 UTC instant
        payload_json   TEXT,
        imported_at    TEXT NOT NULL DEFAULT ${NOW},
        UNIQUE (connection_id, kind, external_id)
      );
      CREATE INDEX activities_workspace_time ON activities(workspace_id, occurred_at);

      CREATE TABLE sessions (
        token_hash      TEXT PRIMARY KEY,         -- sha256 of the cookie value
        os_session_key  TEXT NOT NULL,
        created_at      INTEGER NOT NULL,         -- epoch ms
        expires_at      INTEGER NOT NULL          -- epoch ms
      );
    `,
  },
];
