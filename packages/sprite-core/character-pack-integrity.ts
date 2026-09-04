import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import type { CharacterPackSignature } from './character-service';

export type CharacterPackDigestVerificationStatus = 'missing' | 'unsupported' | 'verified' | 'mismatch' | 'error';

export interface CharacterPackDigestVerification {
  status: CharacterPackDigestVerificationStatus;
  declared?: string;
  actual?: string;
  error?: string;
}

const PACK_DIGEST_VERSION = 'chobits-character-pack-digest-v1';
const PACK_MANIFEST_FILE_NAME = 'pack.json';

function toPackRelativePath(rootDir: string, entryPath: string): string {
  return path.relative(rootDir, entryPath).split(path.sep).join('/');
}

function parseDeclaredSha256Digest(signature: CharacterPackSignature | undefined): string | null {
  const declared = signature?.digest?.trim();
  if (!declared) {
    return null;
  }

  const prefixed = declared.match(/^sha256:([a-f0-9]{64})$/i);
  if (prefixed) {
    return prefixed[1].toLowerCase();
  }

  const algorithm = signature?.algorithm?.trim().toLowerCase();
  if ((algorithm === 'sha256' || !algorithm) && /^[a-f0-9]{64}$/i.test(declared)) {
    return declared.toLowerCase();
  }

  return null;
}

async function collectPackDigestFiles(rootDir: string): Promise<string[]> {
  const normalizedRootDir = path.resolve(rootDir);
  const files: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = (await fsp.readdir(currentDir, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (entry.name === '__MACOSX') continue;

      const entryPath = path.join(currentDir, entry.name);
      const relativePath = toPackRelativePath(normalizedRootDir, entryPath);
      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }

      if (entry.isFile() && relativePath !== PACK_MANIFEST_FILE_NAME) {
        files.push(entryPath);
      }
    }
  }

  await walk(normalizedRootDir);
  return files.sort((left, right) => toPackRelativePath(normalizedRootDir, left).localeCompare(toPackRelativePath(normalizedRootDir, right)));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function assessCharacterPackDigest(
  signature: CharacterPackSignature | undefined,
  options?: {
    actualDigest?: string;
    error?: unknown;
  }
): CharacterPackDigestVerification {
  const declaredRaw = signature?.digest?.trim();
  if (!declaredRaw) {
    return { status: 'missing' };
  }

  const declared = parseDeclaredSha256Digest(signature);
  if (!declared) {
    return {
      status: 'unsupported',
      declared: declaredRaw
    };
  }

  if (options?.error) {
    return {
      status: 'error',
      declared,
      error: getErrorMessage(options.error)
    };
  }

  if (!options?.actualDigest) {
    return {
      status: 'error',
      declared,
      error: 'payload digest unavailable'
    };
  }

  if (options.actualDigest === declared) {
    return {
      status: 'verified',
      declared,
      actual: options.actualDigest
    };
  }

  return {
    status: 'mismatch',
    declared,
    actual: options.actualDigest
  };
}

function updateHashWithFile(hash: ReturnType<typeof createHash>, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const input = fs.createReadStream(filePath);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('error', reject);
    input.on('end', resolve);
  });
}

export async function calculateCharacterPackPayloadDigest(rootDir: string): Promise<string> {
  const normalizedRootDir = path.resolve(rootDir);
  const hash = createHash('sha256');
  hash.update(PACK_DIGEST_VERSION);
  hash.update('\0');

  const files = await collectPackDigestFiles(normalizedRootDir);
  for (const filePath of files) {
    const stat = await fsp.stat(filePath);
    hash.update(toPackRelativePath(normalizedRootDir, filePath));
    hash.update('\0');
    hash.update(String(stat.size));
    hash.update('\0');
    await updateHashWithFile(hash, filePath);
    hash.update('\0');
  }

  return hash.digest('hex');
}
