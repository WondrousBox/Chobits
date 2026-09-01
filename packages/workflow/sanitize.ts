import type { NodeRunState, WorkflowRunLogEntry, WorkflowRunRecord } from './types.js';

const REDACTED = '[REDACTED]';
const TRUNCATED = '[Truncated]';

export const MAX_WORKFLOW_LOG_ENTRIES = 500;
export const MAX_WORKFLOW_LOG_MESSAGE_LENGTH = 4096;

export type WorkflowSanitizeOptions = {
  maxDepth?: number;
  maxArrayLength?: number;
  maxObjectKeys?: number;
  maxStringLength?: number;
  maxTotalChars?: number;
};

const DEFAULT_OPTIONS: Required<WorkflowSanitizeOptions> = {
  maxDepth: 8,
  maxArrayLength: 100,
  maxObjectKeys: 200,
  maxStringLength: 16_384,
  maxTotalChars: 256 * 1024
};

const SENSITIVE_KEY_PARTS = ['password', 'passwd', 'pwd', 'secret', 'token', 'apikey', 'authorization', 'cookie', 'credential', 'privatekey'];

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return SENSITIVE_KEY_PARTS.some((part) => normalized === part || normalized.endsWith(part));
}

function redactSensitivePatterns(value: string): string {
  return value
    .replace(/\b(Bearer|Basic)\s+[^\s,;]+/gi, '$1 [REDACTED]')
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[REDACTED]@')
    .replace(/([?&](?:api[\s_-]?key|access[\s_-]?token|refresh[\s_-]?token|token|authorization|auth|secret|password)=)[^&#\s]*/gi, '$1[REDACTED]')
    .replace(/\b(api[\s_-]?key|access[\s_-]?token|refresh[\s_-]?token|authorization|password|secret)\s*[:=]\s*[^\s,;&#]+/gi, '$1=[REDACTED]');
}

function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const suffix = `...[Truncated ${value.length - maxLength} chars]`;
  if (suffix.length >= maxLength) return suffix.slice(0, Math.max(0, maxLength));
  return `${value.slice(0, Math.max(0, maxLength - suffix.length))}${suffix}`;
}

export function sanitizeWorkflowString(value: string, maxLength = DEFAULT_OPTIONS.maxStringLength): string {
  return truncateString(redactSensitivePatterns(value), Math.max(0, maxLength));
}

export function sanitizeWorkflowValue(value: unknown, options: WorkflowSanitizeOptions = {}): unknown {
  const limits = { ...DEFAULT_OPTIONS, ...options };
  const ancestors = new WeakSet<object>();
  let usedChars = 0;

  const consume = (valueToConsume: string): string => {
    const remaining = limits.maxTotalChars - usedChars;
    if (remaining <= 0) return TRUNCATED;
    const limited = truncateString(valueToConsume, Math.min(limits.maxStringLength, remaining));
    usedChars += limited.length;
    return limited;
  };

  const visit = (current: unknown, depth: number, key?: string): unknown => {
    if (key && isSensitiveKey(key)) return REDACTED;
    if (usedChars >= limits.maxTotalChars) return TRUNCATED;
    if (current === null || typeof current === 'boolean' || typeof current === 'number') return current;
    if (typeof current === 'string') return consume(redactSensitivePatterns(current));
    if (typeof current === 'undefined') return undefined;
    if (typeof current === 'bigint') return consume(`${current.toString()}n`);
    if (typeof current === 'symbol') return consume(current.toString());
    if (typeof current === 'function') return consume(`[Function${current.name ? ` ${current.name}` : ''}]`);

    if (Buffer.isBuffer(current)) return consume(`[Buffer ${current.byteLength} bytes]`);
    if (current instanceof ArrayBuffer) return consume(`[ArrayBuffer ${current.byteLength} bytes]`);
    if (ArrayBuffer.isView(current)) return consume(`[${current.constructor.name} ${current.byteLength} bytes]`);
    if (current instanceof Date) return consume(Number.isNaN(current.getTime()) ? '[Invalid Date]' : current.toISOString());
    if (current instanceof RegExp) return consume(current.toString());
    if (depth >= limits.maxDepth) return '[Max Depth]';

    const object = current as object;
    if (ancestors.has(object)) return '[Circular]';
    ancestors.add(object);
    try {
      if (current instanceof Error) {
        return {
          name: consume(current.name),
          message: consume(redactSensitivePatterns(current.message)),
          ...(current.stack ? { stack: consume(redactSensitivePatterns(current.stack)) } : {}),
          ...(current.cause !== undefined ? { cause: visit(current.cause, depth + 1, 'cause') } : {})
        };
      }

      if (Array.isArray(current)) {
        const result = current.slice(0, limits.maxArrayLength).map((entry) => visit(entry, depth + 1));
        if (current.length > limits.maxArrayLength) result.push(`[Truncated ${current.length - limits.maxArrayLength} items]`);
        return result;
      }

      if (current instanceof Map) {
        return visit(Object.fromEntries([...current.entries()].slice(0, limits.maxObjectKeys).map(([mapKey, mapValue]) => [String(mapKey), mapValue])), depth + 1);
      }
      if (current instanceof Set) {
        return visit([...current.values()], depth + 1);
      }

      const result: Record<string, unknown> = {};
      const keys = Object.keys(current as Record<string, unknown>);
      for (const objectKey of keys.slice(0, limits.maxObjectKeys)) {
        usedChars += objectKey.length;
        if (usedChars >= limits.maxTotalChars) {
          result.__truncated__ = TRUNCATED;
          break;
        }
        try {
          result[objectKey] = visit((current as Record<string, unknown>)[objectKey], depth + 1, objectKey);
        } catch (error) {
          result[objectKey] = `[Unreadable: ${error instanceof Error ? sanitizeWorkflowString(error.message, 256) : 'unknown error'}]`;
        }
      }
      if (keys.length > limits.maxObjectKeys) result.__truncated__ = `${keys.length - limits.maxObjectKeys} keys omitted`;
      return result;
    } finally {
      ancestors.delete(object);
    }
  };

  return visit(value, 0);
}

export function sanitizeWorkflowRunRecord(record: WorkflowRunRecord): WorkflowRunRecord {
  return {
    runId: record.runId,
    workflowId: record.workflowId,
    ...(record.workspaceId !== undefined ? { workspaceId: record.workspaceId } : {}),
    createdAt: record.createdAt,
    status: record.status,
    nodes: sanitizeWorkflowValue(record.nodes, { maxObjectKeys: 1000, maxTotalChars: 128 * 1024 }) as WorkflowRunRecord['nodes'],
    ...(record.input !== undefined ? { input: sanitizeWorkflowValue(record.input, { maxTotalChars: 64 * 1024 }) as Record<string, any> } : {}),
    ...(record.output !== undefined ? { output: sanitizeWorkflowValue(record.output, { maxTotalChars: 128 * 1024 }) as Record<string, any> } : {}),
    ...(record.error !== undefined ? { error: sanitizeWorkflowString(record.error, MAX_WORKFLOW_LOG_MESSAGE_LENGTH) } : {}),
    ...(record.metadata !== undefined ? { metadata: sanitizeWorkflowValue(record.metadata, { maxTotalChars: 32 * 1024 }) as Record<string, any> } : {}),
    ...(record.progress !== undefined ? { progress: record.progress } : {}),
    ...(record.progressMessage !== undefined ? { progressMessage: sanitizeWorkflowString(record.progressMessage, 1024) } : {}),
    ...(record.startedAt !== undefined ? { startedAt: record.startedAt } : {}),
    ...(record.completedAt !== undefined ? { completedAt: record.completedAt } : {}),
    ...(record.duration !== undefined ? { duration: record.duration } : {})
  };
}

export function sanitizeWorkflowNodeState(state: NodeRunState): NodeRunState {
  return {
    nodeId: state.nodeId,
    status: state.status,
    ...(state.attempt !== undefined ? { attempt: state.attempt } : {}),
    ...(state.attempts !== undefined ? { attempts: sanitizeWorkflowValue(state.attempts, { maxArrayLength: 50, maxTotalChars: 32 * 1024 }) as NodeRunState['attempts'] } : {}),
    ...(state.startedAt !== undefined ? { startedAt: state.startedAt } : {}),
    ...(state.finishedAt !== undefined ? { finishedAt: state.finishedAt } : {}),
    ...(state.error !== undefined ? { error: sanitizeWorkflowString(state.error, MAX_WORKFLOW_LOG_MESSAGE_LENGTH) } : {}),
    ...(state.errorReason !== undefined ? { errorReason: sanitizeWorkflowString(state.errorReason, 256) } : {}),
    ...(state.input !== undefined ? { input: sanitizeWorkflowValue(state.input, { maxTotalChars: 32 * 1024 }) as Record<string, any> } : {}),
    ...(state.output !== undefined ? { output: sanitizeWorkflowValue(state.output, { maxTotalChars: 64 * 1024 }) as Record<string, any> } : {}),
    ...(state.progress !== undefined ? { progress: state.progress } : {}),
    ...(state.progressMessage !== undefined ? { progressMessage: sanitizeWorkflowString(state.progressMessage, 1024) } : {}),
    ...(state.progressDetail !== undefined ? { progressDetail: sanitizeWorkflowValue(state.progressDetail, { maxTotalChars: 32 * 1024 }) } : {})
  };
}

export function sanitizeWorkflowRunLogEntry(entry: WorkflowRunLogEntry): WorkflowRunLogEntry {
  return {
    ...entry,
    message: sanitizeWorkflowString(entry.message, MAX_WORKFLOW_LOG_MESSAGE_LENGTH),
    ...(entry.errorReason !== undefined ? { errorReason: sanitizeWorkflowString(entry.errorReason, 256) } : {})
  };
}
