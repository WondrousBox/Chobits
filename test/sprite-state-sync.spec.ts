import { describe, expect, it } from 'vitest';

import type { SpriteConfig, SpriteInitialState, SpritePlayCommand } from '../packages/sprite-core/types';
import { DEFAULT_SPRITE_CONFIG, mergePlayCommandIntoSpriteConfig, resolveInitialSpriteConfig, resolveWalkState } from '../src/features/sprite-assistant/context/sprite-state-sync';

describe('sprite state sync helpers', () => {
  it('resolves initial config from snapshot config first, then playback fallback', () => {
    const initial = {
      state: 'idle',
      subState: null,
      personaState: null,
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
        padding: 80,
        autoWalkEnabled: false
      }
    } satisfies Partial<SpriteInitialState>;

    expect(resolveInitialSpriteConfig(initial as SpriteInitialState)).toEqual({
      width: 200,
      height: 220,
      padding: 80,
      animationPlaylistMode: 'list-loop',
      autoWalkEnabled: false,
      showDebugOverlay: false
    });
  });

  it('falls back to playback metrics when config is missing dimensions', () => {
    const initial = {
      config: {
        autoWalkEnabled: true,
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
      autoWalkEnabled: true,
      showDebugOverlay: true
    });
  });

  it('merges playback metrics into an existing sprite config without clobbering flags', () => {
    const previous: SpriteConfig = {
      width: 180,
      height: 240,
      padding: 100,
      animationPlaylistMode: 'list-loop',
      autoWalkEnabled: false,
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
      autoWalkEnabled: false,
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
