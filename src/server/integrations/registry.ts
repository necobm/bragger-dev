import type { ProviderId } from '../../shared/providers.js';
import { CollectorNotImplementedError, type ActivityCollector } from './collector.js';

const notImplemented = (provider: ProviderId): ActivityCollector => ({
  async *collect() {
    throw new CollectorNotImplementedError(provider);
  },
});

/**
 * One collector per provider. Replace each stub with a real implementation in
 * src/server/integrations/<provider>.ts.
 */
export const collectors: Record<ProviderId, ActivityCollector> = {
  github: notImplemented('github'),
  notion: notImplemented('notion'),
};
