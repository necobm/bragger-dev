import type { ActivityKind, ProviderId } from '../../shared/providers.js';
import type { ConnectionWithSecret } from '../connections/connection-repository.js';

export interface CollectContext {
  connection: ConnectionWithSecret;
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
}

export class CollectorNotImplementedError extends Error {
  constructor(provider: ProviderId) {
    super(`The ${provider} collector is not implemented yet`);
  }
}
