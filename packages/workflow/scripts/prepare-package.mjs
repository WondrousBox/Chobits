import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const steps = [
  [fileURLToPath(new URL('./check-release.mjs', import.meta.url)), []],
  [fileURLToPath(new URL('./check-public-boundary.mjs', import.meta.url)), []],
  [fileURLToPath(new URL('./run-tsc.mjs', import.meta.url)), ['-p', fileURLToPath(new URL('../tsconfig.build.json', import.meta.url))]],
  [fileURLToPath(new URL('./check-release.mjs', import.meta.url)), ['--dist']]
];

for (const [script, args] of steps) {
  const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
