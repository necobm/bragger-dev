import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const APP_NAME = 'bragger-dev';

export interface AppConfig {
  isDev: boolean;
  /** Always loopback: the app is single-user and must never be reachable from the network. */
  host: '127.0.0.1';
  /** 0 = pick a free port; the chosen one is published in `runtimeFile`. */
  port: number;
  /** OS user that owns this installation; their password unlocks the app. */
  osUser: string;
  dataDir: string;
  dbPath: string;
  secretKeyPath: string;
  runtimeDir: string;
  /** JSON file with `{ port, pid }`, read by bin/bragger.sh. */
  runtimeFile: string;
  /**
   * Identifies the current OS login session. App sessions created under a different
   * OS session (after logout or reboot) are rejected.
   */
  osSessionKey: string;
  /** Built web UI, if present. */
  webDir: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const home = os.homedir();
  const dataDir = path.resolve(env.BRAGGER_DATA_DIR || path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), APP_NAME));
  const xdgRuntime = env.XDG_RUNTIME_DIR;
  const runtimeDir = xdgRuntime ? path.join(xdgRuntime, APP_NAME) : path.join(dataDir, 'run');

  for (const dir of [dataDir, runtimeDir]) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  return {
    isDev: env.BRAGGER_DEV === '1',
    host: '127.0.0.1',
    port: Number(env.BRAGGER_PORT ?? 0),
    osUser: os.userInfo().username,
    dataDir,
    dbPath: path.join(dataDir, 'bragger.db'),
    secretKeyPath: path.join(dataDir, 'secret.key'),
    runtimeDir,
    runtimeFile: path.join(runtimeDir, 'server.json'),
    osSessionKey: resolveOsSessionKey(xdgRuntime ? runtimeDir : null),
    webDir: path.resolve(import.meta.dirname, '..', 'web'),
  };
}

/**
 * $XDG_RUNTIME_DIR (/run/user/<uid>) is created by systemd-logind at login and removed when
 * the user's last session ends (or on reboot). A random marker stored there therefore lives
 * exactly as long as the OS login session. Without a runtime dir we fall back to the boot id,
 * which at least invalidates sessions on reboot.
 */
function resolveOsSessionKey(runtimeDir: string | null): string {
  if (runtimeDir) {
    const marker = path.join(runtimeDir, 'os-session-id');
    try {
      return fs.readFileSync(marker, 'utf8').trim();
    } catch {
      const id = randomUUID();
      fs.writeFileSync(marker, id, { mode: 0o600 });
      return id;
    }
  }
  try {
    return `boot:${fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()}`;
  } catch {
    return 'boot:unknown';
  }
}
