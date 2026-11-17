/** HTTP API contract shared by server and UI. */
import type { ActivityKind, ConnectionCategory, ProviderId } from './providers.js';
import type { DateRange, TimeframePreset } from './timeframe.js';

export interface ApiErrorBody {
  error: string;
  message: string;
}

export interface SessionInfo {
  authenticated: boolean;
  /** The OS user whose password unlocks the app. */
  user: string;
  expiresAt?: string;
}

export interface LoginRequest {
  password: string;
}

export interface Workspace {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceInput {
  name: string;
}

/** A configured integration. Secrets are never sent back to the UI. */
export interface Connection {
  id: number;
  workspaceId: number;
  category: ConnectionCategory;
  provider: ProviderId;
  label: string;
  baseUrl: string | null;
  username: string | null;
  scope: string[];
  createdAt: string;
  lastSyncedAt: string | null;
}

export interface CreateConnectionRequest {
  provider: ProviderId;
  label: string;
  baseUrl?: string;
  username?: string;
  secret: string;
  scope?: string[];
}

/** Result of checking a connection's credentials. `account` is null when the provider has no check yet. */
export type ConnectionTestResult = { ok: true; account: string | null } | { ok: false; error: string };

export interface Activity {
  id: number;
  connectionId: number;
  provider: ProviderId;
  kind: ActivityKind;
  title: string;
  url: string | null;
  occurredAt: string;
}

export interface ReportResponse {
  preset: TimeframePreset;
  range: DateRange;
  totals: Partial<Record<ActivityKind, number>>;
  activities: Activity[];
}

export interface SyncResult {
  connectionId: number;
  provider: ProviderId;
  status: 'ok' | 'error';
  imported: number;
  error?: string;
}
