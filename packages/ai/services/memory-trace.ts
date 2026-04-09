export type MemoryTraceLevel = 'log' | 'warn' | 'error';

export interface MemoryTracePayload {
  event: string;
  [key: string]: unknown;
}

const TRACE_PREFIX = '[MemoryTrace]';

function normalizeValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value instanceof Error) return value.message;
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return value;
  return value;
}

export function shortTraceId(id: string | undefined, size = 8): string | undefined {
  if (!id) return undefined;
  const text = id.trim();
  if (!text) return undefined;
  return text.length <= size ? text : text.slice(0, size);
}

export function logMemoryTrace(payload: MemoryTracePayload, level: MemoryTraceLevel = 'log'): void {
  const normalized: Record<string, unknown> = {
    ts: new Date().toISOString()
  };

  for (const [key, value] of Object.entries(payload)) {
    const next = normalizeValue(value);
    if (next !== undefined) {
      normalized[key] = next;
    }
  }

  const line = `${TRACE_PREFIX} ${JSON.stringify(normalized)}`;

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  if (level === 'error') {
    console.error(line);
    return;
  }

  console.log(line);
}
