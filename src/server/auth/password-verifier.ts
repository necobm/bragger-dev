import { spawn } from 'node:child_process';
import fs from 'node:fs';

export interface PasswordVerifier {
  /** Checks the password of the OS user running the app. */
  verify(password: string): Promise<boolean>;
}

const HELPER_CANDIDATES = ['/usr/sbin/unix_chkpwd', '/sbin/unix_chkpwd'];
/** unix_chkpwd reads at most this many bytes. */
export const MAX_PASSWORD_BYTES = 512;

/**
 * Verifies the current user's password through `unix_chkpwd`, the setgid-shadow helper that
 * pam_unix itself uses for unprivileged processes (e.g. screen lockers). It only checks the
 * password of the invoking user, so no root privileges or native PAM bindings are needed.
 *
 * Protocol: argv = [user, "nullok" | "nonull"], stdin = password + NUL (stdin must not be a TTY),
 * exit code 0 = valid.
 */
export class UnixChkpwdVerifier implements PasswordVerifier {
  private readonly helper: string;

  constructor(private readonly username: string, helper?: string) {
    const found = helper ?? HELPER_CANDIDATES.find((p) => fs.existsSync(p));
    if (!found) throw new Error(`unix_chkpwd not found (looked in ${HELPER_CANDIDATES.join(', ')}). Is pam_unix installed?`);
    this.helper = found;
  }

  verify(password: string): Promise<boolean> {
    if (!password || Buffer.byteLength(password) > MAX_PASSWORD_BYTES) return Promise.resolve(false);

    return new Promise((resolve) => {
      const child = spawn(this.helper, [this.username, 'nonull'], { stdio: ['pipe', 'ignore', 'ignore'] });
      child.on('error', () => resolve(false));
      child.on('close', (code) => resolve(code === 0));
      child.stdin.on('error', () => undefined); // helper may exit before reading everything
      child.stdin.end(Buffer.concat([Buffer.from(password, 'utf8'), Buffer.from([0])]));
    });
  }
}
