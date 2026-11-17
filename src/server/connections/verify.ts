import type { ConnectionTestResult, CreateConnectionRequest } from '../../shared/api.js';
import { getProvider } from '../../shared/providers.js';
import { HttpError } from '../http-error.js';
import type { Collectors, ConnectionCredentials } from '../integrations/collector.js';

/** Applies provider defaults and checks provider-specific required fields. */
export function resolveCredentials(input: CreateConnectionRequest): ConnectionCredentials {
  const provider = getProvider(input.provider);
  if (provider.baseUrl?.required && !input.baseUrl) throw HttpError.badRequest(`${provider.name} requires a base URL`);
  if (provider.username && !input.username) throw HttpError.badRequest(`${provider.name} requires ${provider.username.label}`);
  return {
    provider: input.provider,
    baseUrl: input.baseUrl || provider.baseUrl?.default || null,
    username: input.username || null,
    secret: input.secret,
    scope: input.scope ?? [],
  };
}

/** Runs the provider's credential check, if it has one. Never throws. */
export async function testConnection(collectors: Collectors, credentials: ConnectionCredentials): Promise<ConnectionTestResult> {
  const { verify } = collectors[credentials.provider];
  if (!verify) return { ok: true, account: null };
  try {
    const { account } = await verify(credentials);
    return { ok: true, account };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
