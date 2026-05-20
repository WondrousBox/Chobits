import type { StartSpritePurposeRequest } from '../purpose/types';

/**
 * Quest 类别。目前只有新手引导（onboarding）；后续可扩展 daily / achievement / event 等。
 */
export type QuestCategory = 'onboarding' | 'daily' | 'achievement' | 'event';

/**
 * Quest 奖励定义。
 * - xp / favor / achievementId 都是可选的；
 * - 实际发放通过 sprite:persona:grantReward IPC（grantPersonaReward 函数）；
 * - `quest:<id>` 形式的 source 会触发幂等检查，确保只发放一次。
 */
export interface OnboardingQuestReward {
    xp?: number;
    favor?: number;
    achievementId?: string;
    /** 维度增益，沿用 PersonaRewardGrant.dimensions 结构 */
    dimensions?: Array<{ id: string; delta: number; maxValue?: number }>;
}

/**
 * Quest 谓词：纯函数，根据上下文判断是否满足。
 *
 * 上下文中的 `event` 字段只在通过 AppEvent 触发的 tick 调用时存在；
 * 通过定时器或显式 tick 调用时不存在。
 */
export interface QuestPredicateContext {
    /** 当 tick 由某个 AppEvent 触发时携带的事件名（例如 'WORKSPACE_CREATED'） */
    event?: string;
    /** AppEvent 的 payload */
    eventPayload?: unknown;
    /** Quest 引擎自身维护的状态（read-only），供谓词参考 */
    onboardingState: OnboardingState;
}

export interface QuestPredicate {
    /** 描述性 id，便于调试 */
    id: string;
    /**
     * 异步判定。返回 true 即视为满足。
     * 由于通常需要查询 IPC（如 workspace:list），允许 async。
     */
    evaluate: (ctx: QuestPredicateContext) => Promise<boolean> | boolean;
}

/**
 * Quest 定义。
 */
export interface OnboardingQuestDefinition {
    /** 唯一 ID，例如 'workspace.create' */
    id: string;
    category: QuestCategory;
    title: string;
    /** 不可重复完成；true=完成后永久标记 done */
    oneShot?: boolean;
    /** 触发条件（前置）：进入该 Quest 的前置谓词，全部满足才会激活并派发 startPurpose */
    precondition?: QuestPredicate;
    /** 完成条件谓词：满足后发奖并标记 done */
    completion: QuestPredicate;
    /** 用于将 Quest 转化为 SpritePurposeManager.start 的入参 */
    toPurposeRequest: () => StartSpritePurposeRequest;
    /** 完成奖励 */
    reward?: OnboardingQuestReward;
    /** 奖励 source key；默认为 `quest:<id>` */
    rewardSource?: string;
    /** 监听的 AppEvent 名，命中时驱动 Quest tick；不监听则只靠显式 tick */
    triggerEvents?: string[];
    /** active 但尚未完成时，是否允许在指定事件上重新派发 purpose。用于启动恢复/关闭窗口后再次提醒。 */
    retriable?: boolean;
    /** retriable=true 时可重新派发的事件；默认只在 APP_STARTED 恢复。 */
    retryEvents?: string[];
    /** 完成时是否解锁附加成就（与 reward.achievementId 不同：reward 由 grantReward 处理，此处独立） */
    achievementOnComplete?: string;
}

/**
 * 单个 Quest 的运行时状态。
 */
export interface OnboardingQuestRuntimeState {
    /** 'pending' = 未开始 / 'active' = 已激活已派发 purpose / 'done' = 已完成已发奖 / 'skipped' */
    status: 'pending' | 'active' | 'done' | 'skipped';
    activatedAt?: number;
    completedAt?: number;
    /** 已派发的 purpose id（如果有），用于去重 */
    lastPurposeId?: string;
}

/**
 * 整个新手引导/任务系统的持久化状态，存到 preferences-config.json 的 `onboardingState` 字段。
 */
export interface OnboardingState {
    version: 1;
    /** 用户主动跳过整个新手引导（不影响后续 daily quest 等） */
    skipped?: boolean;
    /** 每个 Quest 的状态 */
    quests: Record<string, OnboardingQuestRuntimeState>;
}

export function createEmptyOnboardingState(): OnboardingState {
    return { version: 1, quests: {} };
}
