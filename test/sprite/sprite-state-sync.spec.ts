import { describe, expect, it } from 'vitest';

import type { SpriteConfig, SpriteInitialState, SpritePlayCommand } from '../../packages/sprite-core/types';
import { DEFAULT_SPRITE_CONFIG, mergePlayCommandIntoSpriteConfig, resolveInitialSpriteConfig, resolveWalkState } from '../../src/features/sprite-assistant/context/sprite-state-sync';

describe('sprite state sync helpers', () => {
  it('resolves initial config from snapshot config first, then playback fallback', () => {
    const initial = {
      state: 'idle',
      subState: null,
      characterState: null,
      animations: [],
      currentAnimation: {
        animationId: 'idle-default',
        source: { localPath: './idle.webm', type: 'video/webm' },
        playback: {
          width: 320,
          height: 260,
          padding: 24
        }
      },
      config: {
        width: 200,
        height: 220,
        padding: 80
      }
    } satisfies Partial<SpriteInitialState>;

    expect(resolveInitialSpriteConfig(initial as SpriteInitialState)).toEqual({
      width: 200,
      height: 220,
      padding: 80,
      animationPlaylistMode: 'list-loop',
      showDebugOverlay: false,
      bubbleMode: 'fixed-top'
    });
  });

  it('falls back to playback metrics when config is missing dimensions', () => {
    const initial = {
      config: {
        showDebugOverlay: true
      },
      currentAnimation: {
        animationId: 'celebrate',
        source: { localPath: './celebrate.webm', type: 'video/webm' },
        playback: {
          width: 300,
          height: 280,
          padding: 32
        }
      }
    } as Pick<SpriteInitialState, 'config' | 'currentAnimation'>;

    expect(resolveInitialSpriteConfig(initial)).toEqual({
      width: 300,
      height: 280,
      padding: 32,
      animationPlaylistMode: 'list-loop',
      showDebugOverlay: true,
      bubbleMode: 'fixed-top'
    });
  });

  it('preserves the fixed-top bubble mode from the initial config', () => {
    const initial = {
      config: {
        width: 180,
        height: 240,
        padding: 100,
        bubbleMode: 'fixed-top'
      }
    } as Pick<SpriteInitialState, 'config' | 'currentAnimation'>;

    expect(resolveInitialSpriteConfig(initial).bubbleMode).toBe('fixed-top');
  });

  it('merges playback metrics into an existing sprite config without clobbering flags', () => {
    const previous: SpriteConfig = {
      width: 180,
      height: 240,
      padding: 100,
      animationPlaylistMode: 'list-loop',
      showDebugOverlay: true
    };
    const playCommand: SpritePlayCommand = {
      animationId: 'thinking',
      source: { localPath: './thinking.webm', type: 'video/webm' },
      playback: {
        width: 260,
        padding: 48
      }
    };

    expect(mergePlayCommandIntoSpriteConfig(previous, playCommand)).toEqual({
      width: 260,
      height: 240,
      padding: 48,
      animationPlaylistMode: 'list-loop',
      showDebugOverlay: true
    });
  });

  it('does not reuse previous animation metrics when a play command omits dimensions', () => {
    const previous: SpriteConfig = {
      width: 640,
      height: 420,
      padding: 20,
      animationPlaylistMode: 'list-loop',
      showDebugOverlay: true
    };
    const playCommand: SpritePlayCommand = {
      animationId: 'idle-default',
      source: { localPath: './idle.webm', type: 'video/webm' },
      playback: {
        durationMs: 800,
        loop: true
      }
    };

    expect(mergePlayCommandIntoSpriteConfig(previous, playCommand)).toEqual({
      width: DEFAULT_SPRITE_CONFIG.width,
      height: DEFAULT_SPRITE_CONFIG.height,
      padding: DEFAULT_SPRITE_CONFIG.padding,
      animationPlaylistMode: 'list-loop',
      showDebugOverlay: true
    });
  });

  it('keeps config unchanged when play command has no playback payload', () => {
    const previous = { ...DEFAULT_SPRITE_CONFIG, showDebugOverlay: true };
    const playCommand: SpritePlayCommand = {
      animationId: 'message-only',
      source: { localPath: './message.webm', type: 'video/webm' }
    };

    expect(mergePlayCommandIntoSpriteConfig(previous, playCommand)).toEqual(previous);
  });

  it('normalizes walk snapshots into renderer-friendly state', () => {
    expect(resolveWalkState({ active: true, direction: 'right' })).toEqual({
      isWalking: true,
      walkDirection: 'right'
    });
    expect(resolveWalkState({ active: false, direction: 'left' })).toEqual({
      isWalking: false,
      walkDirection: null
    });
  });
});
