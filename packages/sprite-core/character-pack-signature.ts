import { createPublicKey, verify as cryptoVerify } from 'node:crypto';
import fsp from 'node:fs/promises';

import type { CharacterPackDefinition } from './character-service';

export type CharacterPackTrustedKeyAlgorithm = 'ed25519';

export interface CharacterPackTrustedKey {
  keyId: string;
  algorithm: CharacterPackTrustedKeyAlgorithm;
  publicKeyPem: string;
  publishers?: string[];
  channels?: string[];
}

export interface CharacterPackTrustedKeyRevocation {
  keyId: string;
  reason?: string;
}

export interface CharacterPackTrustRoot {
  version: 1;
  keys: CharacterPackTrustedKey[];
  revocations?: CharacterPackTrustedKeyRevocation[];
}

export type CharacterPackSignatureVerificationStatus = 'missing' | 'unsupported' | 'untrusted' | 'revoked' | 'verified' | 'mismatch' | 'error';

export interface CharacterPackSignatureVerification {
  status: CharacterPackSignatureVerificationStatus;
  keyId?: string;
  trustedKeyId?: string;
  algorithm?: string;
  actualDigest?: string;
  reason?: string;
  error?: string;
}

const PACK_SIGNATURE_PAYLOAD_VERSION = 'chobits-character-pack-signature-v1';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeStringList(value: unknown): string[] | undefined {
  const values = Array.isArray(value) ? value.map((entry) => normalizeOptionalString(entry)).filter((entry): entry is string => !!entry) : [];

  return values.length > 0 ? values : undefined;
}

function normalizeTrustedKeyAlgorithm(value: unknown): CharacterPackTrustedKeyAlgorithm | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === 'ed25519' ? 'ed25519' : null;
}

function normalizeTrustedKey(value: unknown): CharacterPackTrustedKey | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const keyId = normalizeOptionalString(value.keyId);
  const algorithm = normalizeTrustedKeyAlgorithm(value.algorithm);
  const publicKeyPem = normalizeOptionalString(value.publicKeyPem);
  if (!keyId || !algorithm || !publicKeyPem) {
    return null;
  }

  return {
    keyId,
    algorithm,
    publicKeyPem,
    ...(normalizeStringList(value.publishers) ? { publishers: normalizeStringList(value.publishers) } : {}),
    ...(normalizeStringList(value.channels) ? { channels: normalizeStringList(value.channels) } : {})
  };
}

function normalizeTrustedKeyRevocation(value: unknown): CharacterPackTrustedKeyRevocation | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const keyId = normalizeOptionalString(value.keyId);
  if (!keyId) {
    return null;
  }

  return {
    keyId,
    ...(normalizeOptionalString(value.reason) ? { reason: normalizeOptionalString(value.reason) } : {})
  };
}

function stableStringify(value: unknown): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'boolean':
    case 'number':
      return JSON.stringify(value);
    case 'string':
      return JSON.stringify(value);
    case 'object':
      if (Array.isArray(value)) {
        return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
      }

      return `{${Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
        .join(',')}}`;
    default:
      return 'null';
  }
}

function stripSignatureValue(pack: CharacterPackDefinition): CharacterPackDefinition {
  const signature = pack.signature ? { ...pack.signature } : undefined;
  if (signature) {
    delete signature.value;
  }

  return {
    ...pack,
    ...(signature ? { signature } : {})
  };
}

function normalizePayloadDigest(payloadDigest: string): string {
  const normalized = payloadDigest.trim();
  return normalized.startsWith('sha256:') ? normalized : `sha256:${normalized}`;
}

function parseSignatureValue(value: string): Buffer | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const prefixedHex = normalized.match(/^hex:([a-f0-9]+)$/i);
  if (prefixedHex) {
    return Buffer.from(prefixedHex[1], 'hex');
  }

  const prefixedBase64 = normalized.match(/^base64:(.+)$/i);
  if (prefixedBase64) {
    return Buffer.from(prefixedBase64[1], 'base64');
  }

  if (/^[a-f0-9]+$/i.test(normalized) && normalized.length % 2 === 0) {
    return Buffer.from(normalized, 'hex');
  }

  const base64Value = normalized.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return Buffer.from(base64Value, 'base64');
  } catch {
    return null;
  }
}

function resolveTrustedKey(pack: CharacterPackDefinition, trustedKey: CharacterPackTrustedKey): { ok: boolean; reason?: string } {
  const publisher = pack.provenance?.publisher?.trim();
  if (trustedKey.publishers?.length && (!publisher || !trustedKey.publishers.includes(publisher))) {
    return {
      ok: false,
      reason: publisher ? `publisher '${publisher}' is not allowed for key ${trustedKey.keyId}` : `publisher is required for key ${trustedKey.keyId}`
    };
  }

  const channel = pack.provenance?.channel?.trim();
  if (trustedKey.channels?.length && (!channel || !trustedKey.channels.includes(channel))) {
    return {
      ok: false,
      reason: channel ? `channel '${channel}' is not allowed for key ${trustedKey.keyId}` : `channel is required for key ${trustedKey.keyId}`
    };
  }

  return { ok: true };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createCharacterPackSignaturePayload(pack: CharacterPackDefinition, payloadDigest: string): string {
  return stableStringify({
    version: PACK_SIGNATURE_PAYLOAD_VERSION,
    payloadDigest: normalizePayloadDigest(payloadDigest),
    manifest: stripSignatureValue(pack)
  });
}

export async function loadCharacterPackTrustRoot(trustRootPath: string): Promise<CharacterPackTrustRoot | null> {
  try {
    const raw = JSON.parse(await fsp.readFile(trustRootPath, 'utf-8'));
    if (!isPlainObject(raw)) {
      return null;
    }

    const keys = Array.isArray(raw.keys) ? raw.keys.map((entry) => normalizeTrustedKey(entry)).filter((entry): entry is CharacterPackTrustedKey => !!entry) : [];
    const revocations = Array.isArray(raw.revocations)
      ? raw.revocations.map((entry) => normalizeTrustedKeyRevocation(entry)).filter((entry): entry is CharacterPackTrustedKeyRevocation => !!entry)
      : [];

    if (keys.length === 0 && revocations.length === 0) {
      return null;
    }

    return {
      version: 1,
      keys,
      ...(revocations.length > 0 ? { revocations } : {})
    };
  } catch {
    return null;
  }
}

export function verifyCharacterPackSignature(options: {
  pack: CharacterPackDefinition;
  trustRoot: CharacterPackTrustRoot | null;
  payloadDigest?: string;
  payloadDigestError?: unknown;
}): CharacterPackSignatureVerification {
  const signature = options.pack.signature;
  const keyId = signature?.keyId?.trim();
  const value = signature?.value?.trim();
  const algorithm = signature?.algorithm?.trim().toLowerCase();

  if (!value) {
    return {
      status: 'missing',
      ...(keyId ? { keyId } : {}),
      ...(algorithm ? { algorithm } : {})
    };
  }

  if (!keyId) {
    return {
      status: 'unsupported',
      ...(algorithm ? { algorithm } : {}),
      reason: 'signature.keyId is required when signature.value is declared'
    };
  }

  if (options.payloadDigestError) {
    return {
      status: 'error',
      keyId,
      ...(algorithm ? { algorithm } : {}),
      error: getErrorMessage(options.payloadDigestError)
    };
  }

  if (!options.payloadDigest) {
    return {
      status: 'error',
      keyId,
      ...(algorithm ? { algorithm } : {}),
      error: 'payload digest unavailable'
    };
  }

  const actualDigest = normalizePayloadDigest(options.payloadDigest);
  const revokedKey = options.trustRoot?.revocations?.find((entry) => entry.keyId === keyId);
  if (revokedKey) {
    return {
      status: 'revoked',
      keyId,
      trustedKeyId: revokedKey.keyId,
      ...(algorithm ? { algorithm } : {}),
      actualDigest,
      reason: revokedKey.reason ?? `key '${keyId}' has been revoked by the current trust root`
    };
  }

  const trustedKey = options.trustRoot?.keys.find((entry) => entry.keyId === keyId);
  if (!trustedKey) {
    return {
      status: 'untrusted',
      keyId,
      ...(algorithm ? { algorithm } : {}),
      actualDigest,
      reason: `key '${keyId}' is not present in the current trust root`
    };
  }

  const resolvedAlgorithm = algorithm || trustedKey.algorithm;
  if (resolvedAlgorithm !== trustedKey.algorithm || resolvedAlgorithm !== 'ed25519') {
    return {
      status: 'unsupported',
      keyId,
      trustedKeyId: trustedKey.keyId,
      algorithm: resolvedAlgorithm,
      actualDigest,
      reason: `signature algorithm '${resolvedAlgorithm}' is not supported for trusted key '${trustedKey.keyId}'`
    };
  }

  const trustConstraint = resolveTrustedKey(options.pack, trustedKey);
  if (!trustConstraint.ok) {
    return {
      status: 'untrusted',
      keyId,
      trustedKeyId: trustedKey.keyId,
      algorithm: resolvedAlgorithm,
      actualDigest,
      reason: trustConstraint.reason
    };
  }

  const signatureBytes = parseSignatureValue(value);
  if (!signatureBytes || signatureBytes.length === 0) {
    return {
      status: 'unsupported',
      keyId,
      trustedKeyId: trustedKey.keyId,
      algorithm: resolvedAlgorithm,
      actualDigest,
      reason: 'signature.value is not a supported base64 or hex payload'
    };
  }

  try {
    const payload = createCharacterPackSignaturePayload(options.pack, options.payloadDigest);
    const valid = cryptoVerify(null, Buffer.from(payload, 'utf-8'), createPublicKey(trustedKey.publicKeyPem), signatureBytes);

    return valid
      ? {
          status: 'verified',
          keyId,
          trustedKeyId: trustedKey.keyId,
          algorithm: resolvedAlgorithm,
          actualDigest
        }
      : {
          status: 'mismatch',
          keyId,
          trustedKeyId: trustedKey.keyId,
          algorithm: resolvedAlgorithm,
          actualDigest,
          reason: 'signature.value does not match the signed pack payload'
        };
  } catch (error) {
    return {
      status: 'error',
      keyId,
      trustedKeyId: trustedKey.keyId,
      algorithm: resolvedAlgorithm,
      actualDigest,
      error: getErrorMessage(error)
    };
  }
}
