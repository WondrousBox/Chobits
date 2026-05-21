import type { OnboardingQuestDefinition, OnboardingQuestReward, OnboardingQuestRuntimeState, OnboardingState, QuestCategory } from './types';

export type QuestListItemStatus = OnboardingQuestRuntimeState['status'];

export interface QuestListAction {
    kind: 'start-quest';
    label: string;
    questId: string;
    windowKey?: string;
    purposeKind?: string;
}

export interface QuestListReward extends OnboardingQuestReward {}

export interface QuestListItem {
    id: string;
    category: QuestCategory;
    title: string;
    description?: string;
    status: QuestListItemStatus;
    reward?: QuestListReward;
    rewardSource: string;
    activatedAt?: number;
    completedAt?: number;
    progressPercent: number;
    action?: QuestListAction;
}

export interface QuestListSnapshot {
    version: 1;
    onboardingSkipped?: boolean;
    items: QuestListItem[];
    summary: {
        total: number;
        pending: number;
        active: number;
        done: number;
        skipped: number;
    };
}

export function createQuestListSnapshot(input: {
    definitions: OnboardingQuestDefinition[];
    state?: OnboardingState | null;
}): QuestListSnapshot {
    const items = input.definitions.map((definition) => createQuestListItem(definition, input.state ?? null));
    const summary = {
        total: items.length,
        pending: items.filter((item) => item.status === 'pending').length,
        active: items.filter((item) => item.status === 'active').length,
        done: items.filter((item) => item.status === 'done').length,
        skipped: items.filter((item) => item.status === 'skipped').length
    };

    return {
        version: 1,
        onboardingSkipped: input.state?.skipped,
        items,
        summary
    };
}

function createQuestListItem(definition: OnboardingQuestDefinition, state: OnboardingState | null): QuestListItem {
    const runtime = state?.quests?.[definition.id];
    const status = resolveStatus(definition, runtime, state);
    const purposeRequest = status === 'done' || status === 'skipped' ? null : definition.toPurposeRequest();

    return {
        id: definition.id,
        category: definition.category,
        title: definition.title,
        description: definition.description,
        status,
        reward: definition.reward ? { ...definition.reward } : undefined,
        rewardSource: definition.rewardSource ?? `quest:${definition.id}`,
        activatedAt: runtime?.activatedAt,
        completedAt: runtime?.completedAt,
        progressPercent: resolveProgressPercent(status),
        action: createQuestAction(definition, status, purposeRequest)
    };
}

function resolveStatus(definition: OnboardingQuestDefinition, runtime: OnboardingQuestRuntimeState | undefined, state: OnboardingState | null): QuestListItemStatus {
    if (state?.skipped && definition.category === 'onboarding' && runtime?.status !== 'done') return 'skipped';
    if (runtime?.status) return runtime.status;
    return 'pending';
}

function resolveProgressPercent(status: QuestListItemStatus): number {
    if (status === 'done') return 100;
    if (status === 'active') return 50;
    return 0;
}

function createQuestAction(
    definition: OnboardingQuestDefinition,
    status: QuestListItemStatus,
    purposeRequest: ReturnType<OnboardingQuestDefinition['toPurposeRequest']> | null
): QuestListAction | undefined {
    if (status === 'done' || status === 'skipped' || !purposeRequest) return undefined;
    return {
        kind: 'start-quest',
        label: status === 'active' ? definition.display?.activeActionLabel ?? '继续引导' : definition.display?.actionLabel ?? '开始任务',
        questId: definition.id,
        windowKey: definition.display?.actionWindowKey,
        purposeKind: definition.display?.actionPurposeKind ?? purposeRequest.kind
    };
}
