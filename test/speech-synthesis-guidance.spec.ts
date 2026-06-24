import { describe, expect, it } from 'vitest';

import { appendRealtimeSpeechPromptGuidance, getRealtimeSpeechPromptGuidance } from '../packages/ai/speech-synthesis-guidance';
import type { ChatMessage } from '../packages/ai/types';

describe('speech synthesis prompt guidance', () => {
  it('reads MiniMax realtime speech guidance from provider model metadata', () => {
    const guidance = getRealtimeSpeechPromptGuidance({
      spriteRealtimeSpeech: {
        enabled: true,
        model: 'speech-2.8-turbo',
        providerId: 'minimax',
        voiceId: 'female-shaonv'
      }
    });

    expect(guidance).toContain('<#x#>');
    expect(guidance).toContain('(laughs)');
    expect(guidance).toContain('语气词标签');
  });

  it('injects realtime speech guidance only when realtime speech is enabled', () => {
    const messages: ChatMessage[] = [
      { content: '你是 Chii。', role: 'system' },
      { content: '介绍一下你自己', role: 'user' }
    ];

    const disabled = appendRealtimeSpeechPromptGuidance(messages, {
      spriteRealtimeSpeech: {
        enabled: false,
        model: 'speech-2.8-turbo',
        providerId: 'minimax'
      }
    });
    expect(disabled).toBe(messages);

    const enabled = appendRealtimeSpeechPromptGuidance(messages, {
      spriteRealtimeSpeech: {
        enabled: true,
        model: 'speech-2.8-turbo',
        providerId: 'minimax'
      }
    });
    expect(enabled).not.toBe(messages);
    expect(enabled).toHaveLength(3);
    expect(enabled[0]).toBe(messages[0]);
    expect(enabled[1]).toMatchObject({
      name: 'provider_realtime_speech_guidance',
      role: 'system'
    });
    expect(enabled[1].content).toContain('停顿标签');
    expect(enabled[2]).toBe(messages[1]);
  });
});
