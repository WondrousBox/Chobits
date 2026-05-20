import type { SpritePurposeStartResult, StartSpritePurposeRequest } from '../purpose/types';

import type { QuestRegistry } from './quest-registry';
import type { OnboardingQuestDefinition, OnboardingQuestReward, OnboardingState, QuestPredicateContext } from './types';
import { createEmptyOnboardingState } from './types';

export interface QuestEngineDeps {
    registry: QuestRegistry;
    /** 派发 purpose（一般直接对接 SpriteManager.startPurpose 或 SpritePurposeManager.start） */
    startPurpose: (request: StartSpritePurposeRequest) => Promise<SpritePurposeStartResult>;
    /** 读取/保存持久化状态 */
    loadState: () => Promise<OnboardingState | null> | OnboardingState | null;
    saveState: (state: OnboardingState) => Promise<void> | void;
    /** 发奖：内部会调用 sprite:persona:grantReward IPC（idempotent via source='quest:<id>'）。 */
    grantReward: (reward: OnboardingQuestReward, source: string) => Promise<unknown>;
    /** 时间源（便于测试） */
    now?: () => number;
}

/**
 * Quest 引擎：
 * - 启动时载入 OnboardingState；
 * - 提供 `tick({ event, eventPayload })`，触发所有 pending quest 的 precondition / completion 重估；
 * - completion 满足时发奖、标记 done、持久化；
 * - precondition 满足且未 active 时，调用 purposeManager.start 派发 purpose；
 * - 不依赖具体哪个 quest，所有 quest 都由 registry 注入。
 */
export class QuestEngine {
    private state: OnboardingState = createEmptyOnboardingState();
    private loaded = false;
    private readonly now: () => number;

    constructor(private readonly deps: QuestEngineDeps) {
        this.now = deps.now ?? (() => Date.now());
    }

    async init(): Promise<void> {
        const loaded = await this.deps.loadState();
        this.state = loaded ?? createEmptyOnboardingState();
        this.loaded = true;
    }

    getState(): OnboardingState {
        return JSON.parse(JSON.stringify(this.state));
    }

    /**
     * 触发一轮 quest 评估。`event` 与 `eventPayload` 来自 AppEvent；不存在表示是显式 tick。
     * 评估按 registry 顺序串行，避免并发改 state。
     */
    async tick(input: { event?: string; eventPayload?: unknown } = {}): Promise<void> {
        if (!this.loaded) await this.init();
        if (this.state.skipped) return;

        const quests = input.event ? this.deps.registry.byTriggerEvent(input.event) : this.deps.registry.list();
        for (const def of quests) {
            try {
                await this.evaluateQuest(def, input);
            } catch (err) {
                console.error(`[QuestEngine] evaluate quest "${def.id}" failed`, err);
            }
        }
    }

    /** 用户主动跳过整个新手引导 */
    async skipAll(): Promise<void> {
        if (!this.loaded) await this.init();
        this.state.skipped = true;
        await this.persist();
    }

    private async evaluateQuest(def: OnboardingQuestDefinition, input: { event?: string; eventPayload?: unknown }): Promise<void> {
        const runtime = this.state.quests[def.id] ?? { status: 'pending' as const };
        if (runtime.status === 'done' && def.oneShot !== false) return;

        const ctx: QuestPredicateContext = {
            event: input.event,
            eventPayload: input.eventPayload,
            onboardingState: this.state
        };

        // 完成条件优先于前置条件检查（用户可能在 active 期间或在 routine 之外完成）
        const completed = await Promise.resolve(def.completion.evaluate(ctx));
        if (completed) {
            await this.completeQuest(def);
            return;
        }

        if (def.precondition) {
            const ok = await Promise.resolve(def.precondition.evaluate(ctx));
            if (!ok) return;
        }

        if (runtime.status === 'active' && !this.shouldRetryActiveQuest(def, input.event)) {
            return; // 已派发 purpose，等结果
        }

        await this.activateQuest(def);
    }

    private shouldRetryActiveQuest(def: OnboardingQuestDefinition, event?: string): boolean {
        if (!def.retriable) {
            return false;
        }

        if (def.retryEvents && def.retryEvents.length > 0) {
            return !!event && def.retryEvents.includes(event);
        }

        return event === 'APP_STARTED';
    }

    private async activateQuest(def: OnboardingQuestDefinition): Promise<void> {
        const request = def.toPurposeRequest();
        const result = await this.deps.startPurpose(request);
        const lastPurposeId = result.purpose?.id;
        this.state.quests[def.id] = {
            status: 'active',
            activatedAt: this.now(),
            lastPurposeId
        };
        await this.persist();
    }

    private async completeQuest(def: OnboardingQuestDefinition): Promise<void> {
        const prev = this.state.quests[def.id];
        if (prev?.status === 'done') return;

        const source = def.rewardSource ?? `quest:${def.id}`;
        if (def.reward) {
            try {
                await this.deps.grantReward(def.reward, source);
            } catch (err) {
                console.error(`[QuestEngine] grantReward for "${def.id}" failed`, err);
            }
        }

        this.state.quests[def.id] = {
            ...(prev ?? {}),
            status: 'done',
            completedAt: this.now()
        };
        await this.persist();
    }

    private async persist(): Promise<void> {
        try {
            await this.deps.saveState(this.state);
        } catch (err) {
            console.error('[QuestEngine] persist failed', err);
        }
    }
}
