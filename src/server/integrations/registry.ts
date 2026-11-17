import type { ProviderId } from '../../shared/providers.js';
import { CollectorNotImplementedError, type ActivityCollector, type Collectors } from './collector.js';
import { createGitHubCollector } from './github/collector.js';

const notImplemented = (provider: ProviderId): ActivityCollector => ({
  async *collect() {
    throw new CollectorNotImplementedError(provider);
  },
});

/**
 * One collector per provider (the type requires an entry for every provider in the catalog).
 * Implementations live in src/server/integrations/<provider>/.
 */
export function createCollectors(): Collectors {
  return {
    github: createGitHubCollector(),
    notion: notImplemented('notion'),
  };
}
