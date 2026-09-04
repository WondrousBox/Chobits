import type { CreatePiTaskRuntimeRequest } from '../../../../packages/ai/runtime/pi/task-chat';
import { buildNonReasoningTaskRuntimeRequest } from '../../../../packages/ai/runtime/pi/task-model-policy';

export type SpontaneousUtteranceRuntimeContext = {
  providerId: string;
  providerPresetId?: string;
};

export const SPONTANEOUS_UTTERANCE_MAX_TOKENS = 260;
export const SPONTANEOUS_UTTERANCE_TEMPERATURE = 0.9;

export function buildSpontaneousUtteranceRuntimeRequest(context: SpontaneousUtteranceRuntimeContext): CreatePiTaskRuntimeRequest {
  return buildNonReasoningTaskRuntimeRequest({
    agentId: 'chat',
    maxTokens: SPONTANEOUS_UTTERANCE_MAX_TOKENS,
    providerId: context.providerId,
    providerPresetId: context.providerPresetId,
    // Keep idle utterances in non-reasoning mode without forcing a different
    // model. This preserves the preset/provider default model quality.
    temperature: SPONTANEOUS_UTTERANCE_TEMPERATURE
  });
}
