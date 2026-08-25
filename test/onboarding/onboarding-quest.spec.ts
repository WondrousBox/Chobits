import { describe, expect, it, vi } from 'vitest';

import { FEATURE_INTRO_QUEST_CATALOG } from '../../packages/sprite-core/feature-intro-catalog';
import {
  createFeatureIntroQuest,
  createFeatureIntroQuests,
  createFileVideoTranscriptionIntroQuest,
  createChatApiConfigQuest,
  createFirstChatQuest,
  createFirstFileDropQuest,
  createOnboardingQuestRegistry,
  createOpenResourceLibraryQuest,
  createQuestListSnapshot,
  createWorkspaceCreateQuest,
  QuestEngine,
  QuestRegistry
} from '../../packages/sprite-core/quest';
import { createEmptyOnboardingState } from '../../packages/sprite-core/quest/types';

function createTimerHarness() {
  let nextId = 1;
  const callbacks = new Map<number, () => void | Promise<void>>();
  const setTimeout = vi.fn((callback: () => void | Promise<void>, ms: number) => {
    const id = nextId;
    nextId += 1;
    callbacks.set(id, callback);
    return id;
  });
  const clearTimeout = vi.fn((timeoutId: unknown) => {
    callbacks.delete(Number(timeoutId));
  });
  const runNext = async (): Promise<boolean> => {
    const next = callbacks.entries().next().value as [number, () => void] | undefined;
    if (!next) return false;
    const [id, callback] = next;
    callbacks.delete(id);
    await callback();
    return true;
  };
  return {
    setTimeout,
    clearTimeout,
    runNext,
    get pendingCount() {
      return callbacks.size;
    }
  };
}

describe('QuestRegistry', () => {
  it('registers quests and looks them up by trigger event', () => {
    const reg = new QuestRegistry();
    const quest = createWorkspaceCreateQuest({ countWorkspaces: () => 0 });
    reg.register(quest);

    expect(reg.get('workspace.create')).toBe(quest);
    expect(reg.list()).toHaveLength(1);
    expect(reg.byTriggerEvent('WORKSPACE_CREATED')).toContain(quest);
    expect(reg.byTriggerEvent('UNRELATED')).toHaveLength(0);
  });

  it('creates the default onboarding quest registry in fixed order', () => {
    const reg = createOnboardingQuestRegistry({ countWorkspaces: () => 0 });
    const featureIds = FEATURE_INTRO_QUEST_CATALOG.map((item) => item.id);

    expect(reg.list().map((quest) => quest.id)).toEqual(['workspace.create', 'chat.api-config', 'first-chat', 'first-file-drop', 'open-resource-library', ...featureIds]);
    expect(reg.get('workspace.create')?.autoStartEvents).toEqual(['APP_STARTED']);
    expect(reg.get('chat.api-config')?.autoStartEvents).toBeUndefined();
    expect(reg.get('chat.api-config')?.explicitStartSources).toEqual(['task-list', 'ai', 'recommendation']);
    expect(reg.get('first-chat')?.autoStartEvents).toBeUndefined();
    expect(reg.get('first-chat')?.explicitStartSources).toEqual(['task-list', 'ai', 'recommendation']);
    expect(reg.get('first-file-drop')?.autoStartEvents).toBeUndefined();
    expect(reg.get('first-file-drop')?.explicitStartSources).toEqual(['task-list', 'ai', 'recommendation']);
    expect(reg.get('open-resource-library')?.autoStartEvents).toBeUndefined();
    expect(reg.get('open-resource-library')?.explicitStartSources).toEqual(['task-list', 'ai', 'recommendation']);
    expect(createFeatureIntroQuests({ countWorkspaces: () => 1 }).map((quest) => quest.id)).toEqual(featureIds);
    expect(reg.byTriggerEvent('RESOURCE_CREATED').map((quest) => quest.id)).toEqual(['first-file-drop']);
    expect(reg.byTriggerEvent('ASSISTANT_MENU_ITEM_SELECTED').map((quest) => quest.id)).toEqual(
      expect.arrayContaining([
        'open-resource-library',
        'feature.inventory',
        'feature.quest-list',
        'feature.asr-microphone',
        'feature.system-audio-asr',
        'feature.tts-config',
        'feature.memory-graph',
        'feature.skill-tree'
      ])
    );
    expect(reg.byTriggerEvent('FILE_ACTION_WORKFLOW_STARTED').map((quest) => quest.id)).toEqual(
      expect.arrayContaining(['feature.file-video-transcription', 'feature.video-keyframes', 'feature.media-transcode', 'feature.image-understand', 'feature.ocr'])
    );
    expect(reg.byTriggerEvent('APP_WINDOW_OPENED').map((quest) => quest.id)).toEqual(
      expect.arrayContaining(['first-chat', 'feature.workflow-gallery', 'feature.plugin-manager', 'feature.window-animation-editor', 'feature.character-pack-editor'])
    );
    expect(reg.byTriggerEvent('AI_PROVIDER_CONFIG_UPDATED').map((quest) => quest.id)).toEqual(['chat.api-config']);
    expect(reg.byTriggerEvent('SPRITE_AI_COMPLETE').map((quest) => quest.id)).toEqual(expect.arrayContaining(['feature.chat-with-resource']));
    expect(reg.byTriggerEvent('APP_STARTED').map((quest) => quest.id)).toEqual(['workspace.create']);
  });
});

describe('QuestEngine — workspace.create happy path', () => {
  function makeDeps(workspaceCount: { value: number }): {
    engine: QuestEngine;
    startPurpose: ReturnType<typeof vi.fn>;
    grantReward: ReturnType<typeof vi.fn>;
    isPurposeAlive: ReturnType<typeof vi.fn>;
    hasAchievement: ReturnType<typeof vi.fn>;
    saved: { current: ReturnType<typeof createEmptyOnboardingState> | null };
  } {
    const reg = new QuestRegistry();
    reg.register(createWorkspaceCreateQuest({ countWorkspaces: () => workspaceCount.value }));

    const startPurpose = vi.fn(async () => ({
      accepted: true as const,
      purpose: {
        id: 'p-1',
        kind: 'onboarding.workspace.create',
        title: '',
        reason: '',
        source: 'system-event' as const,
        status: 'queued' as const,
        priority: 70,
        interruptPolicy: 'interruptible' as const
      },
      status: 'started' as const
    }));
    const grantReward = vi.fn(async () => undefined);
    const isPurposeAlive = vi.fn(() => false);
    const hasAchievement = vi.fn(() => false);
    const saved: { current: any } = { current: null };

    const engine = new QuestEngine({
      registry: reg,
      startPurpose,
      isPurposeAlive,
      hasAchievement,
      grantReward,
      loadState: () => saved.current,
      saveState: (state) => {
        saved.current = JSON.parse(JSON.stringify(state));
      },
      now: () => 1000
    });

    return { engine, startPurpose, grantReward, isPurposeAlive, hasAchievement, saved };
  }

  it('activates the quest when no workspace exists', async () => {
    const wsCount = { value: 0 };
    const { engine, startPurpose, grantReward, saved } = makeDeps(wsCount);

    await engine.tick({ event: 'APP_STARTED' });

    expect(startPurpose).toHaveBeenCalledTimes(1);
    expect(startPurpose.mock.calls[0][0]).toMatchObject({
      kind: 'onboarding.workspace.create',
      presetId: 'onboarding.workspace.create',
      interruptPolicy: 'urgent',
      coalesceKey: 'onboarding.workspace.create',
      plannerMode: 'preset-only'
    });
    expect(grantReward).not.toHaveBeenCalled();
    expect(saved.current?.quests['workspace.create'].status).toBe('active');
  });

  it('builds a quest list snapshot with reward and action metadata', () => {
    const quest = createWorkspaceCreateQuest({ countWorkspaces: () => 0 });
    const snapshot = createQuestListSnapshot({
      definitions: [quest],
      state: {
        version: 1,
        quests: {
          'workspace.create': {
            status: 'active',
            activatedAt: 1000
          }
        }
      }
    });

    expect(snapshot.summary).toMatchObject({ total: 1, active: 1, done: 0 });
    expect(snapshot.items[0]).toMatchObject({
      id: 'workspace.create',
      category: 'onboarding',
      title: '创建你的第一个工作空间',
      status: 'active',
      progressPercent: 50,
      reward: { xp: 20, favor: 3, achievementId: 'first-workspace' },
      rewardSource: 'quest:workspace.create',
      recommendation: {
        questId: 'chat.api-config',
        delayMs: 5000
      },
      action: {
        kind: 'start-quest',
        label: '继续引导',
        questId: 'workspace.create',
        windowKey: 'workspaceWizard',
        purposeKind: 'onboarding.workspace.create'
      }
    });
  });

  it('starts an existing quest manually from the task list', async () => {
    const wsCount = { value: 0 };
    const { engine, startPurpose, saved } = makeDeps(wsCount);

    const result = await engine.startQuest('workspace.create');

    expect(result).toMatchObject({ accepted: true, status: 'started' });
    expect(startPurpose).toHaveBeenCalledTimes(1);
    expect(saved.current?.quests['workspace.create']).toMatchObject({ status: 'active', activatedAt: 1000 });
  });

  it('shows unfinished onboarding quests as skipped when onboarding is skipped', () => {
    const quest = createWorkspaceCreateQuest({ countWorkspaces: () => 0 });
    const snapshot = createQuestListSnapshot({
      definitions: [quest],
      state: {
        version: 1,
        skipped: true,
        quests: {
          'workspace.create': {
            status: 'active',
            activatedAt: 1000
          }
        }
      }
    });

    expect(snapshot.items[0]).toMatchObject({
      id: 'workspace.create',
      status: 'skipped',
      action: undefined
    });
    expect(snapshot.summary).toMatchObject({ skipped: 1, active: 0 });
  });

  it('marks a manually started quest done when completion is already satisfied', async () => {
    const wsCount = { value: 1 };
    const { engine, startPurpose, grantReward, saved } = makeDeps(wsCount);

    const result = await engine.startQuest('workspace.create');

    expect(result).toBeNull();
    expect(startPurpose).not.toHaveBeenCalled();
    expect(grantReward).toHaveBeenCalledTimes(1);
    expect(saved.current?.quests['workspace.create'].status).toBe('done');
  });

  it('offers the next quest when the completed quest recommends an unfinished available quest', async () => {
    const counts = { workspaces: 0 };
    const reg = new QuestRegistry([createWorkspaceCreateQuest({ countWorkspaces: () => counts.workspaces }), createChatApiConfigQuest({ countWorkspaces: () => counts.workspaces })]);
    const startPurpose = vi.fn(async () => ({
      accepted: true as const,
      purpose: {
        id: 'p-1',
        kind: 'onboarding.workspace.create',
        title: '',
        reason: '',
        source: 'system-event' as const,
        status: 'queued' as const,
        priority: 70,
        interruptPolicy: 'interruptible' as const
      },
      status: 'started' as const
    }));
    const grantReward = vi.fn(async () => undefined);
    const onRecommendation = vi.fn(async () => undefined);
    const timer = createTimerHarness();
    const saved: { current: any } = { current: createEmptyOnboardingState() };
    const engine = new QuestEngine({
      registry: reg,
      startPurpose,
      grantReward,
      hasAchievement: () => false,
      onRecommendation,
      loadState: () => saved.current,
      saveState: (state) => {
        saved.current = JSON.parse(JSON.stringify(state));
      },
      now: () => 1000,
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout
    });

    counts.workspaces = 1;
    await engine.tick({ event: 'WORKSPACE_CREATED' });

    expect(timer.setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);
    expect(onRecommendation).not.toHaveBeenCalled();

    await timer.runNext();

    expect(onRecommendation).toHaveBeenCalledTimes(1);
    expect(onRecommendation.mock.calls[0][0]).toMatchObject({
      questId: 'chat.api-config',
      questTitle: '配置聊天 API Key',
      questStatus: 'pending',
      delayMs: 5000,
      confirmLabel: '去配置'
    });
    expect(onRecommendation.mock.calls[0][0]).not.toHaveProperty('cancelLabel');
    expect(onRecommendation.mock.calls[0][1].id).toBe('workspace.create');
  });

  it('does not offer a recommended quest that is already completed', async () => {
    const counts = { workspaces: 1 };
    const reg = new QuestRegistry([createWorkspaceCreateQuest({ countWorkspaces: () => counts.workspaces }), createChatApiConfigQuest({ countWorkspaces: () => counts.workspaces, hasChatApiConfigured: () => true })]);
    const onRecommendation = vi.fn(async () => undefined);
    const timer = createTimerHarness();
    const saved: { current: any } = {
      current: {
        version: 1,
        quests: {
          'chat.api-config': {
            status: 'done',
            completedAt: 900
          }
        }
      }
    };
    const engine = new QuestEngine({
      registry: reg,
      startPurpose: vi.fn(async () => ({ accepted: true as const, status: 'started' as const })),
      grantReward: vi.fn(async () => undefined),
      hasAchievement: () => false,
      onRecommendation,
      loadState: () => saved.current,
      saveState: (state) => {
        saved.current = JSON.parse(JSON.stringify(state));
      },
      now: () => 1000,
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout
    });

    await engine.tick({ event: 'WORKSPACE_CREATED' });
    await timer.runNext();

    expect(onRecommendation).not.toHaveBeenCalled();
  });

  it('does not offer a recommended quest that completes during the buffer window', async () => {
    const counts = { workspaces: 1 };
    const chatConfig = { configured: false };
    const reg = new QuestRegistry([createWorkspaceCreateQuest({ countWorkspaces: () => counts.workspaces }), createChatApiConfigQuest({ countWorkspaces: () => counts.workspaces, hasChatApiConfigured: () => chatConfig.configured })]);
    const onRecommendation = vi.fn(async () => undefined);
    const timer = createTimerHarness();
    const saved: { current: any } = { current: createEmptyOnboardingState() };
    const engine = new QuestEngine({
      registry: reg,
      startPurpose: vi.fn(async () => ({ accepted: true as const, status: 'started' as const })),
      grantReward: vi.fn(async () => undefined),
      hasAchievement: () => false,
      onRecommendation,
      loadState: () => saved.current,
      saveState: (state) => {
        saved.current = JSON.parse(JSON.stringify(state));
      },
      now: () => 1000,
      setTimeout: timer.setTimeout,
      clearTimeout: timer.clearTimeout
    });

    await engine.tick({ event: 'WORKSPACE_CREATED' });
    expect(timer.pendingCount).toBe(1);

    chatConfig.configured = true;
    await engine.tick({ event: 'AI_PROVIDER_CONFIG_UPDATED', eventPayload: { providerId: 'openai', presetId: 'preset-openai' } });
    await timer.runNext();

    expect(onRecommendation).not.toHaveBeenCalled();
  });

  it('marks an already unlocked quest achievement done without replaying the guide or reward', async () => {
    const wsCount = { value: 0 };
    const { engine, startPurpose, grantReward, hasAchievement, saved } = makeDeps(wsCount);
    hasAchievement.mockImplementation((id) => id === 'first-workspace');

    const result = await engine.startQuest('workspace.create');

    expect(result).toBeNull();
    expect(hasAchievement).toHaveBeenCalledWith('first-workspace');
    expect(startPurpose).not.toHaveBeenCalled();
    expect(grantReward).not.toHaveBeenCalled();
    expect(saved.current?.quests['workspace.create']).toMatchObject({ status: 'done', completedAt: 1000 });
  });

  it('resets completed quest state and reports durable persona markers to clear', async () => {
    const wsCount = { value: 0 };
    const { engine, hasAchievement, saved } = makeDeps(wsCount);
    saved.current = {
      version: 1,
      quests: {
        'workspace.create': {
          status: 'done',
          completedAt: 900
        }
      }
    };
    hasAchievement.mockImplementation((id) => id === 'first-workspace');

    const result = await engine.resetCompleted();

    expect(result).toEqual({
      resetQuestIds: ['workspace.create'],
      achievementIds: ['first-workspace'],
      rewardSources: ['quest:workspace.create']
    });
    expect(saved.current?.quests['workspace.create']).toBeUndefined();
  });

  it('resets quests that are only completed through an already unlocked achievement marker', async () => {
    const wsCount = { value: 0 };
    const { engine, hasAchievement, saved } = makeDeps(wsCount);
    hasAchievement.mockImplementation((id) => id === 'first-workspace');

    const result = await engine.resetCompleted();

    expect(result).toEqual({
      resetQuestIds: ['workspace.create'],
      achievementIds: ['first-workspace'],
      rewardSources: ['quest:workspace.create']
    });
    expect(saved.current?.quests['workspace.create']).toBeUndefined();
  });

  it('clears active quest progress as well as completed quest markers', async () => {
    const wsCount = { value: 0 };
    const { engine, hasAchievement, saved } = makeDeps(wsCount);
    saved.current = {
      version: 1,
      quests: {
        'workspace.create': {
          status: 'active',
          activatedAt: 900,
          lastPurposeId: 'purpose-1'
        }
      }
    };
    hasAchievement.mockImplementation((id) => id === 'first-workspace');

    const result = await engine.resetProgress();

    expect(result).toEqual({
      resetQuestIds: ['workspace.create'],
      achievementIds: ['first-workspace'],
      rewardSources: ['quest:workspace.create']
    });
    expect(saved.current).toEqual({ version: 1, quests: {} });
  });

  it('retries an active retriable quest on startup when the workspace is still missing', async () => {
    const wsCount = { value: 0 };
    const { engine, startPurpose, saved } = makeDeps(wsCount);

    await engine.tick({ event: 'APP_STARTED' });
    await engine.tick({ event: 'APP_STARTED' });

    expect(startPurpose).toHaveBeenCalledTimes(2);
    expect(saved.current?.quests['workspace.create'].status).toBe('active');
  });

  it('does not retry an active quest for unrelated events', async () => {
    const wsCount = { value: 0 };
    const { engine, startPurpose, isPurposeAlive } = makeDeps(wsCount);
    isPurposeAlive.mockReturnValue(true);

    await engine.tick({ event: 'APP_STARTED' });
    await engine.tick({ event: 'UNRELATED' });

    expect(startPurpose).toHaveBeenCalledTimes(1);
  });

  it('restarts an active quest for unrelated events when the previous purpose is gone', async () => {
    const wsCount = { value: 0 };
    const { engine, startPurpose, saved, isPurposeAlive } = makeDeps(wsCount);
    isPurposeAlive.mockReturnValue(false);

    await engine.tick({ event: 'APP_STARTED' });
    await engine.tick({ event: 'WORKSPACE_WIZARD_CLOSED' });

    expect(isPurposeAlive).toHaveBeenCalledWith('p-1');
    expect(startPurpose).toHaveBeenCalledTimes(2);
    expect(saved.current?.quests['workspace.create']).toMatchObject({ status: 'active', lastPurposeId: 'p-1' });
  });

  it('keeps wizard close as a tracked event but lets the active routine own immediate reprompting', async () => {
    const wsCount = { value: 0 };
    const { engine, startPurpose, isPurposeAlive } = makeDeps(wsCount);
    isPurposeAlive.mockReturnValue(true);

    await engine.tick({ event: 'APP_STARTED' });
    await engine.tick({ event: 'WORKSPACE_WIZARD_CLOSED' });

    expect(startPurpose).toHaveBeenCalledTimes(1);
  });

  it('completes the quest and grants reward when WORKSPACE_CREATED fires', async () => {
    const wsCount = { value: 0 };
    const { engine, grantReward, saved } = makeDeps(wsCount);

    // 用户开始创建后...
    await engine.tick({ event: 'APP_STARTED' });
    // 工作空间被创建
    wsCount.value = 1;
    await engine.tick({ event: 'WORKSPACE_CREATED', eventPayload: { id: 'ws-1' } });

    expect(grantReward).toHaveBeenCalledTimes(1);
    const [reward, source] = grantReward.mock.calls[0];
    expect(reward).toMatchObject({ xp: 20, favor: 3, achievementId: 'first-workspace' });
    expect(source).toBe('quest:workspace.create');
    expect(saved.current?.quests['workspace.create'].status).toBe('done');
  });

  it('does not re-grant reward on subsequent ticks (oneShot)', async () => {
    const wsCount = { value: 1 };
    const { engine, grantReward } = makeDeps(wsCount);

    await engine.tick({ event: 'WORKSPACE_CREATED' });
    await engine.tick({ event: 'WORKSPACE_CREATED' });
    await engine.tick({ event: 'APP_STARTED' });

    expect(grantReward).toHaveBeenCalledTimes(1);
  });

  it('skips activation when user has skipped onboarding', async () => {
    const wsCount = { value: 0 };
    const { engine, startPurpose } = makeDeps(wsCount);

    await engine.skipAll();
    await engine.tick({ event: 'APP_STARTED' });

    expect(startPurpose).not.toHaveBeenCalled();
  });
});

describe('QuestEngine — chat.api-config onboarding quest', () => {
  function makeChatApiConfigDeps(state: { workspaces: number; configured: boolean }): {
    engine: QuestEngine;
    startPurpose: ReturnType<typeof vi.fn>;
    grantReward: ReturnType<typeof vi.fn>;
    hasAchievement: ReturnType<typeof vi.fn>;
    saved: { current: ReturnType<typeof createEmptyOnboardingState> | null };
  } {
    const reg = new QuestRegistry();
    reg.register(
      createChatApiConfigQuest({
        countWorkspaces: () => state.workspaces,
        hasChatApiConfigured: () => state.configured,
        resolveChatApiConfigGuideContext: () => ({
          providerId: 'openai',
          presetId: 'preset-openai',
          fields: ['apiKey'],
          trigger: 'onboarding'
        })
      })
    );

    const startPurpose = vi.fn(async () => ({
      accepted: true as const,
      purpose: {
        id: 'p-chat-api-config',
        kind: 'chat.api-config-guide',
        title: '',
        reason: '',
        source: 'system-event' as const,
        status: 'queued' as const,
        priority: 69,
        interruptPolicy: 'interruptible' as const
      },
      status: 'started' as const
    }));
    const grantReward = vi.fn(async () => undefined);
    const hasAchievement = vi.fn(() => false);
    const saved: { current: any } = {
      current: {
        version: 1,
        quests: {
          'workspace.create': {
            status: 'done',
            completedAt: 900
          }
        }
      }
    };

    const engine = new QuestEngine({
      registry: reg,
      startPurpose,
      hasAchievement,
      grantReward,
      loadState: () => saved.current,
      saveState: (nextState) => {
        saved.current = JSON.parse(JSON.stringify(nextState));
      },
      now: () => 1000
    });

    return { engine, startPurpose, grantReward, hasAchievement, saved };
  }

  it('does not auto activate on app startup when workspace is ready', async () => {
    const state = { workspaces: 1, configured: false };
    const { engine, startPurpose, saved } = makeChatApiConfigDeps(state);

    await engine.tick({ event: 'APP_STARTED' });

    expect(startPurpose).not.toHaveBeenCalled();
    expect(saved.current?.quests['chat.api-config']).toBeUndefined();
  });

  it('starts from a recommendation with provider preset context', async () => {
    const state = { workspaces: 1, configured: false };
    const { engine, startPurpose, saved } = makeChatApiConfigDeps(state);

    const result = await engine.startQuest('chat.api-config', { source: 'recommendation' });

    expect(result).toMatchObject({ accepted: true, status: 'started' });
    expect(startPurpose).toHaveBeenCalledTimes(1);
    expect(startPurpose.mock.calls[0][0]).toMatchObject({
      kind: 'chat.api-config-guide',
      presetId: 'chat.api-config-guide',
      priority: 69,
      coalesceKey: 'chat.api-config-guide',
      plannerMode: 'preset-only',
      context: {
        providerId: 'openai',
        presetId: 'preset-openai',
        fields: ['apiKey'],
        trigger: 'onboarding',
        questStartSource: 'recommendation',
        openSettingsDirectly: true
      }
    });
    expect(saved.current?.quests['chat.api-config']).toMatchObject({ status: 'active', activatedAt: 1000 });
  });

  it('does not activate before workspace is ready', async () => {
    const state = { workspaces: 0, configured: false };
    const { engine, startPurpose } = makeChatApiConfigDeps(state);

    await expect(engine.startQuest('chat.api-config')).rejects.toThrow('precondition is not satisfied');

    expect(startPurpose).not.toHaveBeenCalled();
  });

  it('marks configured chat API as done without replaying the guide', async () => {
    const state = { workspaces: 1, configured: true };
    const { engine, startPurpose, grantReward, saved } = makeChatApiConfigDeps(state);

    const result = await engine.startQuest('chat.api-config', { source: 'task-list' });

    expect(result).toBeNull();
    expect(startPurpose).not.toHaveBeenCalled();
    expect(grantReward).toHaveBeenCalledWith({ xp: 15, favor: 2, achievementId: 'first-chat-api-config' }, 'quest:chat.api-config');
    expect(saved.current?.quests['chat.api-config']).toMatchObject({ status: 'done', completedAt: 1000 });
  });

  it('completes and rewards after AI provider config becomes usable', async () => {
    const state = { workspaces: 1, configured: false };
    const { engine, grantReward, saved } = makeChatApiConfigDeps(state);

    await engine.tick({ event: 'AI_PROVIDER_CONFIG_UPDATED', eventPayload: { providerId: 'openai', presetId: 'preset-openai' } });
    expect(grantReward).not.toHaveBeenCalled();
    expect(saved.current?.quests['chat.api-config']).toBeUndefined();

    state.configured = true;
    await engine.tick({ event: 'AI_PROVIDER_CONFIG_UPDATED', eventPayload: { providerId: 'openai', presetId: 'preset-openai' } });

    expect(grantReward).toHaveBeenCalledTimes(1);
    expect(grantReward.mock.calls[0]).toEqual([{ xp: 15, favor: 2, achievementId: 'first-chat-api-config' }, 'quest:chat.api-config']);
    expect(saved.current?.quests['chat.api-config'].status).toBe('done');
  });

  it('builds a quest list item with chat API config rewards and action', () => {
    const quest = createChatApiConfigQuest({ countWorkspaces: () => 1 });
    const snapshot = createQuestListSnapshot({
      definitions: [quest],
      state: {
        version: 1,
        quests: {
          'workspace.create': {
            status: 'done',
            completedAt: 900
          },
          'chat.api-config': {
            status: 'pending'
          }
        }
      }
    });

    expect(snapshot.items[0]).toMatchObject({
      id: 'chat.api-config',
      category: 'onboarding',
      title: '配置聊天 API Key',
      reward: { xp: 15, favor: 2, achievementId: 'first-chat-api-config' },
      rewardSource: 'quest:chat.api-config',
      recommendation: {
        questId: 'first-chat',
        delayMs: 7000
      },
      action: {
        kind: 'start-quest',
        label: '开始配置',
        questId: 'chat.api-config',
        windowKey: 'aiProviderConfig',
        purposeKind: 'chat.api-config-guide'
      }
    });
  });
});

describe('QuestEngine — first-chat onboarding quest', () => {
  function makeFirstChatDeps(state: { workspaces: number; configured: boolean }): {
    engine: QuestEngine;
    startPurpose: ReturnType<typeof vi.fn>;
    grantReward: ReturnType<typeof vi.fn>;
    hasAchievement: ReturnType<typeof vi.fn>;
    saved: { current: ReturnType<typeof createEmptyOnboardingState> | null };
  } {
    const reg = new QuestRegistry();
    reg.register(createFirstChatQuest({ countWorkspaces: () => state.workspaces, hasChatApiConfigured: () => state.configured }));

    const startPurpose = vi.fn(async () => ({
      accepted: true as const,
      purpose: {
        id: 'p-first-chat',
        kind: 'onboarding.chat.start',
        title: '',
        reason: '',
        source: 'system-event' as const,
        status: 'queued' as const,
        priority: 68,
        interruptPolicy: 'interruptible' as const
      },
      status: 'started' as const
    }));
    const grantReward = vi.fn(async () => undefined);
    const hasAchievement = vi.fn(() => false);
    const saved: { current: any } = {
      current: {
        version: 1,
        quests: {
          'workspace.create': {
            status: 'done',
            completedAt: 900
          },
          'chat.api-config': {
            status: 'done',
            completedAt: 950
          }
        }
      }
    };

    const engine = new QuestEngine({
      registry: reg,
      startPurpose,
      hasAchievement,
      grantReward,
      loadState: () => saved.current,
      saveState: (nextState) => {
        saved.current = JSON.parse(JSON.stringify(nextState));
      },
      now: () => 1000
    });

    return { engine, startPurpose, grantReward, hasAchievement, saved };
  }

  it('does not auto activate on app startup when chat is ready', async () => {
    const state = { workspaces: 1, configured: true };
    const { engine, startPurpose, saved } = makeFirstChatDeps(state);

    await engine.tick({ event: 'APP_STARTED' });

    expect(startPurpose).not.toHaveBeenCalled();
    expect(saved.current?.quests['first-chat']).toBeUndefined();
  });

  it('starts from a recommendation when workspace and chat API are ready', async () => {
    const state = { workspaces: 1, configured: true };
    const { engine, startPurpose, saved } = makeFirstChatDeps(state);

    const result = await engine.startQuest('first-chat', { source: 'recommendation' });

    expect(result).toMatchObject({ accepted: true, status: 'started' });
    expect(startPurpose).toHaveBeenCalledTimes(1);
    expect(startPurpose.mock.calls[0][0]).toMatchObject({
      kind: 'onboarding.chat.start',
      presetId: 'onboarding.chat.start',
      priority: 68,
      coalesceKey: 'onboarding.chat.start',
      plannerMode: 'preset-only'
    });
    expect(saved.current?.quests['first-chat']).toMatchObject({ status: 'active', activatedAt: 1000 });
  });

  it('does not activate before workspace and chat API are ready', async () => {
    const state = { workspaces: 1, configured: false };
    const { engine, startPurpose } = makeFirstChatDeps(state);

    await expect(engine.startQuest('first-chat')).rejects.toThrow('precondition is not satisfied');

    state.workspaces = 0;
    state.configured = true;
    await expect(engine.startQuest('first-chat')).rejects.toThrow('precondition is not satisfied');
    expect(startPurpose).not.toHaveBeenCalled();
  });

  it('uses the first-chat achievement as a durable completion marker', async () => {
    const state = { workspaces: 1, configured: true };
    const { engine, startPurpose, grantReward, hasAchievement, saved } = makeFirstChatDeps(state);
    hasAchievement.mockImplementation((id) => id === 'first-chat');

    await engine.tick({ event: 'APP_STARTED' });

    expect(startPurpose).not.toHaveBeenCalled();
    expect(grantReward).not.toHaveBeenCalled();
    expect(saved.current?.quests['first-chat']).toMatchObject({ status: 'done', completedAt: 1000 });
  });

  it('completes and rewards after a double click opens the chat entry window', async () => {
    const state = { workspaces: 1, configured: true };
    const { engine, grantReward, saved } = makeFirstChatDeps(state);

    await engine.tick({ event: 'APP_WINDOW_OPENED', eventPayload: { windowKey: 'settings' } });
    expect(grantReward).not.toHaveBeenCalled();
    expect(saved.current?.quests['first-chat']).toBeUndefined();

    await engine.tick({ event: 'APP_WINDOW_OPENED', eventPayload: { windowKey: 'assistant', source: 'renderer-window-open' } });

    expect(grantReward).toHaveBeenCalledTimes(1);
    expect(grantReward.mock.calls[0]).toEqual([{ xp: 15, favor: 2, achievementId: 'first-chat' }, 'quest:first-chat']);
    expect(saved.current?.quests['first-chat'].status).toBe('done');
  });

  it('builds a quest list item with first chat rewards and action', () => {
    const quest = createFirstChatQuest({ countWorkspaces: () => 1, hasChatApiConfigured: () => true });
    const snapshot = createQuestListSnapshot({
      definitions: [quest],
      state: {
        version: 1,
        quests: {
          'workspace.create': {
            status: 'done',
            completedAt: 900
          },
          'chat.api-config': {
            status: 'done',
            completedAt: 950
          },
          'first-chat': {
            status: 'pending'
          }
        }
      }
    });

    expect(snapshot.items[0]).toMatchObject({
      id: 'first-chat',
      category: 'onboarding',
      title: '开始第一次聊天',
      reward: { xp: 15, favor: 2, achievementId: 'first-chat' },
      rewardSource: 'quest:first-chat',
      recommendation: {
        questId: 'first-file-drop',
        delayMs: 7000
      },
      action: {
        kind: 'start-quest',
        label: '开始聊天',
        questId: 'first-chat',
        purposeKind: 'onboarding.chat.start'
      }
    });
  });
});

describe('QuestEngine — first-file-drop onboarding quest', () => {
  function makeFileDropDeps(counts: { workspaces: number }): {
    engine: QuestEngine;
    startPurpose: ReturnType<typeof vi.fn>;
    grantReward: ReturnType<typeof vi.fn>;
    hasAchievement: ReturnType<typeof vi.fn>;
    saved: { current: ReturnType<typeof createEmptyOnboardingState> | null };
  } {
    const reg = new QuestRegistry();
    reg.register(createFirstFileDropQuest({ countWorkspaces: () => counts.workspaces }));

    const startPurpose = vi.fn(async () => ({
      accepted: true as const,
      purpose: {
        id: 'p-file-drop',
        kind: 'onboarding.file.drop',
        title: '',
        reason: '',
        source: 'system-event' as const,
        status: 'queued' as const,
        priority: 68,
        interruptPolicy: 'interruptible' as const
      },
      status: 'started' as const
    }));
    const grantReward = vi.fn(async () => undefined);
    const hasAchievement = vi.fn(() => false);
    const saved: { current: any } = {
      current: {
        version: 1,
        quests: {
          'workspace.create': {
            status: 'done',
            completedAt: 900
          }
        }
      }
    };

    const engine = new QuestEngine({
      registry: reg,
      startPurpose,
      hasAchievement,
      grantReward,
      loadState: () => saved.current,
      saveState: (state) => {
        saved.current = JSON.parse(JSON.stringify(state));
      },
      now: () => 1000
    });

    return { engine, startPurpose, grantReward, hasAchievement, saved };
  }

  it('does not auto activate on app startup when workspace is ready', async () => {
    const counts = { workspaces: 1 };
    const { engine, startPurpose, saved } = makeFileDropDeps(counts);

    await engine.tick({ event: 'APP_STARTED' });

    expect(startPurpose).not.toHaveBeenCalled();
    expect(saved.current?.quests['first-file-drop']).toBeUndefined();
  });

  it('does not auto activate when workspace creation completes', async () => {
    const counts = { workspaces: 1 };
    const { engine, startPurpose, saved } = makeFileDropDeps(counts);

    await engine.tick({ event: 'WORKSPACE_CREATED' });

    expect(startPurpose).not.toHaveBeenCalled();
    expect(saved.current?.quests['first-file-drop']).toBeUndefined();
  });

  it('starts manually from the task list when workspace is ready', async () => {
    const counts = { workspaces: 1 };
    const { engine, startPurpose, saved } = makeFileDropDeps(counts);

    const result = await engine.startQuest('first-file-drop', { source: 'task-list' });

    expect(result).toMatchObject({ accepted: true, status: 'started' });
    expect(startPurpose).toHaveBeenCalledTimes(1);
    expect(startPurpose.mock.calls[0][0]).toMatchObject({
      kind: 'onboarding.file.drop',
      presetId: 'onboarding.file.drop',
      priority: 68,
      coalesceKey: 'onboarding.file.drop',
      plannerMode: 'preset-only'
    });
    expect(saved.current?.quests['first-file-drop']).toMatchObject({ status: 'active', activatedAt: 1000 });
  });

  it('uses the import achievement as a durable completion marker', async () => {
    const counts = { workspaces: 1 };
    const { engine, startPurpose, grantReward, hasAchievement, saved } = makeFileDropDeps(counts);
    hasAchievement.mockImplementation((id) => id === 'first-import');

    await engine.tick({ event: 'APP_STARTED' });

    expect(startPurpose).not.toHaveBeenCalled();
    expect(grantReward).not.toHaveBeenCalled();
    expect(saved.current?.quests['first-file-drop']).toMatchObject({ status: 'done', completedAt: 1000 });
  });

  it('can be started explicitly by AI when workspace is ready', async () => {
    const counts = { workspaces: 1 };
    const { engine, startPurpose, saved } = makeFileDropDeps(counts);

    const result = await engine.startQuest('first-file-drop', { source: 'ai' });

    expect(result).toMatchObject({ accepted: true, status: 'started' });
    expect(startPurpose).toHaveBeenCalledTimes(1);
    expect(saved.current?.quests['first-file-drop']).toMatchObject({ status: 'active', activatedAt: 1000 });
  });

  it('can be started explicitly from a recommendation when workspace is ready', async () => {
    const counts = { workspaces: 1 };
    const { engine, startPurpose, saved } = makeFileDropDeps(counts);

    const result = await engine.startQuest('first-file-drop', { source: 'recommendation' });

    expect(result).toMatchObject({ accepted: true, status: 'started' });
    expect(startPurpose).toHaveBeenCalledTimes(1);
    expect(saved.current?.quests['first-file-drop']).toMatchObject({ status: 'active', activatedAt: 1000 });
  });

  it('does not activate before workspace is ready', async () => {
    const counts = { workspaces: 0 };
    const { engine, startPurpose } = makeFileDropDeps(counts);

    await engine.tick({ event: 'APP_STARTED' });

    expect(startPurpose).not.toHaveBeenCalled();
  });

  it('rejects manual start before workspace is ready', async () => {
    const counts = { workspaces: 0 };
    const { engine, startPurpose } = makeFileDropDeps(counts);

    await expect(engine.startQuest('first-file-drop')).rejects.toThrow('precondition is not satisfied');

    expect(startPurpose).not.toHaveBeenCalled();
  });

  it('builds a quest list item with first file drop rewards and action', () => {
    const quest = createFirstFileDropQuest({ countWorkspaces: () => 1 });
    const snapshot = createQuestListSnapshot({
      definitions: [quest],
      state: {
        version: 1,
        quests: {
          'workspace.create': {
            status: 'done',
            completedAt: 900
          },
          'first-file-drop': {
            status: 'pending'
          }
        }
      }
    });

    expect(snapshot.items[0]).toMatchObject({
      id: 'first-file-drop',
      category: 'onboarding',
      title: '把第一个文件拖给我',
      reward: { xp: 15, favor: 2, achievementId: 'first-import' },
      rewardSource: 'quest:first-file-drop',
      recommendation: {
        questId: 'open-resource-library'
      },
      action: {
        kind: 'start-quest',
        label: '开始引导',
        questId: 'first-file-drop',
        purposeKind: 'onboarding.file.drop'
      }
    });
  });

  it('does not complete from a non sprite-drop RESOURCE_CREATED event', async () => {
    const counts = { workspaces: 1 };
    const { engine, grantReward, saved } = makeFileDropDeps(counts);

    await engine.tick({ event: 'RESOURCE_CREATED', eventPayload: { id: 'resource-1', metadata: JSON.stringify({ source: 'manual' }) } });

    expect(grantReward).not.toHaveBeenCalled();
    expect(saved.current?.quests['first-file-drop']).toBeUndefined();
  });

  it('completes and rewards when a sprite-drop resource is created', async () => {
    const counts = { workspaces: 1 };
    const { engine, grantReward, saved } = makeFileDropDeps(counts);

    await engine.tick({ event: 'RESOURCE_CREATED', eventPayload: { id: 'resource-1', metadata: JSON.stringify({ source: 'sprite-drop' }) } });

    expect(grantReward).toHaveBeenCalledTimes(1);
    expect(grantReward.mock.calls[0]).toEqual([{ xp: 15, favor: 2, achievementId: 'first-import' }, 'quest:first-file-drop']);
    expect(saved.current?.quests['first-file-drop'].status).toBe('done');
  });

  it('completes and rewards when a sprite-drop import completion event fires', async () => {
    const counts = { workspaces: 1 };
    const { engine, grantReward, saved } = makeFileDropDeps(counts);

    await engine.tick({ event: 'SPRITE_RESOURCE_IMPORT_COMPLETE', eventPayload: { count: 1, purposeSource: 'sprite-drop' } });

    expect(grantReward).toHaveBeenCalledTimes(1);
    expect(saved.current?.quests['first-file-drop'].status).toBe('done');
  });

  it('does not complete from a non sprite-drop import completion event', async () => {
    const counts = { workspaces: 1 };
    const { engine, grantReward, saved } = makeFileDropDeps(counts);

    await engine.tick({ event: 'SPRITE_RESOURCE_IMPORT_COMPLETE', eventPayload: { count: 1 } });

    expect(grantReward).not.toHaveBeenCalled();
    expect(saved.current?.quests['first-file-drop']).toBeUndefined();
  });
});

describe('QuestEngine — open-resource-library onboarding quest', () => {
  function makeOpenResourceLibraryDeps(counts: { workspaces: number }): {
    engine: QuestEngine;
    startPurpose: ReturnType<typeof vi.fn>;
    grantReward: ReturnType<typeof vi.fn>;
    hasAchievement: ReturnType<typeof vi.fn>;
    saved: { current: ReturnType<typeof createEmptyOnboardingState> | null };
  } {
    const reg = new QuestRegistry();
    reg.register(createOpenResourceLibraryQuest({ countWorkspaces: () => counts.workspaces }));

    const startPurpose = vi.fn(async () => ({
      accepted: true as const,
      purpose: {
        id: 'p-open-library',
        kind: 'onboarding.resource.open-library',
        title: '',
        reason: '',
        source: 'system-event' as const,
        status: 'queued' as const,
        priority: 66,
        interruptPolicy: 'interruptible' as const
      },
      status: 'started' as const
    }));
    const grantReward = vi.fn(async () => undefined);
    const hasAchievement = vi.fn(() => false);
    const saved: { current: any } = {
      current: {
        version: 1,
        quests: {
          'workspace.create': {
            status: 'done',
            completedAt: 900
          }
        }
      }
    };

    const engine = new QuestEngine({
      registry: reg,
      startPurpose,
      hasAchievement,
      grantReward,
      loadState: () => saved.current,
      saveState: (state) => {
        saved.current = JSON.parse(JSON.stringify(state));
      },
      now: () => 1000
    });

    return { engine, startPurpose, grantReward, hasAchievement, saved };
  }

  it('does not auto activate on app startup when workspace is ready', async () => {
    const counts = { workspaces: 1 };
    const { engine, startPurpose, saved } = makeOpenResourceLibraryDeps(counts);

    await engine.tick({ event: 'APP_STARTED' });

    expect(startPurpose).not.toHaveBeenCalled();
    expect(saved.current?.quests['open-resource-library']).toBeUndefined();
  });

  it('starts manually from the task list when workspace is ready', async () => {
    const counts = { workspaces: 1 };
    const { engine, startPurpose, saved } = makeOpenResourceLibraryDeps(counts);

    const result = await engine.startQuest('open-resource-library', { source: 'task-list' });

    expect(result).toMatchObject({ accepted: true, status: 'started' });
    expect(startPurpose).toHaveBeenCalledTimes(1);
    expect(startPurpose.mock.calls[0][0]).toMatchObject({
      kind: 'onboarding.resource.open-library',
      presetId: 'onboarding.resource.open-library',
      priority: 66,
      coalesceKey: 'onboarding.resource.open-library',
      plannerMode: 'preset-only'
    });
    expect(saved.current?.quests['open-resource-library']).toMatchObject({ status: 'active', activatedAt: 1000 });
  });

  it('does not restart inventory guidance after its achievement is unlocked', async () => {
    const counts = { workspaces: 1 };
    const { engine, startPurpose, grantReward, hasAchievement, saved } = makeOpenResourceLibraryDeps(counts);
    hasAchievement.mockImplementation((id) => id === 'first-resource-library-open');

    const result = await engine.startQuest('open-resource-library', { source: 'task-list' });

    expect(result).toBeNull();
    expect(startPurpose).not.toHaveBeenCalled();
    expect(grantReward).not.toHaveBeenCalled();
    expect(saved.current?.quests['open-resource-library']).toMatchObject({ status: 'done', completedAt: 1000 });
  });

  it('builds a quest list item with inventory rewards and action', () => {
    const quest = createOpenResourceLibraryQuest({ countWorkspaces: () => 1 });
    const snapshot = createQuestListSnapshot({
      definitions: [quest],
      state: {
        version: 1,
        quests: {
          'workspace.create': {
            status: 'done',
            completedAt: 900
          },
          'open-resource-library': {
            status: 'pending'
          }
        }
      }
    });

    expect(snapshot.items[0]).toMatchObject({
      id: 'open-resource-library',
      category: 'onboarding',
      title: '打开背包',
      reward: { xp: 10, favor: 1, achievementId: 'first-resource-library-open' },
      rewardSource: 'quest:open-resource-library',
      action: {
        kind: 'start-quest',
        label: '开始引导',
        questId: 'open-resource-library',
        windowKey: 'inventory',
        purposeKind: 'onboarding.resource.open-library'
      }
    });
    expect(snapshot.items[0].recommendation).toBeUndefined();
  });

  it('completes and rewards only when inventory is selected from the assistant menu', async () => {
    const counts = { workspaces: 1 };
    const { engine, grantReward, saved } = makeOpenResourceLibraryDeps(counts);

    await engine.tick({ event: 'ASSISTANT_MENU_ITEM_SELECTED', eventPayload: { itemId: 'chat', windowKey: 'chat', source: 'assistant-context-menu' } });
    await engine.tick({ event: 'ASSISTANT_MENU_ITEM_SELECTED', eventPayload: { itemId: 'inventory', windowKey: 'inventory', source: 'ai' } });
    await engine.tick({ event: 'ASSISTANT_MENU_ITEM_SELECTED', eventPayload: { itemId: 'resources', windowKey: 'resources', source: 'assistant-context-menu' } });

    expect(grantReward).not.toHaveBeenCalled();
    expect(saved.current?.quests['open-resource-library']).toBeUndefined();

    await engine.tick({ event: 'ASSISTANT_MENU_ITEM_SELECTED', eventPayload: { itemId: 'inventory', windowKey: 'inventory', source: 'assistant-context-menu' } });

    expect(grantReward).toHaveBeenCalledTimes(1);
    expect(grantReward.mock.calls[0]).toEqual([{ xp: 10, favor: 1, achievementId: 'first-resource-library-open' }, 'quest:open-resource-library']);
    expect(saved.current?.quests['open-resource-library'].status).toBe('done');
  });
});

describe('QuestEngine — feature file video transcription intro quest', () => {
  function makeFeatureIntroDeps(counts: { workspaces: number }): {
    engine: QuestEngine;
    startPurpose: ReturnType<typeof vi.fn>;
    grantReward: ReturnType<typeof vi.fn>;
    hasAchievement: ReturnType<typeof vi.fn>;
    saved: { current: ReturnType<typeof createEmptyOnboardingState> | null };
  } {
    const reg = new QuestRegistry();
    reg.register(createFileVideoTranscriptionIntroQuest({ countWorkspaces: () => counts.workspaces }));

    const startPurpose = vi.fn(async () => ({
      accepted: true as const,
      purpose: {
        id: 'p-feature-file',
        kind: 'feature.file-video-transcription',
        title: '',
        reason: '',
        source: 'system-event' as const,
        status: 'queued' as const,
        priority: 64,
        interruptPolicy: 'interruptible' as const
      },
      status: 'started' as const
    }));
    const grantReward = vi.fn(async () => undefined);
    const hasAchievement = vi.fn(() => false);
    const saved: { current: any } = {
      current: {
        version: 1,
        quests: {
          'workspace.create': {
            status: 'done',
            completedAt: 900
          }
        }
      }
    };

    const engine = new QuestEngine({
      registry: reg,
      startPurpose,
      hasAchievement,
      grantReward,
      loadState: () => saved.current,
      saveState: (state) => {
        saved.current = JSON.parse(JSON.stringify(state));
      },
      now: () => 1000
    });

    return { engine, startPurpose, grantReward, hasAchievement, saved };
  }

  it('does not auto activate on app startup when workspace is ready', async () => {
    const counts = { workspaces: 1 };
    const { engine, startPurpose, saved } = makeFeatureIntroDeps(counts);

    await engine.tick({ event: 'APP_STARTED' });

    expect(startPurpose).not.toHaveBeenCalled();
    expect(saved.current?.quests['feature.file-video-transcription']).toBeUndefined();
  });

  it('starts manually from the task list when workspace is ready', async () => {
    const counts = { workspaces: 1 };
    const { engine, startPurpose, saved } = makeFeatureIntroDeps(counts);

    const result = await engine.startQuest('feature.file-video-transcription', { source: 'task-list' });

    expect(result).toMatchObject({ accepted: true, status: 'started' });
    expect(startPurpose).toHaveBeenCalledTimes(1);
    expect(startPurpose.mock.calls[0][0]).toMatchObject({
      kind: 'feature.file-video-transcription',
      presetId: 'feature.file-video-transcription',
      priority: 64,
      coalesceKey: 'feature.file-video-transcription',
      plannerMode: 'preset-only'
    });
    expect(saved.current?.quests['feature.file-video-transcription']).toMatchObject({ status: 'active', activatedAt: 1000 });
  });

  it('does not replay a feature intro when its achievement is already unlocked', async () => {
    const counts = { workspaces: 1 };
    const { engine, startPurpose, grantReward, hasAchievement, saved } = makeFeatureIntroDeps(counts);
    hasAchievement.mockImplementation((id) => id === 'feature-file-transcription-introduced');

    const result = await engine.startQuest('feature.file-video-transcription', { source: 'task-list' });

    expect(result).toBeNull();
    expect(startPurpose).not.toHaveBeenCalled();
    expect(grantReward).not.toHaveBeenCalled();
    expect(saved.current?.quests['feature.file-video-transcription']).toMatchObject({ status: 'done', completedAt: 1000 });
  });

  it('builds a quest list item with feature-intro category and rewards', () => {
    const quest = createFileVideoTranscriptionIntroQuest({ countWorkspaces: () => 1 });
    const snapshot = createQuestListSnapshot({
      definitions: [quest],
      state: {
        version: 1,
        quests: {
          'workspace.create': {
            status: 'done',
            completedAt: 900
          }
        }
      }
    });

    expect(snapshot.items[0]).toMatchObject({
      id: 'feature.file-video-transcription',
      category: 'feature-intro',
      title: '认识文件转写流程',
      reward: { xp: 12, favor: 1, achievementId: 'feature-file-transcription-introduced' },
      rewardSource: 'quest:feature.file-video-transcription',
      recommendation: {
        questId: 'feature.resource-library-preview'
      },
      action: {
        kind: 'start-quest',
        label: '开始介绍',
        questId: 'feature.file-video-transcription',
        purposeKind: 'feature.file-video-transcription'
      }
    });
  });

  it('does not recommend resource chat after the resource preview intro', () => {
    const item = FEATURE_INTRO_QUEST_CATALOG.find((entry) => entry.id === 'feature.resource-library-preview');
    expect(item).toBeDefined();
    const quest = createFeatureIntroQuest({ countWorkspaces: () => 1 }, item!);
    const snapshot = createQuestListSnapshot({
      definitions: [quest],
      state: {
        version: 1,
        quests: {
          'workspace.create': {
            status: 'done',
            completedAt: 900
          }
        }
      }
    });

    expect(snapshot.items[0]).toMatchObject({
      id: 'feature.resource-library-preview',
      category: 'feature-intro'
    });
    expect(snapshot.items[0].recommendation).toBeUndefined();
  });

  it('completes only when the transcription workflow starts', async () => {
    const counts = { workspaces: 1 };
    const { engine, grantReward, saved } = makeFeatureIntroDeps(counts);

    await engine.tick({ event: 'FILE_ACTION_WORKFLOW_STARTED', eventPayload: { actionId: 'video-keyframes', workflowId: 'sample:video-keyframes' } });

    expect(grantReward).not.toHaveBeenCalled();
    expect(saved.current?.quests['feature.file-video-transcription']).toBeUndefined();

    await engine.tick({
      event: 'FILE_ACTION_WORKFLOW_STARTED',
      eventPayload: {
        actionId: 'video-stt',
        actionPurpose: 'video transcription',
        workflowId: 'sample:transcribe',
        workflowRunId: 'run-1'
      }
    });

    expect(grantReward).toHaveBeenCalledTimes(1);
    expect(grantReward.mock.calls[0]).toEqual([{ xp: 12, favor: 1, achievementId: 'feature-file-transcription-introduced' }, 'quest:feature.file-video-transcription']);
    expect(saved.current?.quests['feature.file-video-transcription'].status).toBe('done');
  });
});

describe('QuestEngine — feature intro catalog quests', () => {
  function makeFeatureQuestEngine(questId: string): {
    engine: QuestEngine;
    grantReward: ReturnType<typeof vi.fn>;
    saved: { current: ReturnType<typeof createEmptyOnboardingState> | null };
    startPurpose: ReturnType<typeof vi.fn>;
    hasAchievement: ReturnType<typeof vi.fn>;
  } {
    const item = FEATURE_INTRO_QUEST_CATALOG.find((candidate) => candidate.id === questId);
    if (!item) throw new Error(`Missing catalog item: ${questId}`);
    const reg = new QuestRegistry();
    reg.register(createFeatureIntroQuest({ countWorkspaces: () => 1 }, item));
    const startPurpose = vi.fn(async (request) => ({
      accepted: true as const,
      purpose: {
        id: `p-${questId}`,
        kind: request.kind,
        title: request.title ?? '',
        reason: request.reason,
        source: request.source,
        status: 'queued' as const,
        priority: request.priority ?? 0,
        interruptPolicy: request.interruptPolicy ?? ('interruptible' as const)
      },
      status: 'started' as const
    }));
    const grantReward = vi.fn(async () => undefined);
    const hasAchievement = vi.fn(() => false);
    const saved: { current: any } = { current: createEmptyOnboardingState() };
    const engine = new QuestEngine({
      registry: reg,
      startPurpose,
      hasAchievement,
      grantReward,
      loadState: () => saved.current,
      saveState: (state) => {
        saved.current = JSON.parse(JSON.stringify(state));
      },
      now: () => 1000
    });
    return { engine, grantReward, saved, startPurpose, hasAchievement };
  }

  it('creates an explicit preset-only start request for every catalog item', async () => {
    for (const item of FEATURE_INTRO_QUEST_CATALOG) {
      const { engine, startPurpose, saved } = makeFeatureQuestEngine(item.id);
      await engine.startQuest(item.id, { source: 'task-list' });

      expect(startPurpose).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: item.id,
          presetId: item.id,
          plannerMode: 'preset-only',
          coalesceKey: item.id,
          context: expect.objectContaining({ featureIntroId: item.id })
        })
      );
      expect(saved.current?.quests[item.id]).toMatchObject({ status: 'active', activatedAt: 1000 });
    }
  });

  it('completes representative feature intro completion kinds', async () => {
    const cases: Array<{ id: string; event: string; payload: Record<string, unknown> }> = [
      {
        id: 'feature.media-transcode',
        event: 'FILE_ACTION_WORKFLOW_STARTED',
        payload: { actionId: 'audio-transcode', workflowId: 'sample:transcode' }
      },
      {
        id: 'feature.subtitle-translate',
        event: 'FILE_ACTION_SELECTED',
        payload: { actionId: 'subtitle-translate' }
      },
      {
        id: 'feature.skill-tree',
        event: 'ASSISTANT_MENU_ITEM_SELECTED',
        payload: { itemId: 'skill-tree', windowKey: 'skillTree', source: 'assistant-context-menu' }
      },
      {
        id: 'feature.workflow-gallery',
        event: 'APP_WINDOW_OPENED',
        payload: { windowKey: 'resources', route: 'workflows' }
      },
      {
        id: 'feature.resource-library-preview',
        event: 'RESOURCE_PREVIEW_OPENED',
        payload: { resourceId: 'resource-1' }
      },
      {
        id: 'feature.chat-with-resource',
        event: 'SPRITE_AI_COMPLETE',
        payload: { hasResourceContext: true, resourceIds: ['resource-1'] }
      }
    ];

    for (const item of cases) {
      const { engine, grantReward, saved } = makeFeatureQuestEngine(item.id);
      await engine.tick({ event: item.event, eventPayload: item.payload });

      expect(grantReward, item.id).toHaveBeenCalledTimes(1);
      expect(saved.current?.quests[item.id].status, item.id).toBe('done');
    }
  });

  it('does not complete resource chat intro without resource context', async () => {
    const { engine, grantReward, saved } = makeFeatureQuestEngine('feature.chat-with-resource');

    await engine.tick({ event: 'SPRITE_AI_COMPLETE', eventPayload: { hasResourceContext: false } });

    expect(grantReward).not.toHaveBeenCalled();
    expect(saved.current?.quests['feature.chat-with-resource']).toBeUndefined();
  });
});
