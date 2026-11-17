/**
 * Catalog of supported integrations. Shared by the server (validation) and the UI (forms).
 *
 * To add a provider: add an entry here (the UI form and API validation pick it up automatically),
 * then register its collector in src/server/integrations/registry.ts — the compiler enforces it.
 * `baseUrl` and `username` cover vendors that need a self-hosted URL or an account e-mail
 * (e.g. GitLab, Confluence, Bitbucket).
 */

export type ConnectionCategory = 'repository' | 'collaboration';
export type AuthType = 'personal_access_token' | 'api_key';

export interface ProviderDefinition {
  id: string;
  name: string;
  category: ConnectionCategory;
  authType: AuthType;
  secretLabel: string;
  /** Base URL is needed for self-hosted / per-tenant instances. */
  baseUrl: { required: boolean; default?: string; placeholder: string } | null;
  /** Some vendors pair the token with an account identifier (e.g. Atlassian e-mail). */
  username: { label: string } | null;
  /** What the optional scope list filters on (repositories, spaces, channels...). */
  scopeHint: string;
}

export const PROVIDERS = {
  github: {
    id: 'github',
    name: 'GitHub',
    category: 'repository',
    authType: 'personal_access_token',
    secretLabel: 'Personal access token',
    baseUrl: { required: false, default: 'https://api.github.com', placeholder: 'https://github.example.com/api/v3' },
    username: null,
    scopeHint: 'Repositories as owner/name. Empty = every repository the token can access.',
  },
  notion: {
    id: 'notion',
    name: 'Notion',
    category: 'collaboration',
    authType: 'api_key',
    secretLabel: 'Integration secret',
    baseUrl: null,
    username: null,
    scopeHint: 'Not used for Notion: the integration only sees pages shared with it.',
  },
} as const satisfies Record<string, ProviderDefinition>;

export type ProviderId = keyof typeof PROVIDERS;

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && Object.hasOwn(PROVIDERS, value);
}

export function getProvider(id: ProviderId): ProviderDefinition {
  return PROVIDERS[id];
}

/** Normalized activity kinds produced by every collector. */
export const ACTIVITY_KINDS = [
  'commit',
  'pull_request_authored',
  'pull_request_reviewed',
  'content_authored',
  'content_edited',
  'comment',
  'message',
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  commit: 'Commits',
  pull_request_authored: 'Pull requests authored',
  pull_request_reviewed: 'Pull requests reviewed',
  content_authored: 'Content authored',
  content_edited: 'Content edited',
  comment: 'Comments',
  message: 'Messages',
};
