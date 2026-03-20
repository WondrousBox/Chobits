import fs from 'node:fs';
import path from 'node:path';

import { getPreset, getPresetSecrets, listPresets } from '../../ai/preset-service';
import { normalizeProviderPreset, resolveProviderPresetId } from '../../ai/provider-preset';
import { getProviderCapabilities, listProviderDefinitions, listProviderRuntimeModels, listProviderSecretKeys } from '../../ai/providers/service';
import { PiExecutionService } from '../../ai/runtime/pi/execution-service';
import { getAllSecrets, getFirstApiKey } from '../../ai/settings-store';
import type { ChatMessage, ChatRequest, ImageGenerationRequest, ProviderAdapter, ProviderCapabilityKey, ProviderPresetFields, ProviderSecrets } from '../../ai/types';
import type { NodeConfig, PortSchema } from '../types';

type ModelRecord = {
  capabilities?: Record<string, any>;
  description?: string;
  free?: boolean;
  id: string;
  label?: string;
  type?: string;
};

type WorkflowEmit = (event: string, payload?: any) => void;

export type WorkflowRichContentPart = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
export type WorkflowMessageContent = string | WorkflowRichContentPart[];
export type WorkflowChatMessage = Omit<ChatMessage, 'content'> & { content: WorkflowMessageContent };

export interface DynamicModelConfigOptions extends ProviderPresetFields {
  defaultProviderId?: string;
  emptyModelDescription: string;
  modelDescription: string;
  modelLabel: string;
  modelPredicate: (model: ModelRecord) => boolean;
  providerCapability?: ProviderCapabilityKey;
  providerId?: string;
  required?: boolean;
  warningScope: string;
}

export interface WorkflowProviderContext {
  provider: ProviderAdapter;
  secrets: ProviderSecrets;
}

export interface WorkflowProviderReference extends ProviderPresetFields {
  emit?: WorkflowEmit;
  providerId: string;
}

export interface ExecuteWorkflowTextRequestOptions extends ProviderPresetFields {
  emit?: WorkflowEmit;
  maxTokens?: number;
  messages: ChatMessage[];
  model?: string;
  onDelta?: (delta: string, accumulated: string) => void;
  providerId: string;
  temperature?: number;
}

export interface ExecuteWorkflowChatRequestOptions extends ProviderPresetFields {
  emit?: WorkflowEmit;
  maxTokens?: number;
  messages: WorkflowChatMessage[];
  model?: string;
  onDelta?: (delta: string, accumulated: string) => void;
  providerId: string;
  temperature?: number;
}

export interface ExecuteWorkflowImageGenerationRequestOptions extends ImageGenerationRequest {
  emit?: WorkflowEmit;
}

let piExecutionService: PiExecutionService | undefined;

function getPiExecutionService(): PiExecutionService {
  piExecutionService ||= new PiExecutionService();
  return piExecutionService;
}

export function getWorkflowProviderPresetId(config?: NodeConfig): string | undefined {
  return resolveProviderPresetId({
    providerPresetId: typeof config?.providerPresetId === 'string' ? config.providerPresetId : undefined
  });
}

export async function getProviderOptions(capability?: ProviderCapabilityKey): Promise<{ value: string; label: string }[]> {
  try {
    return listProviderDefinitions()
      .filter((definition) => !capability || getProviderCapabilities(definition.id)[capability])
      .map((definition) => ({ value: definition.id, label: definition.display.label }));
  } catch {
    return [];
  }
}

export async function getDynamicModelConfig(options: DynamicModelConfigOptions): Promise<PortSchema[]> {
  const { defaultProviderId = '', emptyModelDescription, modelDescription, modelLabel, modelPredicate, providerCapability, providerId, required = true, warningScope } = options;
  const resolvedProviderPresetId = resolveProviderPresetId(options);
  const selectedPreset = getPreset(resolvedProviderPresetId);
  const resolvedProviderId = selectedPreset?.providerId || providerId;

  const config: PortSchema[] = [
    {
      key: 'providerId',
      label: '服务商',
      type: 'string',
      required: true,
      default: defaultProviderId,
      description: '选择AI服务商',
      inputType: 'select',
      options: await getProviderOptions(providerCapability)
    }
  ];

  config.push({
    key: 'providerPresetId',
    label: '服务预设',
    type: 'string',
    required: false,
    default: resolvedProviderPresetId || '',
    description: resolvedProviderId ? '可选：选择一个服务预设，复用它的系统提示词和秘钥配置' : '请先选择服务商',
    inputType: 'select',
    options: getProviderPresetOptions(resolvedProviderId),
    searchable: true
  });

  if (resolvedProviderId) {
    const models = await loadProviderModels(resolvedProviderId, modelPredicate, warningScope);
    const defaultModelValue = resolveDefaultWorkflowModel(models);

    if (models.length > 0) {
      config.push({
        key: 'model',
        label: modelLabel,
        type: 'string',
        required,
        default: defaultModelValue,
        description: modelDescription,
        inputType: 'select',
        options: models
      });
    } else {
      config.push({
        key: 'model',
        label: modelLabel,
        type: 'string',
        required,
        default: '',
        description: emptyModelDescription,
        inputType: 'select',
        options: []
      });
    }
  } else {
    config.push({
      key: 'model',
      label: modelLabel,
      type: 'string',
      required,
      default: '',
      description: '请先选择服务商',
      inputType: 'select',
      options: []
    });
  }

  return config;
}

function getProviderPresetOptions(providerId?: string): Array<{ value: string; label: string; description?: string }> {
  const baseOption = {
    value: '',
    label: '直接使用服务商配置',
    description: providerId ? '不使用服务预设，直接使用当前服务商配置' : '请先选择服务商'
  };

  if (!providerId) {
    return [baseOption];
  }

  const presets = listPresets(providerId)
    .slice()
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map((preset) => ({
      value: preset.id,
      label: preset.name,
      description: preset.providerId
    }));

  return [baseOption, ...presets];
}

export async function resolveWorkflowProviderContext(reference: WorkflowProviderReference): Promise<WorkflowProviderContext> {
  const { getProvider } = await import('../../ai/registry');
  const { emit, providerId } = reference;
  const resolvedProviderPresetId = resolveProviderPresetId(reference);
  const providerPreset = getPreset(resolvedProviderPresetId);
  const resolvedProviderId = providerPreset?.providerId || providerId;
  const provider = getProvider(resolvedProviderId);

  if (!provider) {
    throw new Error(`未找到服务商: ${resolvedProviderId}`);
  }

  const keys = listProviderSecretKeys(provider.id);
  const providerSecrets = await getAllSecrets(provider.id, keys);
  const presetSecrets = await getPresetSecrets(resolvedProviderPresetId, keys);
  const secrets = {
    ...providerSecrets,
    ...presetSecrets
  };
  const apiKey = getFirstApiKey(secrets.apiKey);

  if (!apiKey) {
    emit?.('ai:missing-provider', {
      providerId: resolvedProviderId,
      fields: ['apiKey']
    });
    throw new Error(`服务商 ${resolvedProviderId} 未配置必要秘钥（例如 API Key），已弹出配置窗口，请完成配置后重试。`);
  }

  return {
    provider,
    secrets
  };
}

export async function executeWorkflowTextRequest(options: ExecuteWorkflowTextRequestOptions): Promise<{ runtime: 'legacy' | 'pi'; text: string }> {
  return executeWorkflowChatRequest({
    ...options,
    messages: options.messages as WorkflowChatMessage[]
  });
}

export async function executeWorkflowChatRequest(options: ExecuteWorkflowChatRequestOptions): Promise<{ runtime: 'legacy' | 'pi'; text: string }> {
  const normalizedOptions = normalizeProviderPreset(options);
  const { emit, maxTokens, messages, model, onDelta, providerId, temperature } = normalizedOptions;
  const resolvedProviderPresetId = resolveProviderPresetId(normalizedOptions);
  const request: ChatRequest = normalizeProviderPreset({
    agentId: 'chat',
    extras: model
      ? {
          model
        }
      : undefined,
    maxTokens,
    messages: messages as ChatMessage[],
    persist: false,
    providerId,
    providerPresetId: resolvedProviderPresetId,
    temperature
  });
  const availability = getPiExecutionService().getAvailability(request);

  if (availability.available) {
    try {
      const text = onDelta ? await getPiExecutionService().streamText(request, onDelta) : await getPiExecutionService().completeText(request);
      return {
        runtime: 'pi',
        text
      };
    } catch (error) {
      if (isMissingWorkflowProviderConfigError(error)) {
        await resolveWorkflowProviderContext({ emit, providerId, providerPresetId: resolvedProviderPresetId }).catch(() => undefined);
      }

      throw error;
    }
  }

  const { provider, secrets } = await resolveWorkflowProviderContext({ emit, providerId, providerPresetId: resolvedProviderPresetId });

  if (!provider.chat) {
    throw new Error(availability.reason || `服务商 ${providerId} 不支持对话功能`);
  }

  let accumulatedText = '';
  const response = await provider.chat(
    {
      ...request,
      extras: {
        ...(request.extras || {}),
        secrets
      },
      messages: messages.map((message) => ({
        ...message,
        content: toLegacyMessageContent(message.content)
      })) as ChatMessage[],
      stream: Boolean(onDelta)
    },
    onDelta
      ? (event) => {
          if (event.type === 'delta' && event.data.text) {
            accumulatedText += event.data.text;
            onDelta(event.data.text, accumulatedText);
          }
        }
      : undefined
  );

  return {
    runtime: 'legacy',
    text: response.message?.content || accumulatedText
  };
}

export async function executeWorkflowImageGenerationRequest(options: ExecuteWorkflowImageGenerationRequestOptions): Promise<{ imageUrl: string }> {
  const normalizedOptions = normalizeProviderPreset(options);
  const { emit, model, prompt, providerId, quality, size } = normalizedOptions;
  const resolvedProviderPresetId = resolveProviderPresetId(normalizedOptions);

  try {
    return await getPiExecutionService().generateImage(
      normalizeProviderPreset({
        model,
        prompt,
        providerId,
        providerPresetId: resolvedProviderPresetId,
        quality,
        size
      })
    );
  } catch (error) {
    if (isMissingWorkflowProviderConfigError(error)) {
      await resolveWorkflowProviderContext({ emit, providerId, providerPresetId: resolvedProviderPresetId }).catch(() => undefined);
    }

    throw error;
  }
}

export function readImageAsRichContent(imagePath: string): Extract<WorkflowRichContentPart, { type: 'image' }> {
  const imageBuffer = fs.readFileSync(imagePath);
  return {
    data: imageBuffer.toString('base64'),
    mimeType: getImageMimeType(imagePath),
    type: 'image'
  };
}

async function loadProviderModels(providerId: string, predicate: (model: ModelRecord) => boolean, warningScope: string): Promise<Array<{ value: string; label: string }>> {
  try {
    const models = await listProviderRuntimeModels(providerId);
    return models.filter(predicate).map((model) => ({
      value: model.id,
      label: (model.label || model.id) + (model.description ? ` - ${model.description}` : '') + (model.free ? ' (免费)' : '')
    }));
  } catch (error) {
    console.warn(`[${warningScope}] Failed to load models for provider ${providerId}:`, error);
    return [];
  }
}

function getImageMimeType(imagePath: string): string {
  const ext = path.extname(imagePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.bmp': 'image/bmp',
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp'
  };
  return mimeMap[ext] || 'image/jpeg';
}

function isMissingWorkflowProviderConfigError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /missing api key|未配置.*api key|未配置必要秘钥|未配置 API Key/i.test(message);
}

function resolveDefaultWorkflowModel(models: Array<{ value: string; label: string }>): string {
  return models[0]?.value || '';
}

function toLegacyMessageContent(content: WorkflowMessageContent): string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> {
  if (typeof content === 'string') {
    return content;
  }

  return content.map((block) => {
    if (block.type === 'text') {
      return {
        text: block.text,
        type: 'text' as const
      };
    }

    return {
      image_url: {
        url: `data:${block.mimeType};base64,${block.data}`
      },
      type: 'image_url' as const
    };
  });
}
