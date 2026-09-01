/* eslint-disable @typescript-eslint/explicit-function-return-type */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const entryFiles = Object.values(manifest.exports)
  .map((entry) => (typeof entry === 'string' ? entry : entry.import))
  .filter((entry) => typeof entry === 'string' && entry.startsWith('./dist/') && entry.endsWith('.js'))
  .map((entry) => path.join(packageRoot, entry.slice('./dist/'.length, -'.js'.length) + '.ts'));
const allowedPackages = new Set(['zod']);
const visited = new Set();
const errors = [];

function relativeToPackage(file) {
  return path.relative(packageRoot, file).split(path.sep).join('/');
}

function isInsidePackage(file) {
  const relative = path.relative(packageRoot, file);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function resolveSourceFile(fromFile, specifier) {
  const resolved = path.resolve(path.dirname(fromFile), specifier);
  const extension = path.extname(resolved);
  const candidates = extension ? [resolved, extension === '.js' ? `${resolved.slice(0, -3)}.ts` : resolved] : [`${resolved}.ts`, path.join(resolved, 'index.ts')];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function visit(file) {
  const normalized = path.normalize(file);
  if (visited.has(normalized)) return;
  visited.add(normalized);

  const source = fs.readFileSync(normalized, 'utf8');
  const imports = ts.preProcessFile(source, true, true).importedFiles.map((entry) => entry.fileName);
  for (const specifier of imports) {
    if (specifier.startsWith('node:')) continue;
    if (!specifier.startsWith('.')) {
      const packageName = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
      if (!allowedPackages.has(packageName)) {
        errors.push(`${relativeToPackage(normalized)} imports disallowed package: ${specifier}`);
      }
      continue;
    }

    const dependency = resolveSourceFile(normalized, specifier);
    if (!dependency) {
      errors.push(`${relativeToPackage(normalized)} has unresolved import: ${specifier}`);
      continue;
    }
    if (!isInsidePackage(dependency)) {
      errors.push(`${relativeToPackage(normalized)} imports outside the package: ${specifier}`);
      continue;
    }
    visit(dependency);
  }
}

for (const entry of entryFiles) visit(entry);

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`workflow public boundary checked: ${visited.size} source files`);
}
