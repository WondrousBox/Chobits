import type { StartSpritePurposeRequest } from '../purpose/types';
import type { OnboardingQuestDefinition, QuestPredicateContext } from './types';
import { QuestRegistry } from './quest-registry';

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
        explicitStartSources: ['task-list', 'ai'],
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
        explicitStartSources: ['task-list', 'ai'],
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
        explicitStartSources: ['task-list', 'ai'],
        precondition: {
            id: 'workspace-ready',
            evaluate: hasWorkspaceReady
        },
        completion: {
            id: 'assistant-menu-resources-selected',
            evaluate: (ctx) => ctx.event === 'ASSISTANT_MENU_ITEM_SELECTED' && isAssistantResourceMenuSelection(ctx.eventPayload)
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

export function createOnboardingQuestRegistry(deps: OnboardingPresetDeps): QuestRegistry {
    return new QuestRegistry([createWorkspaceCreateQuest(deps), createFirstFileDropQuest(deps), createOpenResourceLibraryQuest(deps)]);
}
