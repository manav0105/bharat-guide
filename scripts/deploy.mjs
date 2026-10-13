import { spawnSync } from 'node:child_process';

// Publish to the deployment that already holds the loaded data and Google key.
// Do not silently switch to an empty production deployment or reload documents.
for (const args of [
  ['convex', 'dev', '--once'],
  ['@convex-dev/static-hosting', 'upload', '--build'],
]) {
  const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, {
    stdio: 'inherit', shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
