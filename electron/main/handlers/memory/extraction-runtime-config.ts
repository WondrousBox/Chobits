import { DEFAULT_EXTRACTION_CONFIG } from '../../../../packages/ai/services/memory-types';

export const DEFAULT_PERIODIC_SAVE_INTERVAL = 20;

const MS_PER_MINUTE = 60 * 1000;
const MIN_MAX_TOKENS = 256;

export interface ExtractionRuntimeConfigSource {
  minNewMessagesForExtraction?: number;
  extractionCooldownMinutes?: number;
  maxTokensPerExtraction?: number;
  periodicSaveInterval?: number;
}

export interface ExtractionRuntimeConfig {
  minNewMessagesForExtraction: number;
  extractionCooldownMinutes: number;
  cooldownMs: number;
  maxTokensPerExtraction: number;
  periodicSaveInterval: number;
}

export interface ExtractionTriggerDecision {
  shouldEnqueue: boolean;
  threshold: number;
  periodicTrigger: boolean;
  periodicCount: number;
  periodicInterval: number;
}

export interface CooldownState {
  active: boolean;
  elapsedMs: number;
  remainingMs: number;
}

export function resolveExtractionRuntimeConfig(source: ExtractionRuntimeConfigSource = {}): ExtractionRuntimeConfig {
  const minNewMessagesForExtraction = normalizePositiveInt(source.minNewMessagesForExtraction, DEFAULT_EXTRACTION_CONFIG.minNewMessages);
  const extractionCooldownMinutes = normalizeNonNegativeNumber(source.extractionCooldownMinutes, DEFAULT_EXTRACTION_CONFIG.minTriggerInterval / MS_PER_MINUTE);
  const maxTokensPerExtraction = normalizePositiveInt(source.maxTokensPerExtraction, DEFAULT_EXTRACTION_CONFIG.maxTokensPerExtraction, MIN_MAX_TOKENS);
  const periodicSaveInterval = normalizePositiveInt(source.periodicSaveInterval, DEFAULT_PERIODIC_SAVE_INTERVAL);

  return {
    minNewMessagesForExtraction,
    extractionCooldownMinutes,
    cooldownMs: Math.round(extractionCooldownMinutes * MS_PER_MINUTE),
    maxTokensPerExtraction,
    periodicSaveInterval
  };
}

export function getExtractionThreshold(config: ExtractionRuntimeConfig, hasToolCalls: boolean): number {
  if (!hasToolCalls) {
    return config.minNewMessagesForExtraction;
  }

  return Math.max(1, config.minNewMessagesForExtraction - 2);
}

export function evaluateExtractionTrigger(input: { config: ExtractionRuntimeConfig; hasToolCalls: boolean; newMessageCount: number; accumulatedMessageCount: number }): ExtractionTriggerDecision {
  const threshold = getExtractionThreshold(input.config, input.hasToolCalls);
  const periodicTrigger = input.accumulatedMessageCount >= input.config.periodicSaveInterval;

  return {
    shouldEnqueue: input.newMessageCount >= threshold || periodicTrigger,
    threshold,
    periodicTrigger,
    periodicCount: input.accumulatedMessageCount,
    periodicInterval: input.config.periodicSaveInterval
  };
}

export function getCooldownState(lastTriggeredAt: number | undefined, now: number, config: ExtractionRuntimeConfig): CooldownState {
  if (!lastTriggeredAt || config.cooldownMs <= 0) {
    return {
      active: false,
      elapsedMs: 0,
      remainingMs: 0
    };
  }

  const elapsedMs = Math.max(0, now - lastTriggeredAt);
  const remainingMs = Math.max(0, config.cooldownMs - elapsedMs);

  return {
    active: remainingMs > 0,
    elapsedMs,
    remainingMs
  };
}

function normalizePositiveInt(value: number | undefined, fallback: number, min = 1): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return Math.max(min, Math.round(fallback));
  }

  return Math.max(min, Math.round(value));
}

function normalizeNonNegativeNumber(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return Math.max(0, fallback);
  }

  return Math.max(0, value);
}
