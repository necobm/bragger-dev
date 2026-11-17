import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import fs from 'node:fs';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

/**
 * Encrypts integration secrets (tokens, API keys) at rest. The key lives next to the
 * database with 0600 permissions, so a copied/leaked DB file alone does not expose tokens.
 */
export class SecretBox {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('SecretBox key must be 32 bytes');
  }

  static loadOrCreate(keyPath: string): SecretBox {
    try {
      return new SecretBox(fs.readFileSync(keyPath));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      const key = randomBytes(32);
      fs.writeFileSync(keyPath, key, { mode: 0o600, flag: 'wx' });
      return new SecretBox(key);
    }
  }

  seal(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [VERSION, iv, cipher.getAuthTag(), data].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join(':');
  }

  open(sealed: string): string {
    const [version, iv, tag, data] = sealed.split(':');
    if (version !== VERSION || !iv || !tag || data === undefined) throw new Error('Unsupported secret format');
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  }
}
