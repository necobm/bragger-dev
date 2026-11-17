import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyError } from 'fastify';
import fs from 'node:fs';
import { ZodError } from 'zod';
import { TimeframeError } from '../shared/timeframe.js';
import type { PasswordVerifier } from './auth/password-verifier.js';
import { authRoutes, requireSession } from './auth/routes.js';
import { SessionStore } from './auth/session-store.js';
import type { AppConfig } from './config.js';
import { ConnectionRepository } from './connections/connection-repository.js';
import { connectionRoutes } from './connections/routes.js';
import type { SecretBox } from './crypto/secret-box.js';
import type { DB } from './db/index.js';
import { HttpError } from './http-error.js';
import { ActivityRepository } from './reports/activity-repository.js';
import { reportRoutes } from './reports/routes.js';
import { workspaceRoutes } from './workspaces/routes.js';
import { WorkspaceRepository } from './workspaces/workspace-repository.js';

export interface AppDeps {
  config: AppConfig;
  db: DB;
  secrets: SecretBox;
  verifier: PasswordVerifier;
}

const ALLOWED_HOSTNAMES = new Set(['127.0.0.1', 'localhost']);

export async function buildApp({ config, db, secrets, verifier }: AppDeps) {
  const app = Fastify({
    logger: { level: config.isDev ? 'debug' : 'info', redact: ['req.headers.cookie'] },
  });

  // Defense against DNS rebinding: only serve requests addressed to loopback names.
  app.addHook('onRequest', async (request, reply) => {
    if (!ALLOWED_HOSTNAMES.has(request.hostname)) {
      return reply.code(403).send({ error: 'forbidden_host', message: 'Forbidden' });
    }
  });

  app.setErrorHandler((err: FastifyError | Error, request, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'validation', message: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    }
    if (err instanceof TimeframeError) return reply.code(400).send({ error: 'invalid_timeframe', message: err.message });
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.code, message: err.message });
    const statusCode = 'statusCode' in err && err.statusCode ? err.statusCode : 500;
    if (statusCode >= 500) request.log.error(err);
    return reply.code(statusCode).send({ error: 'error', message: statusCode >= 500 ? 'Internal error' : err.message });
  });

  await app.register(cookie);

  const sessions = new SessionStore(db, config.osSessionKey);
  const purged = sessions.purgeStale();
  if (purged > 0) app.log.info({ purged }, 'purged stale sessions');

  const workspaces = new WorkspaceRepository(db);
  const connections = new ConnectionRepository(db, secrets);
  const activities = new ActivityRepository(db);

  app.get('/api/health', async () => ({ status: 'ok' }));
  await app.register(authRoutes, { prefix: '/api/auth', sessions, verifier, osUser: config.osUser });

  // Everything else under /api requires an authenticated session.
  await app.register(
    async (api) => {
      api.addHook('onRequest', requireSession(sessions));
      await api.register(workspaceRoutes, { workspaces });
      await api.register(connectionRoutes, { workspaces, connections });
      await api.register(reportRoutes, { workspaces, connections, activities });
    },
    { prefix: '/api' },
  );

  if (fs.existsSync(config.webDir)) {
    await app.register(fastifyStatic, { root: config.webDir });
    // SPA fallback: client-side routes resolve to index.html.
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'not_found', message: 'Not found' });
    });
  }

  return app;
}
