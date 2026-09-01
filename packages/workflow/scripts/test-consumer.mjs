/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyWorkflowTarball } from './verify-tarball.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = path.join(packageRoot, 'fixtures', 'consumer');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-consumer-'));
const packDirectory = path.join(tempRoot, 'pack');
const require = createRequire(import.meta.url);
const tscCli = require.resolve('typescript/lib/tsc.js');

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function runPnpm(args, cwd) {
  const pnpmCli = process.env.npm_execpath;
  if (pnpmCli && path.basename(pnpmCli).includes('pnpm')) {
    run(process.execPath, [pnpmCli, ...args], cwd);
    return;
  }
  run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args, cwd);
}

try {
  fs.mkdirSync(packDirectory, { recursive: true });
  fs.copyFileSync(path.join(fixtureRoot, 'package.json'), path.join(tempRoot, 'package.json'));
  fs.copyFileSync(path.join(fixtureRoot, 'index.mjs'), path.join(tempRoot, 'index.mjs'));
  fs.copyFileSync(path.join(fixtureRoot, 'typecheck.ts'), path.join(tempRoot, 'typecheck.ts'));
  fs.copyFileSync(path.join(fixtureRoot, 'tsconfig.json'), path.join(tempRoot, 'tsconfig.json'));

  runPnpm(['pack', '--pack-destination', packDirectory], packageRoot);
  const tarball = fs.readdirSync(packDirectory).find((file) => file.endsWith('.tgz'));
  if (!tarball) throw new Error('Workflow tarball was not created');
  verifyWorkflowTarball(path.join(packDirectory, tarball));

  runPnpm(['add', '--offline', '--ignore-scripts', path.join(packDirectory, tarball)], tempRoot);
  run(process.execPath, [tscCli, '-p', 'tsconfig.json'], tempRoot);
  run(process.execPath, ['index.mjs'], tempRoot);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
