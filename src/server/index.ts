import fs from 'node:fs';
import { buildApp } from './app.js';
import { UnixChkpwdVerifier } from './auth/password-verifier.js';
import { loadConfig } from './config.js';
import { SecretBox } from './crypto/secret-box.js';
import { openDatabase } from './db/index.js';

async function main() {
  const config = loadConfig();
  const db = openDatabase(config.dbPath);
  const secrets = SecretBox.loadOrCreate(config.secretKeyPath);
  const verifier = new UnixChkpwdVerifier(config.osUser);

  const app = await buildApp({ config, db, secrets, verifier });
  await app.listen({ host: config.host, port: config.port });

  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : config.port;
  fs.writeFileSync(config.runtimeFile, JSON.stringify({ port, pid: process.pid }), { mode: 0o600 });
  app.log.info({ url: `http://${config.host}:${port}`, dataDir: config.dataDir }, 'bragger-dev ready');

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    fs.rmSync(config.runtimeFile, { force: true });
    await app.close();
    db.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
