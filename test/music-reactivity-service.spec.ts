import type { SpriteManager } from '@packages/sprite-core/manager';
import { describe, expect, it } from 'vitest';

import { MusicReactivityService } from '../packages/audio-reactivity/music-reactivity-service';
import type { MusicReactivityPreferences } from '../packages/audio-reactivity/types';

interface TriggerCall {
  trigger: string;
  options?: unknown;
}

function createService(preferences: Partial<MusicReactivityPreferences> = {}): {
  service: MusicReactivityService;
  calls: TriggerCall[];
  manager: SpriteManager;
} {
  const calls: TriggerCall[] = [];
  let currentAnimation: ReturnType<SpriteManager['getCurrentAnimation']> = null;
  const spriteState = 'idle';
  const spriteSubState: ReturnType<SpriteManager['getSubState']> = null;
  const manager = {
    trigger: (trigger: string, options?: unknown): void => {
      calls.push({ trigger, options });
      currentAnimation = {
        animationId: `${trigger}-animation`,
        trigger,
        sessionMode: 'trigger',
        playId: (options as { playId?: string } | undefined)?.playId
      };
    },
    getCurrentAnimation: () => currentAnimation,
    getState: () => spriteState,
    getSubState: () => spriteSubState,
    isIdlePresentationActive: () => {
      return spriteState === 'idle' && spriteSubState === null && currentAnimation?.sessionMode === 'state-bound' && currentAnimation.trigger === 'idle';
    }
  } as unknown as SpriteManager;

  return {
    service: new MusicReactivityService({
      getSpriteManager: () => manager,
      preferences: {
        enabled: true,
        ...preferences
      }
    }),
    calls,
    manager
  };
}

describe('MusicReactivityService', () => {
  it('triggers the configured dance animation after sustained app media music', () => {
    const { service, calls } = createService({ source: 'auto', sensitivity: 'medium' });

    service.ingestAnalysis({
      source: 'app-media',
      timestampMs: 1000,
      energyDb: -18,
      musicProbability: 0.9
    });
    const snapshot = service.ingestAnalysis({
      source: 'app-media',
      timestampMs: 3600,
      energyDb: -18,
      musicProbability: 0.9
    });

    expect(snapshot.state).toBe('dancing');
    expect(calls).toHaveLength(1);
    expect(calls[0].trigger).toBe('music:dance');
  });

  it('keeps candidate timing through brief dips above the exit threshold', () => {
    const { service, calls } = createService({ source: 'auto', sensitivity: 'medium' });

    service.ingestAnalysis({
      source: 'app-media',
      timestampMs: 1000,
      energyDb: -14,
      musicProbability: 0.82
    });
    service.ingestAnalysis({
      source: 'app-media',
      timestampMs: 1800,
      energyDb: -14,
      musicProbability: 0.58
    });
    const snapshot = service.ingestAnalysis({
      source: 'app-media',
      timestampMs: 3600,
      energyDb: -14,
      musicProbability: 0.6
    });

    expect(snapshot.state).toBe('dancing');
    expect(calls).toHaveLength(1);
  });

  it('filters app media snapshots when the user selected system audio', () => {
    const { service, calls } = createService({ source: 'system-loopback', sensitivity: 'medium' });

    service.ingestAnalysis({
      source: 'app-media',
      timestampMs: 1000,
      energyDb: -18,
      musicProbability: 0.95
    });
    const snapshot = service.ingestAnalysis({
      source: 'app-media',
      timestampMs: 6000,
      energyDb: -18,
      musicProbability: 0.95
    });

    expect(snapshot.state).toBe('idle');
    expect(snapshot.reason).toBe('source-filtered:system-loopback');
    expect(calls).toHaveLength(0);
  });

  it('does not accept microphone test input in automatic source mode', () => {
    const { service, calls } = createService({ source: 'auto', sensitivity: 'medium' });

    service.ingestAnalysis({
      source: 'microphone-test',
      timestampMs: 1000,
      energyDb: -18,
      musicProbability: 0.95
    });
    const snapshot = service.ingestAnalysis({
      source: 'microphone-test',
      timestampMs: 6000,
      energyDb: -18,
      musicProbability: 0.95
    });

    expect(snapshot.state).toBe('idle');
    expect(snapshot.reason).toBe('source-filtered:auto');
    expect(calls).toHaveLength(0);
  });

  it('resets to idle on media inactivity without dispatching another dance', () => {
    const { service, calls } = createService({ source: 'auto', sensitivity: 'medium' });

    service.ingestAnalysis({
      source: 'app-media',
      timestampMs: 1000,
      energyDb: -18,
      musicProbability: 0.9
    });
    service.ingestAnalysis({
      source: 'app-media',
      timestampMs: 3600,
      energyDb: -18,
      musicProbability: 0.9
    });

    const snapshot = service.reset('media-inactive', {
      source: 'app-media',
      timestampMs: 4200
    });

    expect(snapshot.state).toBe('idle');
    expect(snapshot.reason).toBe('media-inactive');
    expect(calls).toHaveLength(1);
  });

  it('re-dispatches dance after the prior music animation returns to idle while music continues', () => {
    const { service, calls, manager } = createService({ source: 'auto', sensitivity: 'medium' });

    service.ingestAnalysis({
      source: 'app-media',
      timestampMs: 1000,
      energyDb: -18,
      musicProbability: 0.9
    });
    service.ingestAnalysis({
      source: 'app-media',
      timestampMs: 3600,
      energyDb: -18,
      musicProbability: 0.9
    });

    (manager.getCurrentAnimation() as any).sessionMode = 'state-bound';
    (manager.getCurrentAnimation() as any).trigger = 'idle';
    (manager.getCurrentAnimation() as any).playId = undefined;
    (manager.getCurrentAnimation() as any).animationId = 'idle-default';

    const snapshot = service.ingestAnalysis({
      source: 'app-media',
      timestampMs: 4801,
      energyDb: -18,
      musicProbability: 0.9
    });

    expect(snapshot.state).toBe('dancing');
    expect(calls).toHaveLength(2);
    expect(calls[1].trigger).toBe('music:dance');
  });
});
