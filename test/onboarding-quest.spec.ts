import { describe, expect, it, vi } from 'vitest';

import { createWorkspaceCreateQuest, QuestEngine, QuestRegistry } from '../packages/sprite-core/quest';
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
            purpose: { id: 'p-1', kind: 'onboarding.workspace.create', title: '', reason: '', source: 'system-event' as const, status: 'queued' as const, priority: 70, interruptPolicy: 'interruptible' as const },
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
