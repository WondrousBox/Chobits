import { describe, expect, it } from 'vitest';

import { PersonaStateManager } from '../packages/sprite-core/persona-state';

function makeManager(): PersonaStateManager {
    return new PersonaStateManager();
}

describe('PersonaStateManager.claimedRewards', () => {
    it('returns false for unclaimed sources', () => {
        const mgr = makeManager();
        expect(mgr.hasClaimedReward('quest:any')).toBe(false);
    });

    it('marks reward claimed and is idempotent', () => {
        const mgr = makeManager();
        expect(mgr.markRewardClaimed('quest:workspace.create')).toBe(true);
        expect(mgr.hasClaimedReward('quest:workspace.create')).toBe(true);
        expect(mgr.markRewardClaimed('quest:workspace.create')).toBe(false);
    });

    it('persists across loadState', () => {
        const mgr1 = makeManager();
        mgr1.markRewardClaimed('quest:workspace.create');
        const snapshot = mgr1.getState();

        const mgr2 = makeManager();
        mgr2.loadState(snapshot);
        expect(mgr2.hasClaimedReward('quest:workspace.create')).toBe(true);
    });

    it('ignores empty source', () => {
        const mgr = makeManager();
        expect(mgr.markRewardClaimed('')).toBe(false);
        expect(mgr.hasClaimedReward('')).toBe(false);
    });
});
