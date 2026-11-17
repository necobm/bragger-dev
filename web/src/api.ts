import type {
  ApiErrorBody,
  Connection,
  ConnectionTestResult,
  CreateConnectionRequest,
  ReportResponse,
  SessionInfo,
  SyncResult,
  Workspace,
} from '../../src/shared/api.js';
import type { DateRange, TimeframePreset } from '../../src/shared/timeframe.js';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Fired when any API call reports the session is gone, so the app can show the login screen. */
export const UNAUTHORIZED_EVENT = 'bragger:unauthorized';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  const data: unknown = res.status === 204 ? undefined : await res.json().catch(() => undefined);
  if (!res.ok) throw new ApiError(res.status, (data as ApiErrorBody | undefined)?.message ?? res.statusText);
  return data as T;
}

export interface TimeframeSelection {
  preset: TimeframePreset;
  custom?: DateRange;
}

const timeframeQuery = ({ preset, custom }: TimeframeSelection) => {
  const params = new URLSearchParams({ preset });
  if (preset === 'custom' && custom) {
    params.set('from', custom.from);
    params.set('to', custom.to);
  }
  return params.toString();
};

export const api = {
  session: () => request<SessionInfo>('GET', '/auth/session'),
  login: (password: string) => request<SessionInfo>('POST', '/auth/login', { password }),
  logout: () => request<void>('POST', '/auth/logout'),

  listWorkspaces: () => request<Workspace[]>('GET', '/workspaces'),
  getWorkspace: (id: number) => request<Workspace>('GET', `/workspaces/${id}`),
  createWorkspace: (name: string) => request<Workspace>('POST', '/workspaces', { name }),
  deleteWorkspace: (id: number) => request<void>('DELETE', `/workspaces/${id}`),

  listConnections: (workspaceId: number) => request<Connection[]>('GET', `/workspaces/${workspaceId}/connections`),
  createConnection: (workspaceId: number, input: CreateConnectionRequest) =>
    request<Connection>('POST', `/workspaces/${workspaceId}/connections`, input),
  testConnection: (workspaceId: number, connectionId: number) =>
    request<ConnectionTestResult>('POST', `/workspaces/${workspaceId}/connections/${connectionId}/test`),
  deleteConnection: (workspaceId: number, connectionId: number) =>
    request<void>('DELETE', `/workspaces/${workspaceId}/connections/${connectionId}`),

  report: (workspaceId: number, tf: TimeframeSelection) =>
    request<ReportResponse>('GET', `/workspaces/${workspaceId}/report?${timeframeQuery(tf)}`),
  sync: (workspaceId: number, tf: TimeframeSelection) =>
    request<SyncResult[]>('POST', `/workspaces/${workspaceId}/sync?${timeframeQuery(tf)}`),
};
