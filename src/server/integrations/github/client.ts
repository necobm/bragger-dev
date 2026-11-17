/**
 * Minimal GitHub REST client: auth headers, timeouts, rate-limit retries, pagination and
 * date-windowed search (the search API caps every query at 1000 results).
 */

export const GITHUB_API_URL = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
/** Longer rate-limit waits fail the sync instead of blocking it. */
const MAX_RETRY_WAIT_MS = 65_000;
const PAGE_SIZE = 100;
const SEARCH_RESULT_LIMIT = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface GitHubClientOptions {
  /** REST API root, e.g. https://api.github.com or https://ghe.example.com/api/v3 */
  apiUrl: string;
  token: string;
  signal?: AbortSignal;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

interface SearchPage<T> {
  total_count: number;
  incomplete_results: boolean;
  items: T[];
}

/**
 * Accepts what users paste (github.com, the API root, a GHE host with or without /api/v3)
 * and returns the REST API root.
 */
export function normalizeGitHubApiUrl(baseUrl: string | null): string {
  if (!baseUrl) return GITHUB_API_URL;
  const url = new URL(baseUrl);
  if (url.hostname === 'github.com' || url.hostname === 'api.github.com') return GITHUB_API_URL;
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path.endsWith('/api/v3') ? path : `${path}/api/v3`}`;
}

/** Search date qualifier value for whole days: the day containing `since` through the day containing `until`. */
export function searchDayRange(since: Date, until: Date): string {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return `${day(since)}..${day(new Date(until.getTime() - 1))}`;
}

export class GitHubClient {
  private readonly apiUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: GitHubClientOptions) {
    this.apiUrl = options.apiUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetch ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async get<T>(path: string, query: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(`${this.apiUrl}${path}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));

    for (let attempt = 0; ; attempt++) {
      const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const res = await this.fetchImpl(url, {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${this.options.token}`,
          'user-agent': 'bragger-dev',
          'x-github-api-version': API_VERSION,
        },
        signal: this.options.signal ? AbortSignal.any([this.options.signal, timeout]) : timeout,
      });
      if (res.ok) return (await res.json()) as T;

      const wait = retryDelay(res);
      if (wait !== null && wait <= MAX_RETRY_WAIT_MS && attempt < MAX_RETRIES) {
        await res.body?.cancel();
        await this.sleep(wait);
        continue;
      }
      throw await toApiError(res, wait);
    }
  }

  /** Iterates every item of a paginated list endpoint. */
  async *paginate<T>(path: string, query: Record<string, string | number> = {}): AsyncGenerator<T> {
    for (let page = 1; ; page++) {
      const items = await this.get<T[]>(path, { ...query, per_page: PAGE_SIZE, page });
      yield* items;
      if (items.length < PAGE_SIZE) return;
    }
  }

  /**
   * Runs a search over [since, until). `buildQuery` receives a date qualifier value
   * (YYYY-MM-DD..YYYY-MM-DD, whole UTC days). When a window has more results than the API returns,
   * it is split in halves by day. Callers must filter items by exact timestamp, since windows are whole days.
   */
  async *search<T>(
    kind: 'issues' | 'commits',
    buildQuery: (dateRange: string) => string,
    since: Date,
    until: Date,
  ): AsyncGenerator<T> {
    const q = buildQuery(searchDayRange(since, until));
    const first = await this.searchPage<T>(kind, q, 1);

    const days = Math.ceil((until.getTime() - since.getTime()) / DAY_MS);
    if (first.total_count > SEARCH_RESULT_LIMIT && days > 1) {
      const mid = startOfUtcDay(new Date(since.getTime() + Math.floor(days / 2) * DAY_MS));
      yield* this.search<T>(kind, buildQuery, since, mid);
      yield* this.search<T>(kind, buildQuery, mid, until);
      return;
    }

    yield* first.items;
    const total = Math.min(first.total_count, SEARCH_RESULT_LIMIT);
    let seen = first.items.length;
    for (let page = 2; seen < total; page++) {
      const next = await this.searchPage<T>(kind, q, page);
      if (next.items.length === 0) break;
      yield* next.items;
      seen += next.items.length;
    }
  }

  private searchPage<T>(kind: 'issues' | 'commits', q: string, page: number) {
    return this.get<SearchPage<T>>(`/search/${kind}`, { q, per_page: PAGE_SIZE, page });
  }
}

const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** Milliseconds to wait before retrying a rate-limited request, or null if it is not rate limited. */
function retryDelay(res: Response): number | null {
  if (res.status !== 403 && res.status !== 429) return null;
  const retryAfter = res.headers.get('retry-after');
  if (retryAfter) return Number(retryAfter) * 1000;
  if (res.headers.get('x-ratelimit-remaining') === '0') {
    const reset = Number(res.headers.get('x-ratelimit-reset'));
    return Math.max(0, reset * 1000 - Date.now()) + 1000;
  }
  // Secondary rate limits without headers: GitHub asks to wait at least a minute.
  return res.status === 429 ? 60_000 : null;
}

async function toApiError(res: Response, wait: number | null): Promise<GitHubApiError> {
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  const detail = body?.message ?? res.statusText;
  if (res.status === 401) return new GitHubApiError(401, 'Bad credentials: check the token');
  if (wait !== null) {
    return new GitHubApiError(res.status, `GitHub rate limit exceeded, try again in ${Math.ceil(wait / 60_000)} min`);
  }
  return new GitHubApiError(res.status, `GitHub API error ${res.status}: ${detail}`);
}
