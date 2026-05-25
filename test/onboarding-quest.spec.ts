import { describe, expect, it, vi } from 'vitest';

import {
  createFeatureIntroQuest,
  createFeatureIntroQuests,
  createFileVideoTranscriptionIntroQuest,
  createFirstFileDropQuest,
  createOnboardingQuestRegistry,
  createOpenResourceLibraryQuest,
  createQuestListSnapshot,
  createWorkspaceCreateQuest,
  QuestEngine,
  QuestRegistry
} from '../packages/sprite-core/quest';
import { FEATURE_INTRO_QUEST_CATALOG } from '../packages/sprite-core/feature-intro-catalog';
import { createEmptyOnboardingState } from '../packages/sprite-core/quest/types';

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

    expect(reg.list().map((quest) => quest.id)).toEqual(['workspace.create', 'first-file-drop', 'open-resource-library', ...featureIds]);
    expect(reg.get('workspace.create')?.autoStartEvents).toEqual(['APP_STARTED']);
    expect(reg.get('first-file-drop')?.autoStartEvents).toBeUndefined();
    expect(reg.get('first-file-drop')?.explicitStartSources).toEqual(['task-list', 'ai']);
    expect(reg.get('open-resource-library')?.autoStartEvents).toBeUndefined();
    expect(reg.get('open-resource-library')?.explicitStartSources).toEqual(['task-list', 'ai']);
    expect(createFeatureIntroQuests({ countWorkspaces: () => 1 }).map((quest) => quest.id)).toEqual(featureIds);
    expect(reg.byTriggerEvent('RESOURCE_CREATED').map((quest) => quest.id)).toEqual(['first-file-drop']);
    expect(reg.byTriggerEvent('ASSISTANT_MENU_ITEM_SELECTED').map((quest) => quest.id)).toEqual(
      expect.arrayContaining(['open-resource-library', 'feature.inventory', 'feature.quest-list', 'feature.asr-microphone', 'feature.system-audio-asr', 'feature.tts-config', 'feature.memory-graph', 'feature.skill-tree'])
    );
    expect(reg.byTriggerEvent('FILE_ACTION_WORKFLOW_STARTED').map((quest) => quest.id)).toEqual(
      expect.arrayContaining(['feature.file-video-transcription', 'feature.video-keyframes', 'feature.media-transcode', 'feature.image-understand', 'feature.ocr'])
    );
    expect(reg.byTriggerEvent('APP_WINDOW_OPENED').map((quest) => quest.id)).toEqual(
      expect.arrayContaining(['feature.workflow-gallery', 'feature.plugin-manager', 'feature.window-animation-editor', 'feature.character-pack-editor'])
    );
    expect(reg.byTriggerEvent('AI_PROVIDER_CONFIG_UPDATED').map((quest) => quest.id)).toEqual(['feature.ai-provider-config']);
    expect(reg.byTriggerEvent('APP_STARTED').map((quest) => quest.id)).toEqual(['workspace.create']);
  });
});

describe('QuestEngine — workspace.create happy path', () => {
  function makeDeps(workspaceCount: { value: number }): {
    engine: QuestEngine;
    startPurpose: ReturnType<typeof vi.fn>;
    grantReward: ReturnType<typeof vi.fn>;
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
    const saved: { current: any } = { current: null };

    const engine = new QuestEngine({
      registry: reg,
      startPurpose,
      grantReward,
      loadState: () => saved.current,
      saveState: (state) => {
        saved.current = JSON.parse(JSON.stringify(state));
      },
      now: () => 1000
    });

    return { engine, startPurpose, grantReward, saved };
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
    const { engine, startPurpose } = makeDeps(wsCount);

    await engine.tick({ event: 'APP_STARTED' });
    await engine.tick({ event: 'UNRELATED' });

    expect(startPurpose).toHaveBeenCalledTimes(1);
  });

  it('keeps wizard close as a tracked event but lets the active routine own immediate reprompting', async () => {
    const wsCount = { value: 0 };
    const { engine, startPurpose } = makeDeps(wsCount);

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

describe('QuestEngine — first-file-drop onboarding quest', () => {
  function makeFileDropDeps(counts: { workspaces: number }): {
    engine: QuestEngine;
    startPurpose: ReturnType<typeof vi.fn>;
    grantReward: ReturnType<typeof vi.fn>;
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
      grantReward,
      loadState: () => saved.current,
      saveState: (state) => {
        saved.current = JSON.parse(JSON.stringify(state));
      },
      now: () => 1000
    });

    return { engine, startPurpose, grantReward, saved };
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

  it('can be started explicitly by AI when workspace is ready', async () => {
    const counts = { workspaces: 1 };
    const { engine, startPurpose, saved } = makeFileDropDeps(counts);

    const result = await engine.startQuest('first-file-drop', { source: 'ai' });

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
      grantReward,
      loadState: () => saved.current,
      saveState: (state) => {
        saved.current = JSON.parse(JSON.stringify(state));
      },
      now: () => 1000
    });

    return { engine, startPurpose, grantReward, saved };
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

  it('builds a quest list item with resource library rewards and action', () => {
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
      title: '打开资源库',
      reward: { xp: 10, favor: 1, achievementId: 'first-resource-library-open' },
      rewardSource: 'quest:open-resource-library',
      action: {
        kind: 'start-quest',
        label: '开始引导',
        questId: 'open-resource-library',
        windowKey: 'resources',
        purposeKind: 'onboarding.resource.open-library'
      }
    });
  });

  it('completes and rewards only when resources is selected from the assistant menu', async () => {
    const counts = { workspaces: 1 };
    const { engine, grantReward, saved } = makeOpenResourceLibraryDeps(counts);

    await engine.tick({ event: 'ASSISTANT_MENU_ITEM_SELECTED', eventPayload: { itemId: 'chat', windowKey: 'chat', source: 'assistant-context-menu' } });
    await engine.tick({ event: 'ASSISTANT_MENU_ITEM_SELECTED', eventPayload: { itemId: 'resources', windowKey: 'resources', source: 'ai' } });

    expect(grantReward).not.toHaveBeenCalled();
    expect(saved.current?.quests['open-resource-library']).toBeUndefined();

    await engine.tick({ event: 'ASSISTANT_MENU_ITEM_SELECTED', eventPayload: { itemId: 'resources', windowKey: 'resources', source: 'assistant-context-menu' } });

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
      grantReward,
      loadState: () => saved.current,
      saveState: (state) => {
        saved.current = JSON.parse(JSON.stringify(state));
      },
      now: () => 1000
    });

    return { engine, startPurpose, grantReward, saved };
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
      action: {
        kind: 'start-quest',
        label: '开始介绍',
        questId: 'feature.file-video-transcription',
        purposeKind: 'feature.file-video-transcription'
      }
    });
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
        interruptPolicy: request.interruptPolicy ?? 'interruptible' as const
      },
      status: 'started' as const
    }));
    const grantReward = vi.fn(async () => undefined);
    const saved: { current: any } = { current: createEmptyOnboardingState() };
    const engine = new QuestEngine({
      registry: reg,
      startPurpose,
      grantReward,
      loadState: () => saved.current,
      saveState: (state) => {
        saved.current = JSON.parse(JSON.stringify(state));
      },
      now: () => 1000
    });
    return { engine, grantReward, saved, startPurpose };
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
      },
      {
        id: 'feature.ai-provider-config',
        event: 'AI_PROVIDER_CONFIG_UPDATED',
        payload: { providerId: 'openai', presetId: 'preset-openai', action: 'preset-secrets-updated' }
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
