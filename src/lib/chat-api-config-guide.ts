import type { ProviderRecord } from '@packages/ai/types';

import { resolveProviderIdentity } from '@/lib/ai-provider-identity';

const CHAT_API_CONFIG_GUIDE_PURPOSE_ID = 'chat.api-config-guide';
const DEFAULT_PROVIDER_ID = 'openai';
const DEFAULT_FIELDS = ['apiKey'];
const GUIDE_COOLDOWN_MS = 30_000;
const lastGuideStartedAtByKey = new Map<string, number>();
const inflightGuideChecks = new Map<string, Promise<ChatApiConfigGuideResult>>();

export type ChatApiConfigGuideTrigger = 'assistant-double-click' | 'assistant-menu-chat' | 'assistant-window-open' | 'chat-window-open' | 'chat-window-focus' | 'chat-send' | 'sidebar-open' | 'sidebar-send';

export interface ChatApiConfigGuideOptions {
  providerId?: string;
  preferredPresetId?: string;
  trigger: ChatApiConfigGuideTrigger;
  force?: boolean;
}

export interface ChatApiConfigGuideResult {
  guided: boolean;
  configured: boolean;
  providerId?: string;
  presetId?: string;
  reason?: 'cooldown' | 'missing-provider' | 'missing-api' | 'start-failed';
}

function normalizeId(value?: string): string {
  return String(value || '').trim();
}

function resolveGuideKey(providerId: string, trigger: ChatApiConfigGuideTrigger): string {
  if (trigger.endsWith('-send')) {
    return `${providerId}:send`;
  }
  return `${providerId}:open`;
}

function canUseProviderForChat(provider: ProviderRecord): boolean {
  return provider.capabilities?.chat !== false;
}

function isConfiguredChatProvider(provider: ProviderRecord): boolean {
  return provider.configured === true && canUseProviderForChat(provider);
}

function requiredFieldsForProvider(provider?: ProviderRecord): string[] {
  const fields = provider?.schema?.fields?.filter((field) => field.required).map((field) => field.key).filter(Boolean) || [];
  return fields.length > 0 ? fields : DEFAULT_FIELDS;
}

function resolveProviderForGuide(providers: ProviderRecord[], providerId?: string): ProviderRecord | undefined {
  const requestedProviderId = normalizeId(providerId);
  if (requestedProviderId) {
    const resolved = resolveProviderIdentity(providers || [], requestedProviderId);
    if (resolved) return resolved;
  }

  return (providers || []).find((provider) => provider.id === DEFAULT_PROVIDER_ID) || (providers || []).find(canUseProviderForChat) || (providers || [])[0];
}

async function resolvePresetIdForGuide(providerId: string, preferredPresetId?: string): Promise<string | undefined> {
  const preferred = normalizeId(preferredPresetId);
  if (preferred) {
    return preferred;
  }

  const presets = await window.YUA.ai.listPresets(providerId).catch(() => []);
  return presets?.[0]?.id;
}

async function startGuidePurpose(params: { providerId: string; presetId?: string; fields: string[]; trigger: ChatApiConfigGuideTrigger }): Promise<boolean> {
  try {
    const result = await window.YUA.sprite.startPurpose({
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
        providerId: params.providerId,
        ...(params.presetId ? { presetId: params.presetId } : {}),
        fields: params.fields,
        trigger: params.trigger
      }
    });

    return result?.accepted !== false;
  } catch (error) {
    console.warn('[chat-api-config-guide] failed to start guide purpose:', error);
    return false;
  }
}

async function runChatApiConfigGuide(options: ChatApiConfigGuideOptions): Promise<ChatApiConfigGuideResult> {
  const providers = await window.YUA.ai.getProviders().catch(() => []);
  const requestedProviderId = normalizeId(options.providerId);
  if (!options.trigger.endsWith('-send')) {
    const configuredProvider = (providers || []).find(isConfiguredChatProvider);
    if (configuredProvider) {
      return { guided: false, configured: true, providerId: configuredProvider.id };
    }
  }

  const provider = resolveProviderForGuide(providers || [], requestedProviderId);
  if (!provider?.id) {
    return { guided: false, configured: false, reason: 'missing-provider' };
  }

  const providerId = provider.id;
  const usablePreset = await window.YUA.ai.resolveUsablePreset(providerId, options.preferredPresetId).catch(() => null);
  if (usablePreset?.id) {
    return { guided: false, configured: true, providerId, presetId: usablePreset.id };
  }

  const key = resolveGuideKey(providerId, options.trigger);
  const now = Date.now();
  const lastGuideStartedAt = lastGuideStartedAtByKey.get(key) ?? 0;
  if (!options.force && now - lastGuideStartedAt < GUIDE_COOLDOWN_MS) {
    return { guided: false, configured: false, providerId, reason: 'cooldown' };
  }

  lastGuideStartedAtByKey.set(key, now);
  const presetId = await resolvePresetIdForGuide(providerId, options.preferredPresetId);
  const guided = await startGuidePurpose({
    providerId,
    presetId,
    fields: requiredFieldsForProvider(provider),
    trigger: options.trigger
  });

  return {
    guided,
    configured: false,
    providerId,
    ...(presetId ? { presetId } : {}),
    reason: guided ? undefined : 'start-failed'
  };
}

export async function guideChatApiConfigIfNeeded(options: ChatApiConfigGuideOptions): Promise<ChatApiConfigGuideResult> {
  const requestedProviderId = normalizeId(options.providerId) || DEFAULT_PROVIDER_ID;
  const inflightKey = `${requestedProviderId}:${normalizeId(options.preferredPresetId)}:${options.trigger}:${options.force ? 'force' : 'normal'}`;
  const existing = inflightGuideChecks.get(inflightKey);
  if (existing && !options.force) {
    return existing;
  }

  const pending = runChatApiConfigGuide(options)
    .catch((error) => {
      console.warn('[chat-api-config-guide] failed to check chat API config:', error);
      return { guided: false, configured: false, reason: 'missing-api' as const };
    })
    .finally(() => {
      inflightGuideChecks.delete(inflightKey);
    });
  inflightGuideChecks.set(inflightKey, pending);
  return pending;
}

export function resetChatApiConfigGuideStateForTest(): void {
  lastGuideStartedAtByKey.clear();
  inflightGuideChecks.clear();
}
