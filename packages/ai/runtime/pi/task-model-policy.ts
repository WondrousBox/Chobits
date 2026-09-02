import type { CreatePiTaskRuntimeRequest } from './task-chat';

const NON_REASONING_TASK_MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  deepseek: 'deepseek-chat',
  gemini: 'gemini-2.0-flash',
  kimi: 'kimi-k2.6',
  openai: 'gpt-4o-mini',
  qwen: 'qwen-turbo',
  zai: 'glm-4.5-air',
  zhipu: 'glm-4-flash'
};

export interface ResolveNonReasoningTaskModelOptions {
  preferredModel?: string;
  fallbackModel?: string;
}

export type NonReasoningTaskModelStrategy = 'prefer-fast' | 'preserve';

export function resolveNonReasoningTaskModel(providerId: string, options: ResolveNonReasoningTaskModelOptions = {}): string | undefined {
  const preferredModel = options.preferredModel?.trim();
  if (preferredModel) {
    return preferredModel;
  }

  const mappedModel = NON_REASONING_TASK_MODELS[providerId];
  if (mappedModel) {
    return mappedModel;
  }

  const fallbackModel = options.fallbackModel?.trim();
  return fallbackModel || undefined;
}

function stripReasoningExtras(extras?: Record<string, any>): Record<string, any> | undefined {
  if (!extras) {
    return undefined;
  }

  const { reasoning, thinking, ...rest } = extras;
  return Object.keys(rest).length ? rest : undefined;
}

export function buildNonReasoningTaskRuntimeRequest(request: CreatePiTaskRuntimeRequest, options: { modelStrategy?: NonReasoningTaskModelStrategy } = {}): CreatePiTaskRuntimeRequest {
  const { extras, model, ...rest } = request;
  const sanitizedExtras = stripReasoningExtras(extras);
  const strategy = options.modelStrategy || 'preserve';
  const resolvedModel =
    strategy === 'prefer-fast'
      ? resolveNonReasoningTaskModel(request.providerId, {
          preferredModel: model
        })
      : model?.trim() || undefined;

  return {
    ...rest,
    ...(sanitizedExtras ? { extras: sanitizedExtras } : {}),
    ...(resolvedModel ? { model: resolvedModel } : {})
  };
}
