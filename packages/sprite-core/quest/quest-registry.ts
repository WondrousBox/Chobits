import type { OnboardingQuestDefinition } from './types';

/**
 * Quest 注册表 — 单进程内的内存映射 (key=questId)，启动时由调用方注入定义。
 */
export class QuestRegistry {
    private quests = new Map<string, OnboardingQuestDefinition>();

    constructor(defs: OnboardingQuestDefinition[] = []) {
        for (const def of defs) this.register(def);
    }

    register(def: OnboardingQuestDefinition): void {
        if (this.quests.has(def.id)) {
            console.warn(`[QuestRegistry] Quest "${def.id}" already registered, overwriting.`);
        }
        this.quests.set(def.id, def);
    }

    get(id: string): OnboardingQuestDefinition | undefined {
        return this.quests.get(id);
    }

    list(): OnboardingQuestDefinition[] {
        return Array.from(this.quests.values());
    }

    /** 列出监听指定 AppEvent 的 quest 集合（用于事件驱动 tick） */
    byTriggerEvent(eventName: string): OnboardingQuestDefinition[] {
        return this.list().filter((q) => q.triggerEvents?.includes(eventName));
    }
}
