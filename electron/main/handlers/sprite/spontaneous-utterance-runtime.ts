import type { CreatePiTaskRuntimeRequest } from '../../../../packages/ai/runtime/pi/task-chat';

export type SpontaneousUtteranceRuntimeContext = {
  providerId: string;
  providerPresetId?: string;
  workspaceId?: string;
};

export const SPONTANEOUS_UTTERANCE_MAX_TOKENS = 260;
export const SPONTANEOUS_UTTERANCE_TEMPERATURE = 0.9;

export function buildSpontaneousUtteranceRuntimeRequest(context: SpontaneousUtteranceRuntimeContext): CreatePiTaskRuntimeRequest {
  return {
    agentId: 'chat',
    ...(context.workspaceId ? { extras: { workspaceId: context.workspaceId } } : {}),
    maxTokens: SPONTANEOUS_UTTERANCE_MAX_TOKENS,
    providerId: context.providerId,
    providerPresetId: context.providerPresetId,
    // Keep idle utterances in non-reasoning mode. On Z.ai/GLM-compatible
    // endpoints, any reasoning level flips provider-side thinking on.
    temperature: SPONTANEOUS_UTTERANCE_TEMPERATURE
  };
}
