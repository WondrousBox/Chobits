import { describe, expect, it } from 'vitest';

import { DEFAULT_EXTRACTION_CONFIG } from '../../packages/ai/services/memory-types';
import {
  evaluateExtractionTrigger,
  getCooldownState,
  getExtractionThreshold,
  resolveExtractionRuntimeConfig
} from '../../electron/main/handlers/memory/extraction-runtime-config';

describe('memory extraction runtime config', () => {
  it('aligns runtime defaults with shared extraction defaults and converts cooldown minutes to ms', () => {
    const config = resolveExtractionRuntimeConfig();

    expect(config.minNewMessagesForExtraction).toBe(DEFAULT_EXTRACTION_CONFIG.minNewMessages);
    expect(config.extractionCooldownMinutes).toBe(DEFAULT_EXTRACTION_CONFIG.minTriggerInterval / (60 * 1000));
    expect(config.cooldownMs).toBe(DEFAULT_EXTRACTION_CONFIG.minTriggerInterval);
    expect(config.maxTokensPerExtraction).toBe(DEFAULT_EXTRACTION_CONFIG.maxTokensPerExtraction);
    expect(config.periodicSaveInterval).toBe(20);
  });

  it('uses config-driven tool-call threshold reduction', () => {
    const config = resolveExtractionRuntimeConfig({
      minNewMessagesForExtraction: 6,
      extractionCooldownMinutes: 3,
      maxTokensPerExtraction: 2048,
      periodicSaveInterval: 10
    });

    expect(getExtractionThreshold(config, false)).toBe(6);
    expect(getExtractionThreshold(config, true)).toBe(4);
  });

  it('fires periodic trigger even when new messages stay below threshold', () => {
    const config = resolveExtractionRuntimeConfig({
      minNewMessagesForExtraction: 5,
      extractionCooldownMinutes: 2,
      maxTokensPerExtraction: 2048,
      periodicSaveInterval: 8
    });

    const decision = evaluateExtractionTrigger({
      config,
      hasToolCalls: false,
      newMessageCount: 2,
      accumulatedMessageCount: 8
    });

    expect(decision.shouldEnqueue).toBe(true);
    expect(decision.periodicTrigger).toBe(true);
    expect(decision.threshold).toBe(5);
  });

  it('computes cooldown from actual last trigger time only', () => {
    const config = resolveExtractionRuntimeConfig({
      extractionCooldownMinutes: 5
    });

    const now = 1_000_000;
    const activeCooldown = getCooldownState(now - 60_000, now, config);
    const expiredCooldown = getCooldownState(now - 301_000, now, config);

    expect(activeCooldown).toMatchObject({
      active: true,
      elapsedMs: 60_000,
      remainingMs: 240_000
    });
    expect(expiredCooldown.active).toBe(false);
    expect(expiredCooldown.remainingMs).toBe(0);
  });
});
