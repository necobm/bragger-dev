import { describe, expect, it } from 'vitest';
import type { CollectedActivity, ConnectionCredentials } from '../collector.js';
import { createGitHubCollector } from './collector.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const since = new Date('2026-11-02T00:00:00Z');
const until = new Date('2026-11-16T00:00:00Z');

const connection = (scope: string[] = []): ConnectionCredentials => ({
  provider: 'github',
  baseUrl: 'https://api.github.com',
  username: null,
  secret: 'ghp_x',
  scope,
});

/** A tiny fake of the GitHub API, routed by path and search query. */
function fakeGitHub() {
  const requests: string[] = [];
  const fetchImpl = async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const q = url.searchParams.get('q') ?? '';
    requests.push(`${url.pathname}${q ? ` ${q}` : ''}`);

    if (url.pathname === '/user') return json({ login: 'octocat' });
    if (url.pathname === '/repos/acme/api') return json({ full_name: 'acme/api' });
    if (url.pathname.startsWith('/repos/acme/missing')) return json({ message: 'Not Found' }, 404);

    if (url.pathname === '/search/commits') {
      return json({
        total_count: 2,
        items: [
          {
            sha: 'abc123',
            html_url: 'https://github.com/acme/api/commit/abc123',
            commit: { message: 'Fix login\n\nDetails', author: { date: '2026-11-05T10:00:00Z' } },
            repository: { full_name: 'acme/api' },
          },
          {
            // same UTC search day as `until`'s previous day boundary but outside the exact range
            sha: 'old999',
            html_url: 'https://github.com/acme/api/commit/old999',
            commit: { message: 'Too old', author: { date: '2026-11-01T23:00:00Z' } },
            repository: { full_name: 'acme/api' },
          },
        ],
      });
    }

    if (url.pathname === '/search/issues' && q.includes('author:octocat created:')) {
      return json({
        total_count: 1,
        items: [
          {
            number: 7,
            title: 'Add SSO',
            html_url: 'https://github.com/acme/api/pull/7',
            state: 'closed',
            created_at: '2026-11-03T09:00:00Z',
            repository_url: 'https://api.github.com/repos/acme/api',
            pull_request: { merged_at: '2026-11-04T09:00:00Z' },
          },
        ],
      });
    }

    if (url.pathname === '/search/issues' && q.includes('reviewed-by:octocat')) {
      return json({
        total_count: 1,
        items: [
          {
            number: 9,
            title: 'Refactor billing',
            html_url: 'https://github.com/acme/web/pull/9',
            state: 'open',
            created_at: '2026-10-20T09:00:00Z',
            repository_url: 'https://api.github.com/repos/acme/web',
          },
        ],
      });
    }

    if (url.pathname === '/repos/acme/web/pulls/9/reviews') {
      const review = (id: number, login: string, state: string, at?: string) => ({
        id,
        state,
        html_url: `https://github.com/acme/web/pull/9#review-${id}`,
        submitted_at: at,
        user: { login },
      });
      return json([
        review(1, 'octocat', 'COMMENTED', '2026-11-10T12:00:00Z'),
        review(2, 'octocat', 'APPROVED', '2026-11-10T12:30:00Z'), // same day → merged with #1
        review(3, 'someone-else', 'APPROVED', '2026-11-11T12:00:00Z'),
        review(4, 'OctoCat', 'CHANGES_REQUESTED', '2026-11-12T12:00:00Z'),
        review(5, 'octocat', 'COMMENTED', '2026-10-01T12:00:00Z'), // outside range
        review(6, 'octocat', 'PENDING'), // not submitted
      ]);
    }

    return json({ message: `unexpected ${url.pathname}` }, 500);
  };
  return { requests, fetch: fetchImpl as typeof fetch };
}

const collectAll = async (iterable: AsyncIterable<CollectedActivity>) => {
  const out: CollectedActivity[] = [];
  for await (const a of iterable) out.push(a);
  return out;
};

describe('GitHub collector', () => {
  it('collects commits, authored PRs and reviews in the range', async () => {
    const gh = fakeGitHub();
    const collector = createGitHubCollector({ fetch: gh.fetch, now: () => new Date('2026-11-17T00:00:00Z') });
    const items = await collectAll(collector.collect({ connection: connection(), since, until }));

    expect(items.map((i) => [i.kind, i.title])).toEqual([
      ['commit', 'acme/api: Fix login'],
      ['pull_request_authored', 'acme/api#7: Add SSO'],
      ['pull_request_reviewed', 'acme/web#9: Refactor billing'],
      ['pull_request_reviewed', 'acme/web#9: Refactor billing'],
    ]);
    const reviews = items.filter((i) => i.kind === 'pull_request_reviewed');
    expect(reviews.map((r) => r.occurredAt.toISOString())).toEqual(['2026-11-10T12:00:00.000Z', '2026-11-12T12:00:00.000Z']);
    expect(reviews[0]!.payload).toMatchObject({ states: ['COMMENTED', 'APPROVED'] });
    expect(new Set(items.map((i) => i.externalId)).size).toBe(items.length);

    expect(gh.requests).toContain('/search/commits author:octocat author-date:2026-11-02..2026-11-15 merge:false');
    expect(gh.requests).toContain('/search/issues type:pr reviewed-by:octocat -author:octocat updated:2026-11-02..2026-11-16');
  });

  it('runs one query per scoped repository', async () => {
    const gh = fakeGitHub();
    const collector = createGitHubCollector({ fetch: gh.fetch });
    await collectAll(collector.collect({ connection: connection(['acme/api', 'acme/web']), since, until }));
    const commitQueries = gh.requests.filter((r) => r.startsWith('/search/commits'));
    expect(commitQueries).toEqual([
      '/search/commits author:octocat author-date:2026-11-02..2026-11-15 merge:false repo:acme/api',
      '/search/commits author:octocat author-date:2026-11-02..2026-11-15 merge:false repo:acme/web',
    ]);
  });

  describe('verify', () => {
    it('returns the account and checks scoped repositories', async () => {
      const collector = createGitHubCollector({ fetch: fakeGitHub().fetch });
      await expect(collector.verify!(connection(['acme/api']))).resolves.toEqual({ account: 'octocat' });
      await expect(collector.verify!(connection(['acme/missing']))).rejects.toThrow('Repository acme/missing not found');
      await expect(collector.verify!(connection(['not a repo']))).rejects.toThrow('expected owner/name');
    });
  });
});
