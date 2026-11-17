import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import type { SessionInfo } from '../../shared/api.js';
import { MAX_PASSWORD_BYTES, type PasswordVerifier } from './password-verifier.js';
import { SESSION_COOKIE, type SessionStore } from './session-store.js';

const FAILED_LOGIN_DELAY_MS = 1000;
const loginBody = z.object({ password: z.string().min(1).max(MAX_PASSWORD_BYTES) });

interface AuthRoutesOptions {
  sessions: SessionStore;
  verifier: PasswordVerifier;
  osUser: string;
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app, { sessions, verifier, osUser }) => {
  app.get('/session', async (request): Promise<SessionInfo> => {
    const expiresAt = sessions.validate(request.cookies[SESSION_COOKIE]);
    return { authenticated: expiresAt !== null, user: osUser, expiresAt: expiresAt?.toISOString() };
  });

  app.post('/login', async (request, reply) => {
    const { password } = loginBody.parse(request.body);
    if (!(await verifier.verify(password))) {
      await sleep(FAILED_LOGIN_DELAY_MS); // slow down guessing
      return reply.code(401).send({ error: 'invalid_credentials', message: 'Invalid password' });
    }
    const { token, expiresAt } = sessions.create();
    reply.setCookie(SESSION_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'strict', expires: expiresAt });
    return { authenticated: true, user: osUser, expiresAt: expiresAt.toISOString() } satisfies SessionInfo;
  });

  app.post('/logout', async (request, reply) => {
    sessions.revoke(request.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.code(204).send();
  });
};

/** onRequest hook that rejects requests without a valid session. */
export function requireSession(sessions: SessionStore) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!sessions.validate(request.cookies[SESSION_COOKIE])) {
      return reply.code(401).send({ error: 'unauthenticated', message: 'Login required' });
    }
  };
}
