import { localToday } from '../../../shared/timeframe.js';
import type { ActivityCollector, CollectedActivity, CollectContext, ConnectionCredentials } from '../collector.js';
import { GitHubApiError, GitHubClient, normalizeGitHubApiUrl, type GitHubClientOptions } from './client.js';

const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

interface GhUser {
  login: string;
}

interface GhIssue {
  number: number;
  title: string;
  html_url: string;
  state: string;
  draft?: boolean;
  created_at: string;
  repository_url: string;
  pull_request?: { merged_at: string | null };
}

interface GhCommitSearchItem {
  sha: string;
  html_url: string;
  commit: { message: string; author: { date: string } | null };
  repository: { full_name: string };
}

interface GhReview {
  id: number;
  state: string;
  html_url: string;
  submitted_at?: string;
  user: { login: string } | null;
}

export interface GitHubCollectorDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

/** "https://api.github.com/repos/owner/name" → "owner/name" */
const repoFromUrl = (url: string) => url.slice(url.indexOf('/repos/') + '/repos/'.length);
const firstLine = (text: string) => text.split('\n', 1)[0]!.trim();

/**
 * GitHub activity of the token's owner:
 * - commits authored (default branches only, the commit search API limitation), merges excluded
 * - pull requests authored (by creation date)
 * - pull requests reviewed: one item per PR per local day with at least one submitted review
 *
 * With an empty scope it covers every repository the token can see; otherwise only the listed
 * `owner/name` repositories.
 */
export function createGitHubCollector(deps: GitHubCollectorDeps = {}): ActivityCollector {
  const now = deps.now ?? (() => new Date());
  const clientFor = (connection: ConnectionCredentials, signal?: AbortSignal) =>
    new GitHubClient({
      apiUrl: normalizeGitHubApiUrl(connection.baseUrl),
      token: connection.secret,
      signal,
      fetch: deps.fetch,
      sleep: deps.sleep,
    } satisfies GitHubClientOptions);

  return {
    async verify(connection, signal) {
      const client = clientFor(connection, signal);
      const user = await client.get<GhUser>('/user');
      for (const repo of connection.scope) {
        if (!REPO_PATTERN.test(repo)) throw new Error(`"${repo}" is not a repository, expected owner/name`);
        try {
          await client.get(`/repos/${repo}`);
        } catch (err) {
          if (err instanceof GitHubApiError && err.status === 404) {
            throw new Error(`Repository ${repo} not found, or not accessible with this token`);
          }
          throw err;
        }
      }
      return { account: user.login };
    },

    async *collect({ connection, since, until, signal }: CollectContext): AsyncGenerator<CollectedActivity> {
      const client = clientFor(connection, signal);
      const { login } = await client.get<GhUser>('/user');
      const inRange = (iso: string | null | undefined) => {
        if (!iso) return false;
        const t = new Date(iso);
        return t >= since && t < until;
      };
      // Multiple repo: qualifiers are not documented as OR'ed, so run one query per repository.
      const scopes = connection.scope.length > 0 ? connection.scope.map((repo) => ` repo:${repo}`) : [''];

      for (const scope of scopes) {
        // Commits
        const commits = client.search<GhCommitSearchItem>(
          'commits',
          (days) => `author:${login} author-date:${days} merge:false${scope}`,
          since,
          until,
        );
        for await (const c of commits) {
          if (!inRange(c.commit.author?.date)) continue;
          const repo = c.repository.full_name;
          yield {
            kind: 'commit',
            externalId: `${repo}@${c.sha}`,
            title: `${repo}: ${firstLine(c.commit.message)}`,
            url: c.html_url,
            occurredAt: new Date(c.commit.author!.date),
            payload: { repo, sha: c.sha },
          };
        }

        // Pull requests authored
        const authored = client.search<GhIssue>('issues', (days) => `type:pr author:${login} created:${days}${scope}`, since, until);
        for await (const pr of authored) {
          if (!inRange(pr.created_at)) continue;
          const repo = repoFromUrl(pr.repository_url);
          yield {
            kind: 'pull_request_authored',
            externalId: `${repo}#${pr.number}`,
            title: `${repo}#${pr.number}: ${pr.title}`,
            url: pr.html_url,
            occurredAt: new Date(pr.created_at),
            payload: { repo, number: pr.number, state: pr.state, draft: pr.draft ?? false, mergedAt: pr.pull_request?.merged_at ?? null },
          };
        }

        // Pull requests reviewed. A review in [since, until) means the PR was updated on or after `since`;
        // the update may be later than `until`, so search up to now and filter the reviews themselves.
        const reviewed = client.search<GhIssue>(
          'issues',
          (days) => `type:pr reviewed-by:${login} -author:${login} updated:${days}${scope}`,
          since,
          new Date(Math.max(now().getTime(), until.getTime())),
        );
        for await (const pr of reviewed) {
          const repo = repoFromUrl(pr.repository_url);
          // Inline-thread replies create one review each; group by local day to count review sessions.
          const byDay = new Map<string, { first: GhReview; states: Set<string> }>();
          for await (const review of client.paginate<GhReview>(`/repos/${repo}/pulls/${pr.number}/reviews`)) {
            if (review.user?.login.toLowerCase() !== login.toLowerCase() || !inRange(review.submitted_at)) continue;
            const day = localToday(new Date(review.submitted_at!));
            const entry = byDay.get(day);
            if (entry) entry.states.add(review.state);
            else byDay.set(day, { first: review, states: new Set([review.state]) });
          }
          for (const [day, { first, states }] of byDay) {
            yield {
              kind: 'pull_request_reviewed',
              externalId: `${repo}#${pr.number}@${day}`,
              title: `${repo}#${pr.number}: ${pr.title}`,
              url: first.html_url,
              occurredAt: new Date(first.submitted_at!),
              payload: { repo, number: pr.number, states: [...states] },
            };
          }
        }
      }
    },
  };
}
