import { extractToolSpeechFromResult, normalizeToolSpeech } from '@packages/ai/tool-speech';
import type { ToolSpeech } from '@packages/ai/types';

function readToolResultSpeech(data: any): ToolSpeech | undefined {
  return normalizeToolSpeech(data?.speech) || extractToolSpeechFromResult(data?.result);
}

export function speakToolResultSpeech(data: any): void {
  const speech = readToolResultSpeech(data);
  if (!speech || typeof window === 'undefined') return;

  const speak = window.YUA?.sprite?.speak;
  if (typeof speak !== 'function') return;

  const run = (): void => {
    void speak(speech.text, {
      bubbleDuration: speech.bubbleDuration,
      showBubble: speech.showBubble
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
