import { getPreset, getPresetSecrets } from '../../preset-service';
import { resolveProviderPresetId } from '../../provider-preset';
import { getProviderDefinitionDefaultModel, listProviderSecretKeys, resolveKnownProviderId, toCanonicalProviderId } from '../../providers/service';
import { getProvider } from '../../registry';
import { getAllSecrets, getFirstApiKey } from '../../settings-store';
import type { ChatMessage, ChatRequest, ProviderPresetRecord } from '../../types';
import type { PiCodingWorkspaceContext, ResolvedPiModelConfig, ResolvedPiRequest } from './contracts';
import { getPiAgentProfile } from './profile-registry';
import { isPiRuntimeRequested } from './runtime-switch';
import { normalizeRequestedSkillInvocation } from './skills';
import { DEFAULT_EMOJI_PACK_TOOL_IDS, normalizePiToolIds } from './tool-registry';

type SecretValues = Record<string, string | undefined>;

function prependSystemPrompt(messages: ChatMessage[], systemPrompt?: string): ChatMessage[] {
  if (!systemPrompt) return messages;
  const firstMessage = messages[0];
  if (firstMessage?.role === 'system' && firstMessage.content === systemPrompt) {
    return messages;
  }
  return [{ role: 'system', content: systemPrompt }, ...messages];
}

const WEB_SEARCH_TOOL_IDS = ['web-search', 'web-read'];

function resolveEnabledToolIds(req: ChatRequest, preset: ProviderPresetRecord | undefined, profileDefaultToolIds: string[]): string[] {
  const extrasToolIds = Array.isArray(req.extras?.enabledTools) ? (req.extras?.enabledTools as string[]) : undefined;

  let toolIds: string[];
  if (extrasToolIds) {
    toolIds = normalizePiToolIds(extrasToolIds);
  } else if (preset?.enabledTools?.length) {
    toolIds = normalizePiToolIds(preset.enabledTools);
  } else {
    toolIds = normalizePiToolIds(profileDefaultToolIds);
  }

  if (req.extras?.webSearchEnabled) {
    const existing = new Set(toolIds);
    for (const id of WEB_SEARCH_TOOL_IDS) {
      if (!existing.has(id)) toolIds.push(id);
    }
  }

  if (req.extras?.emojiPacksEnabled) {
    const existing = new Set(toolIds);
    for (const id of DEFAULT_EMOJI_PACK_TOOL_IDS) {
      if (!existing.has(id)) toolIds.push(id);
    }
  }

  return toolIds;
}

function resolveCodingWorkspace(req: ChatRequest): PiCodingWorkspaceContext | undefined {
  const rootPath = typeof req.extras?.codingWorkspaceRoot === 'string' ? req.extras.codingWorkspaceRoot.trim() : '';
  if (!rootPath) return undefined;

  const label = typeof req.extras?.codingWorkspaceLabel === 'string' ? req.extras.codingWorkspaceLabel.trim() : '';

  return {
    mode: 'safe',
    rootPath,
    source: 'manual',
    ...(label ? { label } : {})
  };
}

export async function resolvePiModelConfig(req: ChatRequest): Promise<{ preset?: ProviderPresetRecord; model: ResolvedPiModelConfig }> {
  const providerPresetId = resolveProviderPresetId(req);
  const preset = getPreset(providerPresetId);
  const rawProviderId = preset?.providerId || req.providerId || 'openai';
  const canonicalProviderId = toCanonicalProviderId(rawProviderId);

  const knownProviderIds = [rawProviderId, canonicalProviderId].filter(Boolean);
  const providerId = resolveKnownProviderId(rawProviderId, knownProviderIds);
  const provider = getProvider(providerId) || getProvider(canonicalProviderId) || getProvider(rawProviderId);

  if (!provider) {
    throw new Error(`Pi model resolver could not find provider: ${rawProviderId}`);
  }

  const fields = listProviderSecretKeys(provider.id);
  const adapterSecrets = ((await Promise.resolve(provider.getSecrets?.() || {})) as SecretValues) || {};
  const providerSecrets = (await getAllSecrets(provider.id, fields).catch(() => ({}))) as SecretValues;
  const presetSecrets = (await getPresetSecrets(preset?.id, fields).catch(() => ({}))) as SecretValues;
  const mergedSecrets = { ...adapterSecrets, ...providerSecrets, ...presetSecrets };
  const apiKey = getFirstApiKey(mergedSecrets.apiKey);
  const resolvedSecrets = Object.entries(mergedSecrets).reduce<Record<string, string>>((acc, [key, value]) => {
    if (typeof value === 'string') acc[key] = value;
    return acc;
  }, {});
  if (apiKey) {
    resolvedSecrets.apiKey = apiKey;
  }
  const defaultModel = getProviderDefinitionDefaultModel(provider.id, 'chat', '');
  const modelId = ((req.extras?.model as string | undefined) || (mergedSecrets.model as string | undefined) || defaultModel || '').trim();

  return {
    preset,
    model: {
      apiKey,
      baseUrl: mergedSecrets.baseUrl as string | undefined,
      canonicalProviderId,
      presetId: preset?.id,
      modelId,
      providerId: provider.id,
      providerLabel: provider.label,
      secrets: resolvedSecrets,
      source: preset ? 'preset' : 'provider'
    }
  };
}

export async function resolvePiRequest(req: ChatRequest): Promise<ResolvedPiRequest> {
  const profile = getPiAgentProfile(req.agentId || 'assistant');
  const { preset, model } = await resolvePiModelConfig(req);
  const messages = prependSystemPrompt(req.messages || [], preset?.systemPrompt);
  const requestedSkillInvocation = normalizeRequestedSkillInvocation(req.extras?.explicitSkillInvocation);

  return {
    coding: resolveCodingWorkspace(req),
    enabledToolIds: resolveEnabledToolIds(req, preset, profile.defaultToolIds),
    ...(requestedSkillInvocation ? { requestedSkillInvocation } : {}),
    messages,
    model,
    preset,
    profile,
    request: req,
    runtime: isPiRuntimeRequested(req) ? 'pi' : 'legacy',
    runtimeRequested: isPiRuntimeRequested(req)
  };
}
