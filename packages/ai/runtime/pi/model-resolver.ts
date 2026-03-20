import { getPreset, getPresetSecrets } from '../../preset-service';
import { resolveProviderPresetId } from '../../provider-preset';
import { getProviderDefinitionDefaultModel, listProviderSecretKeys, resolveKnownProviderId, toCanonicalProviderId } from '../../providers/service';
import { getProvider } from '../../registry';
import { getAllSecrets, getFirstApiKey } from '../../settings-store';
import type { ChatMessage, ChatRequest, ProviderPresetRecord } from '../../types';
import type { ResolvedPiModelConfig, ResolvedPiRequest } from './contracts';
import { getPiAgentProfile } from './profile-registry';
import { isPiRuntimeRequested } from './runtime-switch';
import { normalizePiToolIds } from './tool-registry';

type SecretValues = Record<string, string | undefined>;

function prependSystemPrompt(messages: ChatMessage[], systemPrompt?: string): ChatMessage[] {
  if (!systemPrompt) return messages;
  const firstMessage = messages[0];
  if (firstMessage?.role === 'system' && firstMessage.content === systemPrompt) {
    return messages;
  }
  return [{ role: 'system', content: systemPrompt }, ...messages];
}

function resolveEnabledToolIds(req: ChatRequest, preset: ProviderPresetRecord | undefined, profileDefaultToolIds: string[]): string[] {
  const extrasToolIds = Array.isArray(req.extras?.enabledTools) ? (req.extras?.enabledTools as string[]) : undefined;

  if (extrasToolIds) return normalizePiToolIds(extrasToolIds);
  if (preset?.enabledTools?.length) return normalizePiToolIds(preset.enabledTools);

  return normalizePiToolIds(profileDefaultToolIds);
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
      secrets: Object.entries(mergedSecrets).reduce<Record<string, string>>((acc, [key, value]) => {
        if (typeof value === 'string') acc[key] = value;
        return acc;
      }, {}),
      source: preset ? 'preset' : 'provider'
    }
  };
}

export async function resolvePiRequest(req: ChatRequest): Promise<ResolvedPiRequest> {
  const profile = getPiAgentProfile(req.agentId || 'assistant');
  const { preset, model } = await resolvePiModelConfig(req);
  const messages = prependSystemPrompt(req.messages || [], preset?.systemPrompt);

  return {
    enabledToolIds: resolveEnabledToolIds(req, preset, profile.defaultToolIds),
    messages,
    model,
    preset,
    profile,
    request: req,
    runtime: isPiRuntimeRequested(req) ? 'pi' : 'legacy',
    runtimeRequested: isPiRuntimeRequested(req)
  };
}
