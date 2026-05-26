import { beforeEach, describe, expect, it, vi } from 'vitest';

import { installMiniDom } from './utils/minidom';

function installGuideHarness(options: { providers?: any[]; presets?: any[]; usablePreset?: any | null } = {}): {
  env: ReturnType<typeof installMiniDom>;
  getProviders: ReturnType<typeof vi.fn>;
  listPresets: ReturnType<typeof vi.fn>;
  resolveUsablePreset: ReturnType<typeof vi.fn>;
  startPurpose: ReturnType<typeof vi.fn>;
  startQuest: ReturnType<typeof vi.fn>;
  listWorkspaces: ReturnType<typeof vi.fn>;
  getPersonaState: ReturnType<typeof vi.fn>;
} {
  const env = installMiniDom();
  const getProviders = vi.fn(async () => options.providers ?? []);
  const listPresets = vi.fn(async () => options.presets ?? []);
  const resolveUsablePreset = vi.fn(async () => options.usablePreset ?? null);
  const listWorkspaces = vi.fn(async () => []);
  const startPurpose = vi.fn(async (request: any) => ({
    accepted: true,
    status: 'started',
    purpose: { id: 'purpose-chat-config', kind: request.kind, title: request.title, reason: request.reason, source: request.source, status: 'active', priority: request.priority, interruptPolicy: request.interruptPolicy }
  }));
  const startQuest = vi.fn(async () => ({ ok: true, startResult: { accepted: true, status: 'started' } }));
  const getPersonaState = vi.fn(async () => ({ ok: true, state: { achievements: [] } }));

  (env.window as any).YUA = {
    ai: {
      getProviders,
      listPresets,
      resolveUsablePreset
    },
    workspace: {
      'workspace:list': listWorkspaces
    },
    quest: {
      'quest:start': startQuest
    },
    persona: {
      getState: getPersonaState
    },
    sprite: {
      startPurpose
    }
  };

  return { env, getProviders, listPresets, resolveUsablePreset, startPurpose, startQuest, listWorkspaces, getPersonaState };
}

describe('guideChatApiConfigIfNeeded', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it('does not start an open-time guide when any chat provider is already configured', async () => {
    const harness = installGuideHarness({
      providers: [
        { id: 'openai', label: 'OpenAI', configured: false, capabilities: { chat: true } },
        { id: 'qwen', label: 'Qwen', configured: true, capabilities: { chat: true } }
      ]
    });
    const { guideChatApiConfigIfNeeded, resetChatApiConfigGuideStateForTest } = await import('../src/lib/chat-api-config-guide');
    resetChatApiConfigGuideStateForTest();

    const result = await guideChatApiConfigIfNeeded({ trigger: 'chat-window-open' });

    expect(result).toMatchObject({ guided: false, configured: true, blocked: false, providerId: 'qwen' });
    expect(harness.startPurpose).not.toHaveBeenCalled();
    harness.env.cleanup();
  });

  it('blocks the selected provider when sending a chat message', async () => {
    const harness = installGuideHarness({
      providers: [
        { id: 'openai', label: 'OpenAI', configured: false, capabilities: { chat: true }, schema: { fields: [{ key: 'apiKey', label: 'API Key', type: 'password', required: true }] } },
        { id: 'qwen', label: 'Qwen', configured: true, capabilities: { chat: true } }
      ],
      presets: [{ id: 'preset-openai', providerId: 'openai', name: 'OpenAI' }]
    });
    const { ensureChatApiConfigGoal, resetChatApiConfigGuideStateForTest } = await import('../src/lib/chat-api-config-guide');
    resetChatApiConfigGuideStateForTest();

    const result = await ensureChatApiConfigGoal({ providerId: 'openai', trigger: 'chat-send' });

    expect(result).toMatchObject({ guided: true, configured: false, blocked: true, providerId: 'openai', presetId: 'preset-openai' });
    expect(harness.startPurpose).toHaveBeenCalledTimes(1);
    harness.env.cleanup();
  });

  it('starts the chat API config guide with the selected provider preset fields', async () => {
    const harness = installGuideHarness({
      providers: [
        {
          id: 'openai',
          aliases: ['openai-compatible'],
          label: 'OpenAI',
          configured: false,
          capabilities: { chat: true },
          schema: {
            fields: [
              { key: 'apiKey', label: 'API Key', type: 'password', required: true },
              { key: 'baseURL', label: 'Base URL', type: 'text' }
            ]
          }
        }
      ],
      presets: [{ id: 'preset-openai', providerId: 'openai', name: 'OpenAI' }]
    });
    const { guideChatApiConfigIfNeeded, resetChatApiConfigGuideStateForTest } = await import('../src/lib/chat-api-config-guide');
    resetChatApiConfigGuideStateForTest();

    const result = await guideChatApiConfigIfNeeded({ providerId: 'openai-compatible', trigger: 'chat-send', force: true });

    expect(result).toMatchObject({ guided: true, configured: false, blocked: true, providerId: 'openai', presetId: 'preset-openai' });
    expect(harness.resolveUsablePreset).toHaveBeenCalledWith('openai', undefined);
    expect(harness.startPurpose).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'chat.api-config-guide',
        presetId: 'chat.api-config-guide',
        plannerMode: 'preset-only',
        context: expect.objectContaining({
          providerId: 'openai',
          presetId: 'preset-openai',
          fields: ['apiKey'],
          trigger: 'chat-send'
        })
      })
    );
    harness.env.cleanup();
  });

  it('returns missing-provider when no provider can be resolved for an open-time guide', async () => {
    const harness = installGuideHarness();
    const { guideChatApiConfigIfNeeded, resetChatApiConfigGuideStateForTest } = await import('../src/lib/chat-api-config-guide');
    resetChatApiConfigGuideStateForTest();

    const result = await guideChatApiConfigIfNeeded({ trigger: 'chat-window-open' });

    expect(result).toMatchObject({ guided: false, configured: false, blocked: false, reason: 'missing-provider' });
    expect(harness.startPurpose).not.toHaveBeenCalled();
    harness.env.cleanup();
  });

  it('uses cooldown for repeated open-time prompts', async () => {
    const harness = installGuideHarness({
      providers: [{ id: 'openai', label: 'OpenAI', configured: false, capabilities: { chat: true }, schema: { fields: [{ key: 'apiKey', label: 'API Key', type: 'password', required: true }] } }],
      presets: [{ id: 'preset-openai', providerId: 'openai', name: 'OpenAI' }]
    });
    const { guideChatApiConfigIfNeeded, resetChatApiConfigGuideStateForTest } = await import('../src/lib/chat-api-config-guide');
    resetChatApiConfigGuideStateForTest();

    const first = await guideChatApiConfigIfNeeded({ providerId: 'openai', trigger: 'chat-window-open' });
    const second = await guideChatApiConfigIfNeeded({ providerId: 'openai', trigger: 'chat-window-focus' });

    expect(first.guided).toBe(true);
    expect(second).toMatchObject({ guided: false, configured: false, blocked: false, providerId: 'openai', reason: 'cooldown' });
    expect(harness.startPurpose).toHaveBeenCalledTimes(1);
    harness.env.cleanup();
  });

  it('evaluates the shared workspace goal and starts the workspace quest when missing', async () => {
    const harness = installGuideHarness();
    const { ensureGuideGoal, resetGuideGoalStateForTest, WORKSPACE_EXISTS_GUIDE_GOAL } = await import('../src/lib/guide-goals');
    resetGuideGoalStateForTest();

    const result = await ensureGuideGoal({ goal: WORKSPACE_EXISTS_GUIDE_GOAL, trigger: 'workspace-entry', forceGuide: true });

    expect(result).toMatchObject({ achieved: false, guided: true, blocked: true, reason: 'missing-workspace' });
    expect(harness.listWorkspaces).toHaveBeenCalledWith({ filter: { deletedAt: 0 }, limit: 1, offset: 0 });
    expect(harness.startQuest).toHaveBeenCalledWith({ id: 'workspace.create', source: 'task-list' });
    expect(harness.startPurpose).not.toHaveBeenCalled();
    harness.env.cleanup();
  });

  it('evaluates achievement guide goals without starting a guide', async () => {
    const harness = installGuideHarness();
    harness.getPersonaState.mockResolvedValue({
      ok: true,
      state: {
        achievements: ['first-import']
      }
    });
    const { ensureGuideGoal, resetGuideGoalStateForTest } = await import('../src/lib/guide-goals');
    const { FIRST_FILE_DROP_GUIDE_GOAL } = await import('../packages/sprite-core/purpose');
    resetGuideGoalStateForTest();

    const result = await ensureGuideGoal({ goal: FIRST_FILE_DROP_GUIDE_GOAL, trigger: 'workspace-entry', forceGuide: true });

    expect(result).toMatchObject({ achieved: true, guided: false, blocked: false, achievementId: 'first-import', reason: 'achieved' });
    expect(harness.getPersonaState).toHaveBeenCalledTimes(1);
    expect(harness.startQuest).not.toHaveBeenCalled();
    expect(harness.startPurpose).not.toHaveBeenCalled();
    harness.env.cleanup();
  });
});
