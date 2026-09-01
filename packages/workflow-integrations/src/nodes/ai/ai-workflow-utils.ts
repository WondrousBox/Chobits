import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { ExecutionContext, NodeConfig, PortSchema } from '@chobits/workflow';

import { emitAiUsageObservedEvent } from '../../../../ai/analytics/events';
import type { RecordAiUsageEventInput } from '../../../../ai/analytics/types';
import { getPreset, getPresetSecrets, listPresets } from '../../../../ai/preset-service';
import { normalizeProviderPreset, resolveProviderPresetId } from '../../../../ai/provider-preset';
import { getProviderCapabilities, listProviderDefinitions, listProviderRuntimeModels, listProviderSecretKeys } from '../../../../ai/providers/service';
import { PiExecutionService } from '../../../../ai/runtime/pi/execution-service';
import { getAllSecrets, getFirstApiKey } from '../../../../ai/settings-store';
import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ImageGenerationRequest,
  LyricsGenerationRequest,
  LyricsGenerationResponse,
  MusicGenerationRequest,
  MusicGenerationResponse,
  ProviderAdapter,
  ProviderCapabilityKey,
  ProviderPresetFields,
  ProviderSecrets,
  TokenUsage
} from '../../../../ai/types';

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
  defaultModel?: string;
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
  signal?: AbortSignal;
  temperature?: number;
  workflowAiUsage?: WorkflowAiUsageContext;
}

export interface ExecuteWorkflowChatRequestOptions extends ProviderPresetFields {
  emit?: WorkflowEmit;
  maxTokens?: number;
  messages: WorkflowChatMessage[];
  model?: string;
  onDelta?: (delta: string, accumulated: string) => void;
  providerId: string;
  signal?: AbortSignal;
  temperature?: number;
  workflowAiUsage?: WorkflowAiUsageContext;
}

export interface ExecuteWorkflowImageGenerationRequestOptions extends ImageGenerationRequest {
  emit?: WorkflowEmit;
  signal?: AbortSignal;
  workflowAiUsage?: WorkflowAiUsageContext;
}

export interface ExecuteWorkflowMusicGenerationRequestOptions extends MusicGenerationRequest {
  emit?: WorkflowEmit;
  signal?: AbortSignal;
  workflowAiUsage?: WorkflowAiUsageContext;
}

export interface ExecuteWorkflowLyricsGenerationRequestOptions extends LyricsGenerationRequest {
  emit?: WorkflowEmit;
  signal?: AbortSignal;
  workflowAiUsage?: WorkflowAiUsageContext;
}

export type WorkflowAiUsageStage = 'analyze' | 'generate' | 'classify' | 'extract' | 'merge' | 'postprocess';

export interface WorkflowAiUsageContext {
  operationKey: string;
  usageStage: WorkflowAiUsageStage;
  workflowId?: string;
  workflowName?: string;
  workflowAttempt?: number;
  workflowNodeId?: string;
  workflowNodeLabel?: string;
  workflowNodeType?: string;
  workflowRunId?: string;
}

let piExecutionService: PiExecutionService | undefined;

function getPiExecutionService(): PiExecutionService {
  piExecutionService ||= new PiExecutionService();
  return piExecutionService;
}

function safeUuid(): string {
  try {
    return randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function toAnalyticsUsage(usage?: TokenUsage): RecordAiUsageEventInput['usage'] | undefined {
  if (!usage) {
    return undefined;
  }

  return {
    billableInputTokens: usage.billableInputTokens,
    billableOutputTokens: usage.billableOutputTokens,
    billableTotalTokens: usage.billableTotalTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    estimatedCost: usage.cost,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
    totalTokens: usage.totalTokens
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function buildWorkflowAnalyticsUsage(context?: WorkflowAiUsageContext): Record<string, unknown> | undefined {
  if (!context) {
    return undefined;
  }

  const sourceId = context.workflowNodeId || context.workflowNodeType || context.workflowRunId || 'workflow-ai';
  const sourceLabel = context.workflowNodeLabel || context.workflowNodeType || '工作流 AI';

  return {
    metadata: {
      workflowId: context.workflowId || null,
      workflowName: context.workflowName || null,
      workflowAttempt: context.workflowAttempt || null,
      workflowNodeId: context.workflowNodeId || null,
      workflowNodeLabel: context.workflowNodeLabel || null,
      workflowNodeType: context.workflowNodeType || null,
      workflowRunId: context.workflowRunId || null
    },
    operationKey: context.operationKey,
    sourceId,
    sourceLabel,
    sourceType: 'workflow',
    usageCategory: 'workflow',
    usageFeature: 'workflow_ai',
    usageStage: context.usageStage
  };
}

function buildWorkflowRequestId(context?: WorkflowAiUsageContext): string | undefined {
  if (!context) {
    return undefined;
  }

  const parts = [context.workflowRunId, context.workflowNodeId || context.workflowNodeType, context.workflowAttempt ? `attempt-${context.workflowAttempt}` : undefined, context.operationKey].filter(
    (part): part is string => typeof part === 'string' && part.trim().length > 0
  );

  return parts.length ? parts.join(':') : undefined;
}

function extractWorkflowRawUsage(response?: ChatResponse): unknown {
  const metadata = response?.metadata;
  if (isPlainRecord(metadata)) {
    if ('rawUsage' in metadata) {
      return metadata.rawUsage;
    }
    if ('piRawUsage' in metadata) {
      return metadata.piRawUsage;
    }
  }

  const messageMetadata = response?.message?.metadata;
  if (isPlainRecord(messageMetadata)) {
    if ('rawUsage' in messageMetadata) {
      return messageMetadata.rawUsage;
    }
    if ('piRawUsage' in messageMetadata) {
      return messageMetadata.piRawUsage;
    }
  }

  return undefined;
}

async function recordWorkflowUsageEventSafely(input: RecordAiUsageEventInput): Promise<void> {
  const workflowAttempt = input.metadata?.workflowAttempt;
  const attemptIndex = typeof workflowAttempt === 'number' && Number.isInteger(workflowAttempt) && workflowAttempt > 0 ? workflowAttempt - 1 : undefined;
  await emitAiUsageObservedEvent({ ...input, ...(input.attemptIndex === undefined && attemptIndex !== undefined ? { attemptIndex } : {}) }, { producer: 'WorkflowAI' });
}

export function buildWorkflowAiUsageContext(
  ctx: Pick<ExecutionContext, 'workflowId' | 'workflowName' | 'workflowNodeId' | 'workflowNodeLabel' | 'workflowNodeType' | 'workflowRunId' | 'workflowAttempt'>,
  defaults: {
    nodeLabel: string;
    nodeType: string;
    operationKey: string;
    usageStage: WorkflowAiUsageStage;
  }
): WorkflowAiUsageContext {
  return {
    operationKey: defaults.operationKey,
    usageStage: defaults.usageStage,
    workflowId: ctx.workflowId,
    workflowName: ctx.workflowName,
    workflowAttempt: ctx.workflowAttempt,
    workflowNodeId: ctx.workflowNodeId,
    workflowNodeLabel: ctx.workflowNodeLabel || defaults.nodeLabel,
    workflowNodeType: ctx.workflowNodeType || defaults.nodeType,
    workflowRunId: ctx.workflowRunId
  };
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
  const { defaultModel, defaultProviderId = '', emptyModelDescription, modelDescription, modelLabel, modelPredicate, providerCapability, providerId, required = true, warningScope } = options;
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
    const defaultModelValue = resolveDefaultWorkflowModel(models, defaultModel);

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
  const { getProvider } = await import('../../../../ai/registry');
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
  const { emit, maxTokens, messages, model, onDelta, providerId, signal, temperature, workflowAiUsage } = normalizedOptions;
  const resolvedProviderPresetId = resolveProviderPresetId(normalizedOptions);
  const analyticsUsage = buildWorkflowAnalyticsUsage(workflowAiUsage);
  const requestId = buildWorkflowRequestId(workflowAiUsage);
  const request: ChatRequest = normalizeProviderPreset({
    agentId: 'chat',
    extras: {
      ...(model ? { model } : {}),
      ...(analyticsUsage ? { analyticsUsage } : {})
    },
    maxTokens,
    messages: messages as ChatMessage[],
    persist: false,
    providerId,
    providerPresetId: resolvedProviderPresetId,
    requestId,
    temperature
  });
  const availability = getPiExecutionService().getAvailability(request);

  if (availability.available) {
    try {
      const text = onDelta ? await getPiExecutionService().streamText(request, onDelta, signal) : await getPiExecutionService().completeText(request, signal);
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
  const legacyRequestId = request.requestId || safeUuid();
  const startedAt = Date.now();

  try {
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
        requestId: legacyRequestId,
        stream: Boolean(onDelta)
      },
      onDelta
        ? (event) => {
            if (event.type === 'delta' && event.data.text) {
              accumulatedText += event.data.text;
              onDelta(event.data.text, accumulatedText);
            }
          }
        : undefined,
      signal
    );

    if (workflowAiUsage) {
      await recordWorkflowUsageEventSafely({
        traceId: workflowAiUsage.workflowRunId || legacyRequestId,
        requestId: legacyRequestId,
        operationKey: workflowAiUsage.operationKey,
        sourceType: 'workflow',
        sourceId: workflowAiUsage.workflowNodeId || workflowAiUsage.workflowNodeType || legacyRequestId,
        sourceLabel: workflowAiUsage.workflowNodeLabel || workflowAiUsage.workflowNodeType || '工作流 AI',
        usageCategory: 'workflow',
        usageFeature: 'workflow_ai',
        usageStage: workflowAiUsage.usageStage,
        providerId: response.providerId || provider.id,
        providerPresetId: resolvedProviderPresetId,
        model: model || 'unknown',
        agentId: 'workflow',
        status: 'completed',
        usage: toAnalyticsUsage(response.usage),
        rawUsage: extractWorkflowRawUsage(response),
        meteringSource: 'provider_reported',
        startedAt,
        completedAt: Date.now(),
        metadata: {
          runtime: 'legacy',
          workflowId: workflowAiUsage.workflowId || null,
          workflowName: workflowAiUsage.workflowName || null,
          workflowAttempt: workflowAiUsage.workflowAttempt || null,
          workflowNodeId: workflowAiUsage.workflowNodeId || null,
          workflowNodeLabel: workflowAiUsage.workflowNodeLabel || null,
          workflowNodeType: workflowAiUsage.workflowNodeType || null,
          workflowRunId: workflowAiUsage.workflowRunId || null
        }
      });
    }

    return {
      runtime: 'legacy',
      text: response.message?.content || accumulatedText
    };
  } catch (error) {
    if (workflowAiUsage) {
      await recordWorkflowUsageEventSafely({
        traceId: workflowAiUsage.workflowRunId || legacyRequestId,
        requestId: legacyRequestId,
        operationKey: workflowAiUsage.operationKey,
        sourceType: 'workflow',
        sourceId: workflowAiUsage.workflowNodeId || workflowAiUsage.workflowNodeType || legacyRequestId,
        sourceLabel: workflowAiUsage.workflowNodeLabel || workflowAiUsage.workflowNodeType || '工作流 AI',
        usageCategory: 'workflow',
        usageFeature: 'workflow_ai',
        usageStage: workflowAiUsage.usageStage,
        providerId: provider.id,
        providerPresetId: resolvedProviderPresetId,
        model: model || 'unknown',
        agentId: 'workflow',
        status: signal?.aborted ? 'cancelled' : 'failed',
        meteringSource: 'provider_reported',
        startedAt,
        completedAt: Date.now(),
        metadata: {
          errorMessage: error instanceof Error ? error.message : String(error),
          runtime: 'legacy',
          workflowId: workflowAiUsage.workflowId || null,
          workflowName: workflowAiUsage.workflowName || null,
          workflowAttempt: workflowAiUsage.workflowAttempt || null,
          workflowNodeId: workflowAiUsage.workflowNodeId || null,
          workflowNodeLabel: workflowAiUsage.workflowNodeLabel || null,
          workflowNodeType: workflowAiUsage.workflowNodeType || null,
          workflowRunId: workflowAiUsage.workflowRunId || null
        }
      });
    }

    throw error;
  }
}

export async function executeWorkflowImageGenerationRequest(options: ExecuteWorkflowImageGenerationRequestOptions): Promise<{ imageUrl: string }> {
  const normalizedOptions = normalizeProviderPreset(options);
  const { emit, model, prompt, providerId, quality, signal, size, workflowAiUsage } = normalizedOptions;
  const resolvedProviderPresetId = resolveProviderPresetId(normalizedOptions);
  const analyticsUsage = buildWorkflowAnalyticsUsage(workflowAiUsage);
  const requestId = buildWorkflowRequestId(workflowAiUsage);

  try {
    return await getPiExecutionService().generateImage(
      normalizeProviderPreset({
        extras: {
          ...(analyticsUsage ? { analyticsUsage } : {}),
          ...(requestId ? { requestId } : {})
        },
        model,
        prompt,
        providerId,
        providerPresetId: resolvedProviderPresetId,
        quality,
        size
      }),
      signal
    );
  } catch (error) {
    if (isMissingWorkflowProviderConfigError(error)) {
      await resolveWorkflowProviderContext({ emit, providerId, providerPresetId: resolvedProviderPresetId }).catch(() => undefined);
    }

    throw error;
  }
}

export async function executeWorkflowMusicGenerationRequest(options: ExecuteWorkflowMusicGenerationRequestOptions): Promise<MusicGenerationResponse> {
  const normalizedOptions = normalizeProviderPreset(options);
  const { emit, model, prompt, providerId, signal, workflowAiUsage, ...requestOptions } = normalizedOptions;
  const resolvedProviderPresetId = resolveProviderPresetId(normalizedOptions);
  const analyticsUsage = buildWorkflowAnalyticsUsage(workflowAiUsage);
  const requestId = buildWorkflowRequestId(workflowAiUsage);

  try {
    return await getPiExecutionService().generateMusic(
      normalizeProviderPreset({
        ...requestOptions,
        extras: {
          ...(normalizedOptions.extras || {}),
          ...(analyticsUsage ? { analyticsUsage } : {}),
          ...(requestId ? { requestId } : {})
        },
        model,
        prompt,
        providerId,
        providerPresetId: resolvedProviderPresetId
      }),
      signal
    );
  } catch (error) {
    if (isMissingWorkflowProviderConfigError(error)) {
      await resolveWorkflowProviderContext({ emit, providerId, providerPresetId: resolvedProviderPresetId }).catch(() => undefined);
    }

    throw error;
  }
}

export async function executeWorkflowLyricsGenerationRequest(options: ExecuteWorkflowLyricsGenerationRequestOptions): Promise<LyricsGenerationResponse> {
  const normalizedOptions = normalizeProviderPreset(options);
  const { emit, lyrics, mode, prompt, providerId, signal, workflowAiUsage, ...requestOptions } = normalizedOptions;
  const resolvedProviderPresetId = resolveProviderPresetId(normalizedOptions);
  const analyticsUsage = buildWorkflowAnalyticsUsage(workflowAiUsage);
  const requestId = buildWorkflowRequestId(workflowAiUsage);

  try {
    return await getPiExecutionService().generateLyrics(
      normalizeProviderPreset({
        extras: {
          ...(requestOptions.extras || {}),
          ...(analyticsUsage ? { analyticsUsage } : {}),
          ...(requestId ? { requestId } : {})
        },
        lyrics,
        mode,
        prompt,
        providerId,
        providerPresetId: resolvedProviderPresetId
      }),
      signal
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

function resolveDefaultWorkflowModel(models: Array<{ value: string; label: string }>, preferredModel?: string): string {
  const preferred = String(preferredModel || '').trim();
  if (preferred && models.some((model) => model.value === preferred)) {
    return preferred;
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
