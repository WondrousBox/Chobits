import { extractToolSpeechFromResult, normalizeToolSpeech } from '@packages/ai/tool-speech';
import type { ToolSpeech } from '@packages/ai/types';

function readToolResultSpeech(data: any): ToolSpeech | undefined {
  return normalizeToolSpeech(data?.speech) || extractToolSpeechFromResult(data?.result);
}

export interface SpeakToolResultSpeechOptions {
  suppress?: boolean;
}

export function speakToolResultSpeech(data: any, options?: SpeakToolResultSpeechOptions): void {
  if (options?.suppress) return;

  const speech = readToolResultSpeech(data);
  if (!speech || typeof window === 'undefined') return;

  const speak = window.chobits?.sprite?.speak;
  if (typeof speak !== 'function') return;

  const run = (): void => {
    void speak(speech.text, {
      bubbleDuration: speech.bubbleDuration,
      bubbleEnabled: speech.bubbleEnabled
    }).catch((error: unknown) => {
      console.warn('[tool-speech] Failed to speak tool result:', error);
    });
  };

  if (speech.delayMs && speech.delayMs > 0) {
    window.setTimeout(run, speech.delayMs);
    return;
  }

  run();
}
