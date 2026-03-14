import fs from 'node:fs';
import path from 'node:path';

import { PresetsStore } from '../../ai/instances-store';
import { getProviderCapabilities } from '../../ai/providers/metadata';
import { PiExecutionService } from '../../ai/runtime/pi/execution-service';
import { getAllPresetSecrets, getAllSecrets, getFirstApiKey } from '../../ai/settings-store';
import type { ChatMessage, ChatRequest, ProviderAdapter, ProviderCapabilityKey, ProviderSecrets } from '../../ai/types';
import type { PortSchema } from '../types';

type ModelRecord = {
  capabilities?: Record<string, any>;
  description?: string;
  free?: boolean;
  id: string;
  label: string;
  type?: string;
};

type WorkflowEmit = (event: string, payload?: any) => void;

export type WorkflowRichContentPart = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
export type WorkflowMessageContent = string | WorkflowRichContentPart[];
export type WorkflowChatMessage = Omit<ChatMessage, 'content'> & { content: WorkflowMessageContent };

export interface DynamicModelConfigOptions {
  defaultProviderId?: string;
  emptyModelDescription: string;
  modelDescription: string;
  modelLabel: string;
  modelPredicate: (model: ModelRecord) => boolean;
  providerCapability?: ProviderCapabilityKey;
  providerId?: string;
  providerInstanceId?: string;
  required?: boolean;
  warningScope: string;
}

export interface WorkflowProviderContext {
  provider: ProviderAdapter;
  secrets: ProviderSecrets;
}

export interface ExecuteWorkflowTextRequestOptions {
  emit?: WorkflowEmit;
  maxTokens?: number;
  messages: ChatMessage[];
  model?: string;
  onDelta?: (delta: string, accumulated: string) => void;
  providerId: string;
  providerInstanceId?: string;
  temperature?: number;
}

export interface ExecuteWorkflowChatRequestOptions {
  emit?: WorkflowEmit;
  maxTokens?: number;
  messages: WorkflowChatMessage[];
  model?: string;
  onDelta?: (delta: string, accumulated: string) => void;
  providerId: string;
  providerInstanceId?: string;
  temperature?: number;
}

export interface ExecuteWorkflowImageGenerationRequestOptions {
  emit?: WorkflowEmit;
  model: string;
  prompt: string;
  providerId: string;
  providerInstanceId?: string;
  quality?: string;
  size?: string;
}

let piExecutionService: PiExecutionService | undefined;

function getPiExecutionService(): PiExecutionService {
  piExecutionService ||= new PiExecutionService();
  return piExecutionService;
}

export async function getProviderOptions(capability?: ProviderCapabilityKey): Promise<{ value: string; label: string }[]> {
  try {
    const { listProviders } = await import('../../ai/registry');
    return listProviders()
      .filter((provider) => !capability || getProviderCapabilities(provider.id, provider)[capability])
      .map((provider) => ({ value: provider.id, label: provider.label }));
  } catch {
    return [];
  }
}

export async function getDynamicModelConfig(options: DynamicModelConfigOptions): Promise<PortSchema[]> {
  const { defaultProviderId = '', emptyModelDescription, modelDescription, modelLabel, modelPredicate, providerCapability, providerId, providerInstanceId, required = true, warningScope } = options;
  const selectedPreset = providerInstanceId ? PresetsStore.get(providerInstanceId) : undefined;
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
    key: 'providerInstanceId',
    label: '服务预设',
    type: 'string',
    required: false,
    default: '',
    description: resolvedProviderId ? '可选：选择一个服务预设，复用它的模型、系统提示词和秘钥配置' : '请先选择服务商',
    inputType: 'select',
    options: getProviderPresetOptions(resolvedProviderId),
    searchable: true
  });

  if (resolvedProviderId) {
    const models = await loadProviderModels(resolvedProviderId, modelPredicate, warningScope);
    const defaultModelValue = resolveDefaultWorkflowModel(models, selectedPreset?.model);

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

  const presets = PresetsStore.list(providerId)
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((preset) => ({
      value: preset.id,
      label: preset.name,
      description: preset.model ? `${preset.providerId} / ${preset.model}` : preset.providerId
    }));

  return [baseOption, ...presets];
}

export async function resolveWorkflowProviderContext(providerId: string, emit?: WorkflowEmit, providerInstanceId?: string): Promise<WorkflowProviderContext> {
  const { getProvider } = await import('../../ai/registry');
  const providerPreset = providerInstanceId ? PresetsStore.get(providerInstanceId) : undefined;
  const resolvedProviderId = providerPreset?.providerId || providerId;
  const provider = getProvider(resolvedProviderId);

  if (!provider) {
    throw new Error(`未找到服务商: ${resolvedProviderId}`);
  }

  const schema = provider.getConfigSchema?.();
  const keys = (schema?.fields || []).map((field) => field.key);
  const providerSecrets = await getAllSecrets(provider.id, keys);
  const presetSecrets = providerInstanceId ? await getAllPresetSecrets(providerInstanceId, keys) : {};
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
  const { emit, maxTokens, messages, model, onDelta, providerId, providerInstanceId, temperature } = options;
  const request: ChatRequest = {
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
    providerInstanceId,
    temperature
  };
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
        await resolveWorkflowProviderContext(providerId, emit, providerInstanceId).catch(() => undefined);
      }

      throw error;
    }
  }

  const { provider, secrets } = await resolveWorkflowProviderContext(providerId, emit, providerInstanceId);

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
  const { emit, model, prompt, providerId, providerInstanceId, quality, size } = options;

  try {
    return await getPiExecutionService().generateImage({
      model,
      prompt,
      providerId,
      providerInstanceId,
      quality,
      size
    });
  } catch (error) {
    if (isMissingWorkflowProviderConfigError(error)) {
      await resolveWorkflowProviderContext(providerId, emit, providerInstanceId).catch(() => undefined);
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
    const modelsPath = path.join(process.env.APP_ROOT || process.cwd(), 'resources', 'providers', `${providerId}.models.json`);

    if (!fs.existsSync(modelsPath)) {
      return [];
    }

    const modelsData = JSON.parse(fs.readFileSync(modelsPath, 'utf8')) as { models?: ModelRecord[] };
    return (modelsData.models || []).filter(predicate).map((model) => ({
      value: model.id,
      label: model.label + (model.description ? ` - ${model.description}` : '') + (model.free ? ' (免费)' : '')
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

function resolveDefaultWorkflowModel(models: Array<{ value: string; label: string }>, preferredModelId?: string): string {
  const trimmedPreferredModel = preferredModelId?.trim();
  if (trimmedPreferredModel && models.some((model) => model.value === trimmedPreferredModel)) {
    return trimmedPreferredModel;
  }

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
