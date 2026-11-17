import type { Workspace } from '../../shared/api.js';
import type { DB } from '../db/index.js';
import { HttpError } from '../http-error.js';

interface WorkspaceRow {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

const toWorkspace = (r: WorkspaceRow): Workspace => ({ id: r.id, name: r.name, createdAt: r.created_at, updatedAt: r.updated_at });

const isUniqueViolation = (err: unknown) => (err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE';

export class WorkspaceRepository {
  constructor(private readonly db: DB) {}

  list(): Workspace[] {
    return (this.db.prepare('SELECT * FROM workspaces ORDER BY name').all() as WorkspaceRow[]).map(toWorkspace);
  }

  get(id: number): Workspace {
    const row = this.db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as WorkspaceRow | undefined;
    if (!row) throw HttpError.notFound('Workspace');
    return toWorkspace(row);
  }

  create(name: string): Workspace {
    try {
      const row = this.db.prepare('INSERT INTO workspaces (name) VALUES (?) RETURNING *').get(name) as WorkspaceRow;
      return toWorkspace(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw HttpError.conflict(`A workspace named "${name}" already exists`);
      throw err;
    }
  }

  rename(id: number, name: string): Workspace {
    try {
      const row = this.db
        .prepare(`UPDATE workspaces SET name = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? RETURNING *`)
        .get(name, id) as WorkspaceRow | undefined;
      if (!row) throw HttpError.notFound('Workspace');
      return toWorkspace(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw HttpError.conflict(`A workspace named "${name}" already exists`);
      throw err;
    }
  }

  delete(id: number): void {
    if (this.db.prepare('DELETE FROM workspaces WHERE id = ?').run(id).changes === 0) throw HttpError.notFound('Workspace');
  }
}
