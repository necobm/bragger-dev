import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getProvider, PROVIDER_IDS, type ProviderId } from '../../shared/providers.js';
import { HttpError } from '../http-error.js';
import type { Collectors } from '../integrations/collector.js';
import type { WorkspaceRepository } from '../workspaces/workspace-repository.js';
import { idParams } from '../workspaces/routes.js';
import type { ConnectionRepository } from './connection-repository.js';
import { resolveCredentials, testConnection } from './verify.js';

const connectionParams = idParams.extend({ connectionId: z.coerce.number().int().positive() });

const createBody = z.object({
  provider: z.enum(PROVIDER_IDS as [ProviderId, ...ProviderId[]]),
  label: z.string().trim().min(1).max(80),
  baseUrl: z.url({ protocol: /^https?$/ }).optional().or(z.literal('').transform(() => undefined)),
  username: z.string().trim().max(200).optional(),
  secret: z.string().trim().min(1).max(4096),
  scope: z.array(z.string().trim().min(1).max(200)).max(200).optional(),
});

interface Options {
  workspaces: WorkspaceRepository;
  connections: ConnectionRepository;
  collectors: Collectors;
}

export const connectionRoutes: FastifyPluginAsync<Options> = async (app, { workspaces, connections, collectors }) => {
  app.get('/workspaces/:id/connections', async (request) => {
    const { id } = idParams.parse(request.params);
    workspaces.get(id);
    return connections.list(id);
  });

  /** Credentials are checked against the provider before saving, so a bad token is caught early. */
  app.post('/workspaces/:id/connections', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    workspaces.get(id);
    const body = createBody.parse(request.body);
    const credentials = resolveCredentials(body);
    const result = await testConnection(collectors, credentials);
    if (!result.ok) {
      throw new HttpError(400, 'connection_failed', `Could not connect to ${getProvider(body.provider).name}: ${result.error}`);
    }
    return reply.code(201).send(connections.create(id, body.label, credentials));
  });

  app.post('/workspaces/:id/connections/:connectionId/test', async (request) => {
    const { id, connectionId } = connectionParams.parse(request.params);
    return testConnection(collectors, connections.getWithSecret(id, connectionId));
  });

  app.delete('/workspaces/:id/connections/:connectionId', async (request, reply) => {
    const { id, connectionId } = connectionParams.parse(request.params);
    connections.delete(id, connectionId);
    return reply.code(204).send();
  });
};
