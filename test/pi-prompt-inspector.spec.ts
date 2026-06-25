import { describe, expect, it } from 'vitest';

import { AI_PROMPT_INSPECTOR_SETTINGS } from '../packages/ai/runtime/pi/prompt-inspector-settings';
import {
  clearRecentAiPromptInspections,
  formatAiPromptInspection,
  inspectAiPrompt,
  isAiPromptInspectionEnabled,
  listRecentAiPromptInspections
} from '../packages/ai/runtime/pi/prompt-inspector';

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

  describe('allowlist filtering', () => {
    const originalEnabled = AI_PROMPT_INSPECTOR_SETTINGS.enabled;
    const originalAgentIds = AI_PROMPT_INSPECTOR_SETTINGS.agentIdAllowlist;
    const originalSources = AI_PROMPT_INSPECTOR_SETTINGS.sourceAllowlist;

    function withSettings(overrides: Partial<{ enabled: boolean; agentIdAllowlist: string[]; sourceAllowlist: ('pi-session' | 'pi-task-chat' | 'pi-coding-session' | 'pi-forked-skill')[] }>): void {
      AI_PROMPT_INSPECTOR_SETTINGS.enabled = overrides.enabled ?? true;
      AI_PROMPT_INSPECTOR_SETTINGS.agentIdAllowlist = overrides.agentIdAllowlist ?? [];
      AI_PROMPT_INSPECTOR_SETTINGS.sourceAllowlist = overrides.sourceAllowlist ?? [];
    }

    function restore(): void {
      AI_PROMPT_INSPECTOR_SETTINGS.enabled = originalEnabled;
      AI_PROMPT_INSPECTOR_SETTINGS.agentIdAllowlist = originalAgentIds;
      AI_PROMPT_INSPECTOR_SETTINGS.sourceAllowlist = originalSources;
    }

    it('blocks agents not in agentIdAllowlist when global enabled', () => {
      withSettings({ agentIdAllowlist: ['conversation-route'] });
      try {
        expect(isAiPromptInspectionEnabled(undefined, 'pi-task-chat', 'title-generation')).toBe(false);
        expect(isAiPromptInspectionEnabled(undefined, 'pi-task-chat', 'conversation-route')).toBe(true);
      } finally {
        restore();
      }
    });

    it('blocks sources not in sourceAllowlist when global enabled', () => {
      withSettings({ sourceAllowlist: ['pi-task-chat'] });
      try {
        expect(isAiPromptInspectionEnabled(undefined, 'pi-session', 'chat')).toBe(false);
        expect(isAiPromptInspectionEnabled(undefined, 'pi-task-chat', 'conversation-route')).toBe(true);
      } finally {
        restore();
      }
    });

    it('honors both allowlists as AND filter', () => {
      withSettings({ agentIdAllowlist: ['conversation-route'], sourceAllowlist: ['pi-task-chat'] });
      try {
        // source 不命中
        expect(isAiPromptInspectionEnabled(undefined, 'pi-session', 'conversation-route')).toBe(false);
        // agentId 不命中
        expect(isAiPromptInspectionEnabled(undefined, 'pi-task-chat', 'title-generation')).toBe(false);
        // 两个都命中
        expect(isAiPromptInspectionEnabled(undefined, 'pi-task-chat', 'conversation-route')).toBe(true);
      } finally {
        restore();
      }
    });

    it('short-circuits to false when global disabled, even with allowlist set', () => {
      withSettings({ agentIdAllowlist: ['conversation-route'], enabled: false });
      try {
        expect(isAiPromptInspectionEnabled(undefined, 'pi-task-chat', 'conversation-route')).toBe(false);
      } finally {
        restore();
      }
    });

    it('explicit requestExtras override bypasses allowlist', () => {
      withSettings({ agentIdAllowlist: ['conversation-route'] });
      try {
        // agentId 不在 allowlist，但 requestExtras 强制打开
        expect(isAiPromptInspectionEnabled({ debugPrompt: true }, 'pi-task-chat', 'title-generation')).toBe(true);
        // 反之 extras=false 也能强制关
        expect(isAiPromptInspectionEnabled({ debugPrompt: false }, 'pi-task-chat', 'conversation-route')).toBe(false);
      } finally {
        restore();
      }
    });

    it('inspectAiPrompt honors allowlist (no log, no recent)', () => {
      withSettings({ agentIdAllowlist: ['conversation-route'] });
      try {
        clearRecentAiPromptInspections();
        const logs: string[] = [];
        const stored = inspectAiPrompt(
          {
            agentId: 'title-generation',
            messages: [{ content: 'should be filtered out', role: 'user' }],
            source: 'pi-task-chat',
            transport: 'pi-ai.streamSimple'
          },
          { logger: (text) => logs.push(text) }
        );

        expect(stored).toBeUndefined();
        expect(listRecentAiPromptInspections()).toHaveLength(0);
        expect(logs).toHaveLength(0);
      } finally {
        restore();
      }
    });
  });
});
