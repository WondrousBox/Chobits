import { describe, expect, it } from 'vitest';

import { clearRecentAiPromptInspections, formatAiPromptInspection, inspectAiPrompt, listRecentAiPromptInspections } from '../packages/ai/runtime/pi/prompt-inspector';

describe('AI prompt inspector', () => {
  it('formats full prompt content without truncating messages', () => {
    const longPrompt = 'x'.repeat(350);
    const formatted = formatAiPromptInspection({
      agentId: 'chat',
      messages: [
        { content: 'previous assistant message', role: 'assistant' },
        { content: longPrompt, role: 'user' }
      ],
      model: 'test-model',
      providerId: 'test-provider',
      source: 'pi-session',
      systemPrompt: 'system instructions',
      transport: 'pi-ai.streamSimple'
    });

    expect(formatted).toContain('system instructions');
    expect(formatted).toContain(longPrompt);
    expect(formatted).toContain('transport: pi-ai.streamSimple');
  });

  it('stores recent inspections only when explicitly enabled', () => {
    clearRecentAiPromptInspections();
    inspectAiPrompt(
      {
        messages: [{ content: 'hidden prompt', role: 'user' }],
        source: 'pi-task-chat',
        transport: 'pi-ai.streamSimple'
      },
      {
        enabled: false,
        logger: () => {
          throw new Error('logger should not be called when disabled');
        }
      }
    );
    expect(listRecentAiPromptInspections()).toHaveLength(0);

    const logs: string[] = [];
    const stored = inspectAiPrompt(
      {
        messages: [{ content: 'visible prompt', role: 'user' }],
        requestExtras: { debugPrompt: true },
        source: 'pi-task-chat',
        transport: 'pi-ai.streamSimple'
      },
      {
        logger: (text) => logs.push(text)
      }
    );

    expect(stored?.id).toMatch(/^prompt-/);
    expect(listRecentAiPromptInspections()).toHaveLength(1);
    expect(logs[0]).toContain('visible prompt');
  });
});
