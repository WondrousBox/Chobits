import { FEATURE_INTRO_QUEST_CATALOG, type FeatureIntroCompletionSpec, type FeatureIntroQuestCatalogItem } from '../feature-intro-catalog';
import { createAchievementUnlockedGuideGoal, FIRST_FILE_DROP_GUIDE_GOAL, OPEN_RESOURCE_LIBRARY_GUIDE_GOAL, WORKSPACE_EXISTS_GUIDE_GOAL } from '../purpose/guide-goals';
import type { StartSpritePurposeRequest } from '../purpose/types';
import { QuestRegistry } from './quest-registry';
import type { OnboardingQuestDefinition, QuestPredicateContext } from './types';

/**
 * 依赖：检查工作空间数量的回调。由调用方注入（main 进程中查 DB，测试中 mock）。
 */
export interface OnboardingPresetDeps {
  /** 返回当前未删除的工作空间数量 */
  countWorkspaces: () => Promise<number> | number;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function hasSpriteDropSource(payload: unknown): boolean {
  const record = readRecord(payload);
  if (!record) return false;
  if (record.purposeSource === 'sprite-drop') return true;
  if (record.source === 'sprite-drop') return true;
  const resource = readRecord(record.resource) ?? record;
  const metadata = resource.metadata;
  if (typeof metadata !== 'string' || !metadata.trim()) return false;
  try {
    return readRecord(JSON.parse(metadata))?.source === 'sprite-drop';
  } catch {
    return false;
  }
}

function isAssistantResourceMenuSelection(payload: unknown): boolean {
  const record = readRecord(payload);
  return record?.itemId === 'resources' && record.windowKey === 'resources' && record.source === 'assistant-context-menu';
}

function readPath(record: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, part) => {
    if (typeof current !== 'object' || current === null) return undefined;
    return (current as Record<string, unknown>)[part];
  }, record);
}

function eventPayloadMatches(payload: unknown, expected?: Record<string, unknown>): boolean {
  if (!expected || Object.keys(expected).length === 0) return true;
  const record = readRecord(payload);
  if (!record) return false;
  for (const [key, value] of Object.entries(expected)) {
    if (readPath(record, key) !== value) return false;
  }
  return true;
}

function readPayloadString(payload: unknown, key: string): string | undefined {
  const record = readRecord(payload);
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function isFileWorkflowStarted(payload: unknown, options: { actionIds?: string[]; workflowIds?: string[] }): boolean {
  const record = readRecord(payload);
  if (!record) return false;
  if (options.workflowIds && options.workflowIds.length > 0 && !options.workflowIds.includes(String(record.workflowId ?? ''))) return false;
  if (options.actionIds && options.actionIds.length > 0) {
    const actionId = typeof record.actionId === 'string' ? record.actionId : undefined;
    const actionPurpose = typeof record.actionPurpose === 'string' ? record.actionPurpose : undefined;
    if (!actionId && !actionPurpose) return false;
    if (actionId && options.actionIds.includes(actionId)) return true;
    if (actionPurpose && /transcription/i.test(actionPurpose)) return true;
    return false;
  }
  return true;
}

function isFileActionSelected(payload: unknown, actionIds: string[]): boolean {
  const actionId = readPayloadString(payload, 'actionId');
  return !!actionId && actionIds.includes(actionId);
}

function isWorkflowStarted(payload: unknown, workflowIds: string[]): boolean {
  const workflowId = readPayloadString(payload, 'workflowId');
  return !!workflowId && workflowIds.includes(workflowId);
}

function isAssistantMenuSelection(payload: unknown, options: { itemId: string; windowKey?: string }): boolean {
  const record = readRecord(payload);
  if (!record) return false;
  if (record.itemId !== options.itemId) return false;
  if (options.windowKey && record.windowKey !== options.windowKey) return false;
  return record.source === 'assistant-context-menu';
}

function isAppWindowOpened(payload: unknown, options: { windowKey: string; route?: string }): boolean {
  const record = readRecord(payload);
  if (!record) return false;
  if (record.windowKey !== options.windowKey) return false;
  if (options.route && record.route !== options.route) return false;
  return true;
}

function getFeatureIntroTriggerEvents(completion: FeatureIntroCompletionSpec): string[] {
  switch (completion.kind) {
    case 'file-workflow-started':
      return ['FILE_ACTION_WORKFLOW_STARTED'];
    case 'file-action-selected':
      return ['FILE_ACTION_SELECTED'];
    case 'assistant-menu-selected':
      return ['ASSISTANT_MENU_ITEM_SELECTED'];
    case 'app-window-opened':
      return ['APP_WINDOW_OPENED'];
    case 'app-event':
      return completion.events;
    case 'workflow-started':
      return ['SPRITE_WORKFLOW_START'];
    default:
      return [];
  }
}

function isFeatureIntroCompleted(completion: FeatureIntroCompletionSpec, ctx: QuestPredicateContext): boolean {
  switch (completion.kind) {
    case 'file-workflow-started':
      return ctx.event === 'FILE_ACTION_WORKFLOW_STARTED' && isFileWorkflowStarted(ctx.eventPayload, { actionIds: completion.actionIds, workflowIds: completion.workflowIds });
    case 'file-action-selected':
      return ctx.event === 'FILE_ACTION_SELECTED' && isFileActionSelected(ctx.eventPayload, completion.actionIds);
    case 'assistant-menu-selected':
      return ctx.event === 'ASSISTANT_MENU_ITEM_SELECTED' && isAssistantMenuSelection(ctx.eventPayload, completion);
    case 'app-window-opened':
      return ctx.event === 'APP_WINDOW_OPENED' && isAppWindowOpened(ctx.eventPayload, completion);
    case 'app-event':
      return !!ctx.event && completion.events.includes(ctx.event) && eventPayloadMatches(ctx.eventPayload, completion.match);
    case 'workflow-started':
      return ctx.event === 'SPRITE_WORKFLOW_START' && isWorkflowStarted(ctx.eventPayload, completion.workflowIds);
    default:
      return false;
  }
}

function createWorkspaceReadyPredicate(deps: OnboardingPresetDeps) {
  return async (): Promise<boolean> => {
    const workspaceCount = await Promise.resolve(deps.countWorkspaces());
    return workspaceCount > 0;
  };
}

/**
 * "workspace.create" 新手引导任务：
 * - precondition：工作空间数量为 0；
 * - completion：监听 AppEvent.WORKSPACE_CREATED；
 * - reward：XP+20、Favor+3、achievement: 'first-workspace'。
 */
export function createWorkspaceCreateQuest(deps: OnboardingPresetDeps): OnboardingQuestDefinition {
  return {
    id: 'workspace.create',
    category: 'onboarding',
    title: '创建你的第一个工作空间',
    description: '建立资源、文件、对话和记忆索引的基础空间。',
    display: {
      actionLabel: '开始引导',
      activeActionLabel: '继续引导',
      actionWindowKey: 'workspaceWizard',
      actionPurposeKind: 'onboarding.workspace.create'
    },
    oneShot: true,
    triggerEvents: ['WORKSPACE_CREATED', 'WORKSPACE_WIZARD_CLOSED', 'APP_STARTED'],
    autoStartEvents: ['APP_STARTED'],
    explicitStartSources: ['task-list', 'ai', 'recommendation'],
    retriable: true,
    retryEvents: ['APP_STARTED'],
    precondition: {
      id: 'no-workspace-exists',
      evaluate: async () => {
        const count = await Promise.resolve(deps.countWorkspaces());
        return count <= 0;
      }
    },
    completion: {
      id: 'workspace-created-event',
      evaluate: async (ctx) => {
        // 1) AppEvent 命中：直接判定完成
        if (ctx.event === 'WORKSPACE_CREATED') return true;
        // 2) 启动时回放：若工作空间已存在但 quest 尚未标记 done，也视作完成（防止跨次启动漏发）
        const count = await Promise.resolve(deps.countWorkspaces());
        return count > 0;
      }
    },
    goal: WORKSPACE_EXISTS_GUIDE_GOAL,
    recommendation: {
      questId: 'first-file-drop',
      delayMs: 5000,
      prompt: '要不要接着试试把第一个文件拖给我？',
      confirmLabel: '继续'
    },
    reward: {
      xp: 20,
      favor: 3,
      achievementId: 'first-workspace'
    },
    rewardSource: 'quest:workspace.create',
    toPurposeRequest: (): StartSpritePurposeRequest => ({
      kind: 'onboarding.workspace.create',
      reason: '引导用户创建第一个工作空间',
      source: 'system-event',
      title: '新手引导：创建工作空间',
      priority: 70,
      presetId: 'onboarding.workspace.create',
      interruptPolicy: 'urgent',
      coalesceKey: 'onboarding.workspace.create',
      plannerMode: 'preset-only'
    })
  };
}

/**
 * "first-file-drop" 新手引导任务：
 * - precondition：已具备工作空间；
 * - start：不自动启动，只能由任务列表或未来 AI 显式 startQuest；
 * - completion：监听 AppEvent.RESOURCE_CREATED / SPRITE_RESOURCE_IMPORT_COMPLETE；
 * - reward：XP+15、Favor+2、achievement: 'first-import'。
 */
export function createFirstFileDropQuest(deps: OnboardingPresetDeps): OnboardingQuestDefinition {
  const hasWorkspaceReady = async (_ctx: QuestPredicateContext): Promise<boolean> => {
    const workspaceCount = await Promise.resolve(deps.countWorkspaces());
    return workspaceCount > 0;
  };

  return {
    id: 'first-file-drop',
    category: 'onboarding',
    title: '把第一个文件拖给我',
    description: '把任意文件拖到桌面角色身上，完成一次拖拽导入。',
    display: {
      actionLabel: '开始引导',
      activeActionLabel: '继续引导',
      actionPurposeKind: 'onboarding.file.drop'
    },
    oneShot: true,
    triggerEvents: ['RESOURCE_CREATED', 'SPRITE_RESOURCE_IMPORT_COMPLETE'],
    explicitStartSources: ['task-list', 'ai', 'recommendation'],
    precondition: {
      id: 'workspace-ready',
      evaluate: async (ctx) => {
        if ((ctx.event === 'RESOURCE_CREATED' || ctx.event === 'SPRITE_RESOURCE_IMPORT_COMPLETE') && !hasSpriteDropSource(ctx.eventPayload)) {
          return false;
        }
        return hasWorkspaceReady(ctx);
      }
    },
    completion: {
      id: 'first-resource-created',
      evaluate: async (ctx) => {
        if (ctx.event === 'RESOURCE_CREATED') return hasSpriteDropSource(ctx.eventPayload);
        if (ctx.event === 'SPRITE_RESOURCE_IMPORT_COMPLETE') return hasSpriteDropSource(ctx.eventPayload);
        return false;
      }
    },
    goal: FIRST_FILE_DROP_GUIDE_GOAL,
    recommendation: {
      questId: 'open-resource-library',
      delayMs: 2500,
      prompt: '文件已经进库了。要不要接着看看资源库在哪里？',
      confirmLabel: '打开引导'
    },
    reward: {
      xp: 15,
      favor: 2,
      achievementId: 'first-import'
    },
    rewardSource: 'quest:first-file-drop',
    toPurposeRequest: (): StartSpritePurposeRequest => ({
      kind: 'onboarding.file.drop',
      reason: '引导用户把第一个文件拖到角色身上完成导入',
      source: 'system-event',
      title: '新手引导：拖拽导入文件',
      priority: 68,
      presetId: 'onboarding.file.drop',
      interruptPolicy: 'interruptible',
      coalesceKey: 'onboarding.file.drop',
      plannerMode: 'preset-only'
    })
  };
}

/**
 * "open-resource-library" 新手引导任务：
 * - precondition：已具备工作空间；
 * - start：不自动启动，只能由任务列表或未来 AI 显式 startQuest；
 * - completion：用户从助手右键菜单选择“资源库”。
 */
export function createOpenResourceLibraryQuest(deps: OnboardingPresetDeps): OnboardingQuestDefinition {
  const hasWorkspaceReady = async (): Promise<boolean> => {
    const workspaceCount = await Promise.resolve(deps.countWorkspaces());
    return workspaceCount > 0;
  };

  return {
    id: 'open-resource-library',
    category: 'onboarding',
    title: '打开资源库',
    description: '右键点击桌面助手，在菜单中打开资源库。',
    display: {
      actionLabel: '开始引导',
      activeActionLabel: '继续引导',
      actionWindowKey: 'resources',
      actionPurposeKind: 'onboarding.resource.open-library'
    },
    oneShot: true,
    triggerEvents: ['ASSISTANT_MENU_ITEM_SELECTED'],
    explicitStartSources: ['task-list', 'ai', 'recommendation'],
    precondition: {
      id: 'workspace-ready',
      evaluate: hasWorkspaceReady
    },
    completion: {
      id: 'assistant-menu-resources-selected',
      evaluate: (ctx) => ctx.event === 'ASSISTANT_MENU_ITEM_SELECTED' && isAssistantResourceMenuSelection(ctx.eventPayload)
    },
    goal: OPEN_RESOURCE_LIBRARY_GUIDE_GOAL,
    recommendation: {
      questId: 'feature.resource-library-preview',
      delayMs: 2500,
      prompt: '资源库已经打开啦。要不要继续试试预览一个资源？',
      confirmLabel: '继续'
    },
    reward: {
      xp: 10,
      favor: 1,
      achievementId: 'first-resource-library-open'
    },
    rewardSource: 'quest:open-resource-library',
    toPurposeRequest: (): StartSpritePurposeRequest => ({
      kind: 'onboarding.resource.open-library',
      reason: '引导用户通过右键助手菜单打开资源库',
      source: 'system-event',
      title: '新手引导：打开资源库',
      priority: 66,
      presetId: 'onboarding.resource.open-library',
      interruptPolicy: 'interruptible',
      coalesceKey: 'onboarding.resource.open-library',
      plannerMode: 'preset-only'
    })
  };
}

/**
 * "feature.file-video-transcription" 功能自述任务：
 * - 介绍桌面助手可以接收文件、写入资源库，并在文件操作菜单中启动工作流；
 * - 当前首个场景聚焦视频/音频转写：拖拽媒体文件到角色身上，选择“视频转写”或“识别文字（转写）”；
 * - 不自动启动，只由任务列表或未来 AI 显式触发。
 */
export function createFileVideoTranscriptionIntroQuest(deps: OnboardingPresetDeps): OnboardingQuestDefinition {
  const item = FEATURE_INTRO_QUEST_CATALOG.find((candidate) => candidate.id === 'feature.file-video-transcription');
  if (!item) {
    throw new Error('feature.file-video-transcription is missing from feature intro catalog');
  }
  return createFeatureIntroQuest(deps, item);
}

function getFeatureIntroPriority(priority: FeatureIntroQuestCatalogItem['priority']): number {
  if (priority === 'P0') return 64;
  if (priority === 'P1') return 62;
  if (priority === 'P2') return 60;
  return 58;
}

export function createFeatureIntroQuest(deps: OnboardingPresetDeps, item: FeatureIntroQuestCatalogItem): OnboardingQuestDefinition {
  const primaryWindowKey = item.routine.windowKey ?? item.routine.menuWindowKey;

  return {
    id: item.id,
    category: 'feature-intro',
    title: item.title,
    description: item.description,
    display: {
      actionLabel: '开始介绍',
      activeActionLabel: '继续介绍',
      actionWindowKey: primaryWindowKey,
      actionPurposeKind: item.id
    },
    oneShot: true,
    triggerEvents: getFeatureIntroTriggerEvents(item.completion),
    explicitStartSources: ['task-list', 'ai', 'recommendation'],
    precondition: {
      id: 'workspace-ready',
      evaluate: createWorkspaceReadyPredicate(deps)
    },
    completion: {
      id: `${item.id}.completion`,
      evaluate: (ctx) => isFeatureIntroCompleted(item.completion, ctx)
    },
    goal: createAchievementUnlockedGuideGoal({
      achievementId: item.achievementId,
      id: `${item.id}.achievement`,
      description: `功能自述「${item.title}」的完成成就已解锁。`
    }),
    recommendation: item.recommendation,
    reward: {
      xp: item.rewardXp,
      favor: item.rewardFavor,
      achievementId: item.achievementId
    },
    rewardSource: `quest:${item.id}`,
    toPurposeRequest: (): StartSpritePurposeRequest => ({
      kind: item.id,
      reason: `功能自述：${item.title}`,
      source: 'system-event',
      title: `功能自述：${item.title}`,
      priority: getFeatureIntroPriority(item.priority),
      presetId: item.id,
      interruptPolicy: 'interruptible',
      coalesceKey: item.id,
      plannerMode: 'preset-only',
      context: {
        featureIntroId: item.id,
        area: item.area,
        completionKind: item.completion.kind,
        completionEvents: getFeatureIntroTriggerEvents(item.completion),
        windowKey: primaryWindowKey
      }
    })
  };
}

export function createFeatureIntroQuests(deps: OnboardingPresetDeps): OnboardingQuestDefinition[] {
  return FEATURE_INTRO_QUEST_CATALOG.map((item) => createFeatureIntroQuest(deps, item));
}

export function createOnboardingQuestRegistry(deps: OnboardingPresetDeps): QuestRegistry {
  return new QuestRegistry([createWorkspaceCreateQuest(deps), createFirstFileDropQuest(deps), createOpenResourceLibraryQuest(deps), ...createFeatureIntroQuests(deps)]);
}
