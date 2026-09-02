import type { ToolSpeech } from './types';

export type ToolSpeechInput = string | ToolSpeech | undefined | null;

const MAX_TOOL_SPEECH_LENGTH = 80;
const MAX_TOOL_SPEECH_DELAY_MS = 10_000;
const MAX_TOOL_SPEECH_BUBBLE_DURATION_MS = 30_000;

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || !/^[{[]/.test(trimmed)) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function clampPositiveInteger(value: unknown, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.min(Math.floor(value), max);
}

export function normalizeToolSpeech(input: ToolSpeechInput): ToolSpeech | undefined {
  if (typeof input === 'string') {
    const text = normalizeToolSpeechText(input);
    return text ? { text } : undefined;
  }

  if (!isRecord(input)) return undefined;

  const text = normalizeToolSpeechText(input.text);
  if (!text) return undefined;

  const bubbleDuration = clampPositiveInteger(input.bubbleDuration, MAX_TOOL_SPEECH_BUBBLE_DURATION_MS);
  const delayMs = clampPositiveInteger(input.delayMs, MAX_TOOL_SPEECH_DELAY_MS);

  return {
    text,
    ...(typeof input.bubbleEnabled === 'boolean' ? { bubbleEnabled: input.bubbleEnabled } : {}),
    ...(bubbleDuration ? { bubbleDuration } : {}),
    ...(delayMs ? { delayMs } : {})
  };
}

export function normalizeToolSpeechText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > MAX_TOOL_SPEECH_LENGTH ? `${normalized.slice(0, MAX_TOOL_SPEECH_LENGTH)}...` : normalized;
}

export function extractToolSpeechFromResult(result: unknown): ToolSpeech | undefined {
  const parsed = parseMaybeJson(result);
  if (!isRecord(parsed)) return undefined;

  return (
    normalizeToolSpeech(parsed.speech) ||
    normalizeToolSpeech(parsed.toolSpeech) ||
    normalizeToolSpeech(isRecord(parsed.details) ? parsed.details.speech : undefined) ||
    normalizeToolSpeech(isRecord(parsed.details) ? parsed.details.toolSpeech : undefined)
  );
}

export function attachToolSpeechToDetails<TDetails>(details: TDetails, speechInput: ToolSpeechInput): TDetails {
  const speech = normalizeToolSpeech(speechInput);
  if (!speech || !isRecord(details)) return details;
  return {
    ...details,
    speech
  };
}
