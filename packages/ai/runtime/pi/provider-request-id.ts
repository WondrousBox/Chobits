function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function trimOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

const PROVIDER_REQUEST_ID_KEYS = ['providerRequestId', 'provider_request_id', 'requestId', 'request_id', '_request_id', 'responseId', 'response_id'] as const;

export function readProviderRequestId(value: unknown, options?: { includeGenericId?: boolean }): string | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }

  for (const key of PROVIDER_REQUEST_ID_KEYS) {
    const providerRequestId = trimOptionalString(value[key]);
    if (providerRequestId) {
      return providerRequestId;
    }
  }

  if (options?.includeGenericId) {
    return trimOptionalString(value.id);
  }

  return undefined;
}

export function extractPiProviderRequestId(message: unknown): string | undefined {
  if (!isPlainRecord(message)) {
    return undefined;
  }

  const direct = readProviderRequestId(message);
  if (direct) {
    return direct;
  }

  const nestedMetadata = ['metadata', 'providerMetadata', 'providerResponse', 'response'] as const;
  for (const key of nestedMetadata) {
    const providerRequestId = readProviderRequestId(message[key], { includeGenericId: true });
    if (providerRequestId) {
      return providerRequestId;
    }
  }

  return readProviderRequestId(message.usage, { includeGenericId: true });
}
