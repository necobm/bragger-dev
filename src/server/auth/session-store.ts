import { createHash, randomBytes } from 'node:crypto';
import type { DB } from '../db/index.js';

export const SESSION_COOKIE = 'bragger_session';
export const SESSION_TTL_MS = 10 * 24 * 60 * 60 * 1000; // 10 days

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * App sessions are valid for 10 days AND only within the OS login session they were
 * created in (see AppConfig.osSessionKey). Only token hashes are stored.
 */
export class SessionStore {
  constructor(
    private readonly db: DB,
    private readonly osSessionKey: string,
    private readonly now: () => number = Date.now,
  ) {}

  /** Drops expired sessions and sessions from previous OS login sessions. */
  purgeStale(): number {
    return this.db
      .prepare('DELETE FROM sessions WHERE expires_at <= ? OR os_session_key <> ?')
      .run(this.now(), this.osSessionKey).changes;
  }

  create(): { token: string; expiresAt: Date } {
    const token = randomBytes(32).toString('base64url');
    const createdAt = this.now();
    const expiresAt = createdAt + SESSION_TTL_MS;
    this.db
      .prepare('INSERT INTO sessions (token_hash, os_session_key, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(hash(token), this.osSessionKey, createdAt, expiresAt);
    return { token, expiresAt: new Date(expiresAt) };
  }

  /** Returns the expiry of a valid session, or null. */
  validate(token: string | undefined): Date | null {
    if (!token) return null;
    const row = this.db
      .prepare('SELECT expires_at FROM sessions WHERE token_hash = ? AND os_session_key = ? AND expires_at > ?')
      .get(hash(token), this.osSessionKey, this.now()) as { expires_at: number } | undefined;
    return row ? new Date(row.expires_at) : null;
  }

  revoke(token: string | undefined): void {
    if (token) this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(token));
  }
}
