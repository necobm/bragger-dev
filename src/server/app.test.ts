import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { AppConfig } from './config.js';
import { SecretBox } from './crypto/secret-box.js';
import { openDatabase } from './db/index.js';
import type { Collectors } from './integrations/collector.js';

const PASSWORD = 'correct horse';

/** Fake collectors: no network. GitHub accepts the token "ghp_secret" and yields one commit. */
const collectors: Collectors = {
  github: {
    async verify(c) {
      if (c.secret !== 'ghp_secret') throw new Error('Bad credentials: check the token');
      return { account: 'octocat' };
    },
    async *collect({ since }) {
      yield { kind: 'commit', externalId: 'acme/api@abc', title: 'acme/api: Fix login', occurredAt: new Date(since.getTime() + 3600_000) };
    },
  },
  notion: {
    async *collect() {},
  },
};

describe('API', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bragger-test-'));
  const config: AppConfig = {
    isDev: true,
    host: '127.0.0.1',
    port: 0,
    osUser: 'tester',
    dataDir: tmp,
    dbPath: ':memory:',
    secretKeyPath: path.join(tmp, 'secret.key'),
    runtimeDir: tmp,
    runtimeFile: path.join(tmp, 'server.json'),
    osSessionKey: 'test-session',
    webDir: path.join(tmp, 'no-web'),
  };
  const db = openDatabase(':memory:');
  let app: Awaited<ReturnType<typeof buildApp>>;
  let cookie = '';

  beforeAll(async () => {
    app = await buildApp({
      config,
      db,
      secrets: new SecretBox(randomBytes(32)),
      verifier: { verify: async (p) => p === PASSWORD },
      collectors,
    });
    app.log.level = 'silent';
  });
  afterAll(async () => {
    await app.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const call = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { host: '127.0.0.1', cookie } });

  it('requires login', async () => {
    expect((await call('GET', '/api/workspaces')).statusCode).toBe(401);
  });

  it('logs in with the OS password', async () => {
    const res = await call('POST', '/api/auth/login', { password: PASSWORD });
    expect(res.statusCode).toBe(200);
    const setCookie = res.cookies.find((c) => c.name === 'bragger_session');
    expect(setCookie?.httpOnly).toBe(true);
    cookie = `bragger_session=${setCookie?.value}`;
  });

  it('manages workspaces, connections and reports', async () => {
    const ws = (await call('POST', '/api/workspaces', { name: 'Acme' })).json();
    expect((await call('POST', '/api/workspaces', { name: 'acme' })).statusCode).toBe(409);

    const conn = await call('POST', `/api/workspaces/${ws.id}/connections`, {
      provider: 'github',
      label: 'Work GitHub',
      secret: 'ghp_secret',
      scope: ['acme/api'],
    });
    expect(conn.statusCode).toBe(201);
    expect(conn.json()).toMatchObject({ category: 'repository', baseUrl: 'https://api.github.com' });
    expect(conn.body).not.toContain('ghp_secret');
    expect(JSON.stringify(db.prepare('SELECT secret_enc FROM connections').all())).not.toContain('ghp_secret');

    const unsupported = await call('POST', `/api/workspaces/${ws.id}/connections`, { provider: 'gitlab', label: 'x', secret: 's' });
    expect(unsupported.statusCode).toBe(400);

    const report = await call('GET', `/api/workspaces/${ws.id}/report?preset=last_month`);
    expect(report.json()).toMatchObject({ preset: 'last_month', activities: [] });

    const tooLong = await call('GET', `/api/workspaces/${ws.id}/report?preset=custom&from=2024-01-01&to=2025-06-01`);
    expect(tooLong.statusCode).toBe(400);

    const badToken = await call('POST', `/api/workspaces/${ws.id}/connections`, { provider: 'github', label: 'x', secret: 'nope' });
    expect(badToken.statusCode).toBe(400);
    expect(badToken.json().message).toBe('Could not connect to GitHub: Bad credentials: check the token');

    const tested = await call('POST', `/api/workspaces/${ws.id}/connections/${conn.json().id}/test`);
    expect(tested.json()).toEqual({ ok: true, account: 'octocat' });

    const sync = (await call('POST', `/api/workspaces/${ws.id}/sync`)).json();
    expect(sync).toEqual([expect.objectContaining({ provider: 'github', status: 'ok', imported: 1 })]);
    const resync = (await call('POST', `/api/workspaces/${ws.id}/sync`)).json();
    expect(resync).toEqual([expect.objectContaining({ imported: 0 })]);

    const synced = (await call('GET', `/api/workspaces/${ws.id}/report`)).json();
    expect(synced.totals).toEqual({ commit: 1 });
  });

  it('logs out', async () => {
    expect((await call('POST', '/api/auth/logout')).statusCode).toBe(204);
    expect((await call('GET', '/api/workspaces')).statusCode).toBe(401);
  });
});
