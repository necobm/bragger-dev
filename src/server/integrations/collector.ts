import type { ActivityKind, ProviderId } from '../../shared/providers.js';

/** What a collector needs to talk to a provider. Works for saved and not-yet-saved connections. */
export interface ConnectionCredentials {
  provider: ProviderId;
  baseUrl: string | null;
  username: string | null;
  secret: string;
  scope: string[];
}

export interface CollectContext {
  connection: ConnectionCredentials;
  /** Half-open instant range [since, until). */
  since: Date;
  until: Date;
  signal?: AbortSignal;
}

/** A normalized activity item. `externalId` must be stable so re-syncs are idempotent. */
export interface CollectedActivity {
  kind: ActivityKind;
  externalId: string;
  title: string;
  url?: string;
  occurredAt: Date;
  payload?: unknown;
}

/**
 * Pulls the authenticated user's activity from one provider.
 * Repository providers: commits, PRs authored, PRs reviewed.
 * Collaboration providers: content authored/edited, comments, messages.
 */
export interface ActivityCollector {
  collect(ctx: CollectContext): AsyncIterable<CollectedActivity>;
  /**
   * Checks the credentials (and scope) work. Resolves with the account they belong to,
   * rejects with a user-readable message otherwise. Optional: providers without it are saved unchecked.
   */
  verify?(connection: ConnectionCredentials, signal?: AbortSignal): Promise<{ account: string }>;
}

export type Collectors = Record<ProviderId, ActivityCollector>;

export class CollectorNotImplementedError extends Error {
  constructor(provider: ProviderId) {
    super(`The ${provider} collector is not implemented yet`);
  }
}
