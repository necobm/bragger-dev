import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { WorkspaceRepository } from './workspace-repository.js';

export const idParams = z.object({ id: z.coerce.number().int().positive() });
const workspaceBody = z.object({ name: z.string().trim().min(1).max(80) });

export const workspaceRoutes: FastifyPluginAsync<{ workspaces: WorkspaceRepository }> = async (app, { workspaces }) => {
  app.get('/workspaces', async () => workspaces.list());

  app.post('/workspaces', async (request, reply) => {
    const { name } = workspaceBody.parse(request.body);
    return reply.code(201).send(workspaces.create(name));
  });

  app.get('/workspaces/:id', async (request) => workspaces.get(idParams.parse(request.params).id));

  app.patch('/workspaces/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    return workspaces.rename(id, workspaceBody.parse(request.body).name);
  });

  app.delete('/workspaces/:id', async (request, reply) => {
    workspaces.delete(idParams.parse(request.params).id);
    return reply.code(204).send();
  });
};
