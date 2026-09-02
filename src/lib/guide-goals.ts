import { CHAT_API_CONFIGURED_GUIDE_GOAL, type SpriteRoutineGuideGoalDefinition, type SpriteRoutineGuideGoalKind } from '@packages/sprite-core/purpose/guide-goals';
import type { ProviderRecord } from '@packages/ai/types';

import { resolveProviderIdentity } from '@/lib/ai-provider-identity';

const CHAT_API_CONFIG_GUIDE_PURPOSE_ID = 'chat.api-config-guide';
const DEFAULT_CHAT_PROVIDER_ID = 'openai';
const DEFAULT_CHAT_API_FIELDS = ['apiKey'];
const GUIDE_COOLDOWN_MS = 30_000;

const lastGuideStartedAtByKey = new Map<string, number>();
const inflightEnsures = new Map<string, Promise<GuideGoalEnsureResult>>();

export type GuideGoalTrigger = 'assistant-double-click' | 'assistant-menu-chat' | 'assistant-window-open' | 'chat-window-open' | 'chat-window-focus' | 'chat-send' | 'sidebar-open' | 'sidebar-send' | 'workspace-entry';

export interface GuideGoalEnsureOptions {
  goal: SpriteRoutineGuideGoalDefinition;
  trigger: GuideGoalTrigger;
  providerId?: string;
  preferredPresetId?: string;
  forceGuide?: boolean;
}

export interface GuideGoalEvaluationResult {
  achieved: boolean;
  goal: SpriteRoutineGuideGoalDefinition;
  providerId?: string;
  presetId?: string;
  achievementId?: string;
  reason?: 'achieved' | 'missing-provider' | 'missing-api' | 'missing-workspace' | 'missing-achievement' | 'unsupported-goal' | 'check-failed';
}

export interface GuideGoalEnsureResult {
  achieved: boolean;
  goal: SpriteRoutineGuideGoalDefinition;
  guided: boolean;
  blocked: boolean;
  providerId?: string;
  presetId?: string;
  reason?: GuideGoalEvaluationResult['reason'] | 'cooldown' | 'start-failed';
}

function normalizeId(value?: string): string {
  return String(value || '').trim();
}

function canUseProviderForChat(provider: ProviderRecord): boolean {
  return provider.capabilities?.chat !== false;
}

function isConfiguredChatProvider(provider: ProviderRecord): boolean {
  return provider.configured === true && canUseProviderForChat(provider);
}

function requiredFieldsForProvider(provider?: ProviderRecord): string[] {
  const fields = provider?.schema?.fields?.filter((field) => field.required).map((field) => field.key).filter(Boolean) || [];
  return fields.length > 0 ? fields : DEFAULT_CHAT_API_FIELDS;
}

function resolveProviderForGuide(providers: ProviderRecord[], providerId?: string): ProviderRecord | undefined {
  const requestedProviderId = normalizeId(providerId);
  if (requestedProviderId) {
    const resolved = resolveProviderIdentity(providers || [], requestedProviderId);
    if (resolved) return resolved;
  }

  return (providers || []).find((provider) => provider.id === DEFAULT_CHAT_PROVIDER_ID) || (providers || []).find(canUseProviderForChat) || (providers || [])[0];
}

function shouldCheckAnyChatProvider(trigger: GuideGoalTrigger, providerId?: string, preferredPresetId?: string): boolean {
  return !trigger.endsWith('-send') && !normalizeId(providerId) && !normalizeId(preferredPresetId);
}

function resolveGuideKey(options: GuideGoalEnsureOptions, evaluation: GuideGoalEvaluationResult): string {
  const providerId = evaluation.providerId || normalizeId(options.providerId) || DEFAULT_CHAT_PROVIDER_ID;
  const scope = options.trigger.endsWith('-send') ? 'send' : 'open';
  return `${options.goal.id}:${providerId}:${scope}`;
}

async function resolvePresetIdForGuide(providerId: string, preferredPresetId?: string): Promise<string | undefined> {
  const preferred = normalizeId(preferredPresetId);
  if (preferred) {
    return preferred;
  }

  const presets = await window.chobits.ai.listPresets(providerId).catch(() => []);
  return presets?.[0]?.id;
}

async function evaluateChatProviderConfiguredGoal(goal: SpriteRoutineGuideGoalDefinition, options: Pick<GuideGoalEnsureOptions, 'providerId' | 'preferredPresetId' | 'trigger'>): Promise<GuideGoalEvaluationResult> {
  try {
    const providers = await window.chobits.ai.getProviders().catch(() => []);
    if (!providers.length && !normalizeId(options.providerId)) {
      return { goal, achieved: false, reason: 'missing-provider' };
    }

    if (shouldCheckAnyChatProvider(options.trigger, options.providerId, options.preferredPresetId)) {
      const configuredProvider = (providers || []).find(isConfiguredChatProvider);
      if (configuredProvider) {
        return { goal, achieved: true, providerId: configuredProvider.id, reason: 'achieved' };
      }
    }

    const provider = resolveProviderForGuide(providers || [], options.providerId);
    if (!provider?.id) {
      return { goal, achieved: false, reason: 'missing-provider' };
    }

    const providerId = provider.id;
    const usablePreset = await window.chobits.ai.resolveUsablePreset(providerId, options.preferredPresetId).catch(() => null);
    if (usablePreset?.id) {
      return { goal, achieved: true, providerId, presetId: usablePreset.id, reason: 'achieved' };
    }

    return { goal, achieved: false, providerId, reason: 'missing-api' };
  } catch (error) {
    console.warn('[guide-goals] failed to check chat API config goal:', error);
    return { goal, achieved: false, reason: 'check-failed' };
  }
}

async function evaluateAchievementUnlockedGoal(goal: SpriteRoutineGuideGoalDefinition): Promise<GuideGoalEvaluationResult> {
  const achievementId = 'achievementId' in goal && typeof goal.achievementId === 'string' ? goal.achievementId.trim() : '';
  if (!achievementId) {
    return { goal, achieved: false, reason: 'unsupported-goal' };
  }

  try {
    const result = await window.chobits.character.getState();
    const achieved = Array.isArray(result?.characterState?.achievements) && result.characterState.achievements.includes(achievementId);
    return {
      goal,
      achieved,
      achievementId,
      reason: achieved ? 'achieved' : 'missing-achievement'
    };
  } catch (error) {
    console.warn('[guide-goals] failed to check achievement goal:', error);
    return { goal, achieved: false, achievementId, reason: 'check-failed' };
  }
}

export async function evaluateGuideGoal(goal: SpriteRoutineGuideGoalDefinition, options: Pick<GuideGoalEnsureOptions, 'providerId' | 'preferredPresetId' | 'trigger'>): Promise<GuideGoalEvaluationResult> {
  switch (goal.kind as SpriteRoutineGuideGoalKind) {
    case 'ai.chat-provider-configured':
      return evaluateChatProviderConfiguredGoal(goal, options);
    case 'achievement.unlocked':
      return evaluateAchievementUnlockedGoal(goal);
    default:
      return { goal, achieved: false, reason: 'unsupported-goal' };
  }
}

async function startChatApiConfigGuide(options: GuideGoalEnsureOptions, evaluation: GuideGoalEvaluationResult): Promise<{ guided: boolean; presetId?: string; attempted: boolean }> {
  const providers = await window.chobits.ai.getProviders().catch(() => []);
  const provider = resolveProviderForGuide(providers || [], evaluation.providerId || options.providerId);
  if (!provider?.id) {
    return { guided: false, attempted: false };
  }

  const providerId = provider.id;
  const presetId = await resolvePresetIdForGuide(providerId, options.preferredPresetId);
  try {
    const result = await window.chobits.sprite.startPurpose({
      kind: CHAT_API_CONFIG_GUIDE_PURPOSE_ID,
      reason: '聊天入口缺少可用的 AI API Key 配置',
      source: 'user-event',
      title: '配置聊天 API Key',
      priority: 72,
      presetId: CHAT_API_CONFIG_GUIDE_PURPOSE_ID,
      interruptPolicy: 'interruptible',
      coalesceKey: CHAT_API_CONFIG_GUIDE_PURPOSE_ID,
      plannerMode: 'preset-only',
      context: {
        providerId,
        ...(presetId ? { presetId } : {}),
        fields: requiredFieldsForProvider(provider),
        trigger: options.trigger
      }
    });

    return { guided: result?.accepted !== false, presetId, attempted: true };
  } catch (error) {
    console.warn('[guide-goals] failed to start chat API config guide:', error);
    return { guided: false, presetId, attempted: true };
  }
}

async function startGuideForGoal(options: GuideGoalEnsureOptions, evaluation: GuideGoalEvaluationResult): Promise<{ guided: boolean; presetId?: string; attempted: boolean }> {
  switch (options.goal.kind as SpriteRoutineGuideGoalKind) {
    case 'ai.chat-provider-configured':
      if (!evaluation.providerId && evaluation.reason === 'missing-provider') {
        return { guided: false, attempted: false };
      }
      return startChatApiConfigGuide(options, evaluation);
    default:
      return { guided: false, attempted: false };
  }
}

function isBlockingTrigger(trigger: GuideGoalTrigger): boolean {
  return trigger === 'assistant-double-click' || trigger === 'assistant-menu-chat' || trigger.endsWith('-send') || trigger === 'workspace-entry';
}

async function runEnsureGuideGoal(options: GuideGoalEnsureOptions): Promise<GuideGoalEnsureResult> {
  const evaluation = await evaluateGuideGoal(options.goal, options);
  if (evaluation.achieved) {
    return { ...evaluation, guided: false, blocked: false };
  }

  const blocked = options.goal.blocking === true && isBlockingTrigger(options.trigger);
  const key = resolveGuideKey(options, evaluation);
  const now = Date.now();
  const lastGuideStartedAt = lastGuideStartedAtByKey.get(key) ?? 0;
  if (!options.forceGuide && now - lastGuideStartedAt < GUIDE_COOLDOWN_MS) {
    return { ...evaluation, guided: false, blocked, reason: 'cooldown' };
  }

  lastGuideStartedAtByKey.set(key, now);
  const guide = await startGuideForGoal(options, evaluation);
  return {
    ...evaluation,
    ...(guide.presetId ? { presetId: guide.presetId } : {}),
    guided: guide.guided,
    blocked,
    reason: guide.guided || !guide.attempted ? evaluation.reason : 'start-failed'
  };
}

export async function ensureGuideGoal(options: GuideGoalEnsureOptions): Promise<GuideGoalEnsureResult> {
  const inflightKey = `${options.goal.id}:${normalizeId(options.providerId)}:${normalizeId(options.preferredPresetId)}:${options.trigger}:${options.forceGuide ? 'force' : 'normal'}`;
  const existing = inflightEnsures.get(inflightKey);
  if (existing && !options.forceGuide) {
    return existing;
  }

  const pending = runEnsureGuideGoal(options).finally(() => {
    inflightEnsures.delete(inflightKey);
  });
  inflightEnsures.set(inflightKey, pending);
  return pending;
}

export function resetGuideGoalStateForTest(): void {
  lastGuideStartedAtByKey.clear();
  inflightEnsures.clear();
}

export { CHAT_API_CONFIGURED_GUIDE_GOAL };
