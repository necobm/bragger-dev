import { describe, expect, it } from 'vitest';
import { GitHubApiError, GitHubClient, normalizeGitHubApiUrl, searchDayRange } from './client.js';

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

describe('normalizeGitHubApiUrl', () => {
  it.each([
    [null, 'https://api.github.com'],
    ['https://github.com', 'https://api.github.com'],
    ['https://api.github.com/', 'https://api.github.com'],
    ['https://ghe.example.com', 'https://ghe.example.com/api/v3'],
    ['https://ghe.example.com/api/v3/', 'https://ghe.example.com/api/v3'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeGitHubApiUrl(input)).toBe(expected);
  });
});

describe('searchDayRange', () => {
  it('covers whole UTC days of a half-open range', () => {
    expect(searchDayRange(new Date('2026-11-01T00:00:00Z'), new Date('2026-11-15T00:00:00Z'))).toBe('2026-11-01..2026-11-14');
  });
});

describe('GitHubClient', () => {
  it('sends auth headers', async () => {
    let headers: Headers | undefined;
    const client = new GitHubClient({
      apiUrl: 'https://api.github.com',
      token: 'tkn',
      fetch: async (_url, init) => {
        headers = new Headers(init?.headers);
        return json({ login: 'me' });
      },
    });
    await client.get('/user');
    expect(headers?.get('authorization')).toBe('Bearer tkn');
    expect(headers?.get('user-agent')).toBe('bragger-dev');
  });

  it('retries after a rate limit', async () => {
    const waits: number[] = [];
    let calls = 0;
    const client = new GitHubClient({
      apiUrl: 'https://api.github.com',
      token: 't',
      sleep: async (ms) => void waits.push(ms),
      fetch: async () => (++calls === 1 ? json({ message: 'slow down' }, { status: 429, headers: { 'retry-after': '2' } }) : json({ ok: 1 })),
    });
    expect(await client.get('/x')).toEqual({ ok: 1 });
    expect(waits).toEqual([2000]);
  });

  it('reports bad credentials clearly', async () => {
    const client = new GitHubClient({ apiUrl: 'https://api.github.com', token: 't', fetch: async () => json({ message: 'Bad credentials' }, { status: 401 }) });
    await expect(client.get('/user')).rejects.toThrow(new GitHubApiError(401, 'Bad credentials: check the token'));
  });

  it('paginates list endpoints', async () => {
    const client = new GitHubClient({
      apiUrl: 'https://api.github.com',
      token: 't',
      fetch: async (url) => {
        const page = Number(new URL(String(url)).searchParams.get('page'));
        return json(page === 1 ? Array.from({ length: 100 }, (_, i) => i) : [100, 101]);
      },
    });
    const items: number[] = [];
    for await (const i of client.paginate<number>('/list')) items.push(i);
    expect(items).toHaveLength(102);
  });

  it('splits search windows that exceed the 1000 result cap', async () => {
    const queries: string[] = [];
    const client = new GitHubClient({
      apiUrl: 'https://api.github.com',
      token: 't',
      fetch: async (url) => {
        const q = new URL(String(url)).searchParams.get('q')!;
        queries.push(q);
        // The full 4-day window is "too big"; each 2-day half has one result.
        return json(q.endsWith('2026-11-01..2026-11-04') ? { total_count: 1500, items: [] } : { total_count: 1, items: [q] });
      },
    });
    const items: string[] = [];
    const since = new Date('2026-11-01T00:00:00Z');
    const until = new Date('2026-11-05T00:00:00Z');
    for await (const i of client.search<string>('issues', (d) => `x created:${d}`, since, until)) items.push(i);
    expect(items).toEqual(['x created:2026-11-01..2026-11-02', 'x created:2026-11-03..2026-11-04']);
  });
});
