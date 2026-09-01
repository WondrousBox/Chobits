import { getProviderDefinitionModel } from './providers/service';
import type { ChatMessage, ChatRequestExtras } from './types';

const REALTIME_SPEECH_SYSTEM_PROMPT_NAME = 'provider_realtime_speech_guidance';

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function trimString(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
}

function readSpeechSynthesisPromptGuidance(providerId?: string, modelId?: string): string | undefined {
  const model = getProviderDefinitionModel(providerId, modelId);
  const speechSynthesis = isRecord(model?.speechSynthesis) ? model.speechSynthesis : undefined;
  const guidance = speechSynthesis?.realtimeSpeechPromptGuidance ?? speechSynthesis?.promptGuidance;
  return trimString(guidance);
}

export function getRealtimeSpeechPromptGuidance(extras?: ChatRequestExtras): string | undefined {
  const realtimeSpeech = isRecord(extras?.realtimeSpeech) ? extras?.realtimeSpeech : undefined;
  if (!realtimeSpeech?.enabled) return undefined;

  return readSpeechSynthesisPromptGuidance(trimString(realtimeSpeech.providerId), trimString(realtimeSpeech.model));
}

export function appendRealtimeSpeechPromptGuidance(messages: ChatMessage[], extras?: ChatRequestExtras): ChatMessage[] {
  const guidance = getRealtimeSpeechPromptGuidance(extras);
  if (!guidance) return messages;

  if (messages.some((message) => message.role === 'system' && message.name === REALTIME_SPEECH_SYSTEM_PROMPT_NAME)) {
    return messages;
  }

  let insertAt = 0;
  for (let index = 0; index < messages.length; index += 1) {
    if (messages[index].role === 'system') {
      insertAt = index + 1;
    }
  }
  const systemMessage: ChatMessage = {
    content: guidance,
    metadata: {
      source: 'realtime-speech-provider-guidance'
    },
    name: REALTIME_SPEECH_SYSTEM_PROMPT_NAME,
    role: 'system'
  };

  return [...messages.slice(0, insertAt), systemMessage, ...messages.slice(insertAt)];
}
