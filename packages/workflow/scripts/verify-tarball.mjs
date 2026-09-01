/* eslint-disable @typescript-eslint/explicit-function-return-type */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

function readString(buffer, start, length) {
  const end = buffer.indexOf(0, start);
  return buffer.toString('utf8', start, end === -1 || end > start + length ? start + length : end);
}

function readTarEntries(tarballPath) {
  const archive = gunzipSync(fs.readFileSync(tarballPath));
  const entries = [];
  let offset = 0;
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = readString(header, 0, 100);
    const prefix = readString(header, 345, 155);
    const fullName = prefix ? `${prefix}/${name}` : name;
    const rawSize = readString(header, 124, 12).trim();
    const size = rawSize ? Number.parseInt(rawSize, 8) : 0;
    const type = readString(header, 156, 1) || '0';
    const contentStart = offset + 512;
    entries.push({ name: fullName, size, type, content: archive.subarray(contentStart, contentStart + size) });
    offset = contentStart + Math.ceil(size / 512) * 512;
  }
  return entries;
}

export function verifyWorkflowTarball(tarballPath) {
  const errors = [];
  const parsedEntries = readTarEntries(tarballPath);
  const files = new Map();
  let totalSize = 0;

  for (const entry of parsedEntries) {
    if (!entry.name.startsWith('package/')) {
      errors.push(`tarball entry is outside package/: ${entry.name}`);
      continue;
    }
    const name = entry.name.slice('package/'.length).replace(/\/$/, '');
    if (!name || entry.type === '5' || entry.type === 'x' || entry.type === 'g') continue;
    if (entry.type !== '0') {
      errors.push(`tarball contains unsupported entry type ${entry.type}: ${name}`);
      continue;
    }
    if (path.posix.isAbsolute(name) || name.split('/').includes('..')) errors.push(`tarball contains an unsafe path: ${name}`);
    if (!(name === 'package.json' || name === 'README.md' || name === 'LICENSE' || name.startsWith('dist/'))) errors.push(`tarball contains a non-publishable path: ${name}`);
    if (/\.(?:db|sqlite|sqlite3|pem|key)$/i.test(name) || /(?:^|\/)\.env(?:\.|$)/.test(name) || /(?:^|\/)(?:node_modules|fixtures|scripts|cache)(?:\/|$)/.test(name))
      errors.push(`tarball contains forbidden content: ${name}`);
    if (name.endsWith('.ts') && !name.endsWith('.d.ts')) errors.push(`tarball contains TypeScript source: ${name}`);
    files.set(name, entry.content);
    totalSize += entry.size;
  }

  if (!files.has('package.json') || !files.has('README.md') || !files.has('LICENSE')) errors.push('tarball must contain package.json, README.md and LICENSE');
  if (files.size > 256) errors.push(`tarball contains too many files: ${files.size}`);
  if (totalSize > 5 * 1024 * 1024) errors.push(`tarball uncompressed size exceeds 5 MiB: ${totalSize}`);

  const packedManifest = files.has('package.json') ? JSON.parse(files.get('package.json').toString('utf8')) : undefined;
  for (const [key, entry] of Object.entries(packedManifest?.exports || {})) {
    if (key === './package.json') continue;
    for (const target of [entry.types, entry.import]) {
      const packedTarget = target.startsWith('./') ? target.slice(2) : target;
      if (!files.has(packedTarget)) errors.push(`tarball is missing ${key} target: ${target}`);
    }
  }

  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log(`workflow tarball checked: ${files.size} files, ${totalSize} uncompressed bytes`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const tarballPath = process.argv[2];
  if (!tarballPath) throw new Error('tarball path is required');
  verifyWorkflowTarball(path.resolve(tarballPath));
}
