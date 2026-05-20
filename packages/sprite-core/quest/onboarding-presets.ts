import type { StartSpritePurposeRequest } from '../purpose/types';
import type { OnboardingQuestDefinition } from './types';

/**
 * 依赖：检查工作空间数量的回调。由调用方注入（main 进程中查 DB，测试中 mock）。
 */
export interface OnboardingPresetDeps {
    /** 返回当前未删除的工作空间数量 */
    countWorkspaces: () => Promise<number> | number;
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
        oneShot: true,
        triggerEvents: ['WORKSPACE_CREATED', 'WORKSPACE_WIZARD_CLOSED', 'APP_STARTED'],
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
