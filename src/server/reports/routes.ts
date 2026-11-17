import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ReportResponse, SyncResult } from '../../shared/api.js';
import {
  DEFAULT_TIMEFRAME,
  rangeToInstants,
  resolveTimeframe,
  TIMEFRAME_PRESETS,
  type TimeframeInput,
} from '../../shared/timeframe.js';
import type { ConnectionRepository } from '../connections/connection-repository.js';
import type { Collectors } from '../integrations/collector.js';
import type { WorkspaceRepository } from '../workspaces/workspace-repository.js';
import { idParams } from '../workspaces/routes.js';
import type { ActivityRepository } from './activity-repository.js';

/** Upper bound for syncing one connection (search API rate limits can make large ranges slow). */
const SYNC_TIMEOUT_MS = 10 * 60 * 1000;

const timeframeQuery = z.object({
  preset: z.enum(TIMEFRAME_PRESETS).default(DEFAULT_TIMEFRAME),
  from: z.string().optional(),
  to: z.string().optional(),
});

function parseTimeframe(query: unknown) {
  const q = timeframeQuery.parse(query);
  const input: TimeframeInput =
    q.preset === 'custom' ? { preset: 'custom', from: q.from ?? '', to: q.to ?? '' } : { preset: q.preset };
  return { preset: q.preset, range: resolveTimeframe(input) };
}

interface Options {
  workspaces: WorkspaceRepository;
  connections: ConnectionRepository;
  activities: ActivityRepository;
  collectors: Collectors;
}

export const reportRoutes: FastifyPluginAsync<Options> = async (app, { workspaces, connections, activities, collectors }) => {
  /** GET /workspaces/:id/report?preset=last_month | ?preset=custom&from=YYYY-MM-DD&to=YYYY-MM-DD */
  app.get('/workspaces/:id/report', async (request): Promise<ReportResponse> => {
    const { id } = idParams.parse(request.params);
    workspaces.get(id);
    const { preset, range } = parseTimeframe(request.query);
    const { since, until } = rangeToInstants(range);
    const items = activities.listInRange(id, since, until);
    const totals: ReportResponse['totals'] = {};
    for (const a of items) totals[a.kind] = (totals[a.kind] ?? 0) + 1;
    return { preset, range, totals, activities: items };
  });

  /** Pulls activity for the selected time frame from every connection of the workspace. */
  app.post('/workspaces/:id/sync', async (request): Promise<SyncResult[]> => {
    const { id } = idParams.parse(request.params);
    workspaces.get(id);
    const { since, until } = rangeToInstants(parseTimeframe(request.query).range);

    const results: SyncResult[] = [];
    for (const connection of connections.listWithSecrets(id)) {
      let imported = 0;
      try {
        for await (const item of collectors[connection.provider].collect({ connection, since, until, signal: AbortSignal.timeout(SYNC_TIMEOUT_MS) })) {
          if (activities.upsert(id, connection.id, connection.provider, item)) imported++;
        }
        connections.markSynced(connection.id);
        results.push({ connectionId: connection.id, provider: connection.provider, status: 'ok', imported });
      } catch (err) {
        request.log.warn({ err, connectionId: connection.id }, 'sync failed');
        results.push({ connectionId: connection.id, provider: connection.provider, status: 'error', imported, error: (err as Error).message });
      }
    }
    return results;
  });
};
