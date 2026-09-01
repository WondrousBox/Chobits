/* eslint-disable @typescript-eslint/explicit-function-return-type */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import ts from 'typescript';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const manifestPath = path.join(packageRoot, 'package.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const checkDist = process.argv.includes('--dist');
const errors = [];
const expectedExports = new Set(['.', './application', './contracts', './core', './node', './nodes', './package.json', './ports', './runtime', './schema', './sdk', './testing']);
const allowedHostInternals = new Set(['resource-project-adapter.ts', 'run-event-coordinator.ts', 'run-history-retention.ts', 'run-persistence-queue.ts', 'task-results.ts']);

function relativeToRepo(file) {
  return path.relative(repoRoot, file).split(path.sep).join('/');
}

function listTypeScriptFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(entryPath);
    return /\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
}

function importedSpecifiers(file) {
  return ts.preProcessFile(fs.readFileSync(file, 'utf8'), true, true).importedFiles.map((entry) => entry.fileName);
}

function resolveTypeScriptImport(fromFile, specifier) {
  const resolved = path.resolve(path.dirname(fromFile), specifier);
  const candidates = path.extname(resolved) ? [resolved, resolved.endsWith('.js') ? `${resolved.slice(0, -3)}.ts` : resolved] : [`${resolved}.ts`, `${resolved}.tsx`, path.join(resolved, 'index.ts')];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function checkManifest() {
  if (manifest.name !== '@chobits/workflow') errors.push('package name must be @chobits/workflow');
  if (!/^0\.1\.\d+$/.test(manifest.version)) errors.push('Phase 10 release line must use a 0.1.x version');
  if (manifest.private === true) errors.push('public workflow package cannot be private');
  if (manifest.type !== 'module') errors.push('package type must be module');
  if (manifest.sideEffects !== false) errors.push('package sideEffects must be false');
  if (manifest.engines?.node !== '>=18') errors.push('package must support Node.js >=18');
  if (manifest.publishConfig?.access !== 'public') errors.push('scoped package publish access must be public');
  if (manifest.main !== './dist/src/index.js' || manifest.types !== './dist/src/index.d.ts') errors.push('main/types must target the root ESM export');
  if (JSON.stringify(manifest.files) !== JSON.stringify(['dist', 'README.md', 'LICENSE'])) errors.push('package files must only include dist, README.md and LICENSE');

  const actualExports = new Set(Object.keys(manifest.exports || {}));
  for (const key of expectedExports) if (!actualExports.has(key)) errors.push(`missing public export: ${key}`);
  for (const key of actualExports) if (!expectedExports.has(key)) errors.push(`undeclared public export policy entry: ${key}`);

  for (const [key, entry] of Object.entries(manifest.exports || {})) {
    if (key === './package.json') {
      if (entry !== './package.json') errors.push('./package.json export must target ./package.json');
      continue;
    }
    if (!entry || typeof entry !== 'object' || typeof entry.types !== 'string' || typeof entry.import !== 'string') {
      errors.push(`${key} must declare types and import targets`);
      continue;
    }
    if (!entry.types.startsWith('./dist/') || !entry.types.endsWith('.d.ts')) errors.push(`${key} types target must be a declaration under dist`);
    if (!entry.import.startsWith('./dist/') || !entry.import.endsWith('.js')) errors.push(`${key} import target must be ESM JavaScript under dist`);
    const sourceEntry = path.join(packageRoot, entry.import.slice('./dist/'.length, -'.js'.length) + '.ts');
    if (!fs.existsSync(sourceEntry)) errors.push(`${key} has no source entry: ${path.relative(packageRoot, sourceEntry)}`);
  }

  const dependencyNames = Object.keys(manifest.dependencies || {}).sort();
  if (JSON.stringify(dependencyNames) !== JSON.stringify(['@types/node', 'zod'])) errors.push('runtime/type dependencies must be limited to @types/node and zod');
}

function checkProductionImports() {
  for (const sourcePath of listTypeScriptFiles(path.join(repoRoot, 'src'))) {
    for (const specifier of importedSpecifiers(sourcePath)) {
      if (specifier === '@packages/workflow' || specifier.startsWith('@packages/workflow/')) {
        errors.push(`${relativeToRepo(sourcePath)} imports workflow through the repository alias: ${specifier}`);
      }
    }
  }

  for (const sourcePath of listTypeScriptFiles(path.join(repoRoot, 'electron', 'main', 'workflow'))) {
    for (const specifier of importedSpecifiers(sourcePath)) {
      if (specifier === '@packages/workflow' || specifier.startsWith('@packages/workflow/')) {
        errors.push(`${relativeToRepo(sourcePath)} imports workflow through the repository alias: ${specifier}`);
        continue;
      }
      if (!specifier.startsWith('.')) continue;
      const dependency = resolveTypeScriptImport(sourcePath, specifier);
      if (!dependency) continue;
      const relativeDependency = path.relative(packageRoot, dependency);
      const isPublicPackageSource = relativeDependency !== '..' && !relativeDependency.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeDependency);
      if (!isPublicPackageSource) continue;
      const isAllowedHostInternal = path.dirname(dependency) === packageRoot && allowedHostInternals.has(path.basename(dependency));
      if (!isAllowedHostInternal) {
        errors.push(`${relativeToRepo(sourcePath)} bypasses public workflow exports: ${specifier}`);
      }
    }
  }
}

async function checkDistribution() {
  const importTargets = [];
  for (const [key, entry] of Object.entries(manifest.exports)) {
    if (key === './package.json') continue;
    for (const target of [entry.types, entry.import]) {
      const absoluteTarget = path.join(packageRoot, target.slice(2));
      if (!fs.existsSync(absoluteTarget)) errors.push(`${key} target is missing after build: ${target}`);
    }
    importTargets.push([key, path.join(packageRoot, entry.import.slice(2))]);
  }

  for (const mapPath of listFiles(path.join(packageRoot, 'dist')).filter((file) => file.endsWith('.map'))) {
    const sourceMap = fs.readFileSync(mapPath, 'utf8');
    if (/\/(?:Users|home)\//.test(sourceMap)) errors.push(`source map contains an absolute user path: ${path.relative(packageRoot, mapPath)}`);
  }

  for (const [key, target] of importTargets) {
    try {
      await import(`${pathToFileURL(target).href}?release-check=${Date.now()}`);
    } catch (error) {
      errors.push(`${key} ESM import failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

checkManifest();
checkProductionImports();
if (checkDist) await checkDistribution();

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`workflow release boundary checked: ${expectedExports.size} exports${checkDist ? ', ESM and declarations verified' : ''}`);
}
