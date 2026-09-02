import {
  DEFAULT_SPRITE_ANIMATION_PLAYLIST_MODE,
  DEFAULT_SPRITE_BUBBLE_MODE,
  normalizeSpriteAnimationPlaylistMode,
  normalizeSpriteAnimationPlaylistModeMap,
  normalizeSpriteBubbleMode,
  type SpriteConfig,
  type SpriteInitialState,
  type SpritePlayCommand,
  type SpriteWalkState
} from '../../../../packages/sprite-core/types';

export const DEFAULT_SPRITE_CONFIG: SpriteConfig = {
  width: 180,
  height: 240,
  padding: 100,
  animationPlaylistMode: DEFAULT_SPRITE_ANIMATION_PLAYLIST_MODE,
  debugOverlayEnabled: false,
  bubbleMode: DEFAULT_SPRITE_BUBBLE_MODE
};

export function resolveInitialSpriteConfig(initial: Pick<SpriteInitialState, 'config' | 'currentAnimation'> | null | undefined): SpriteConfig {
  const config = initial?.config ?? DEFAULT_SPRITE_CONFIG;
  const playback = initial?.currentAnimation?.playback;
  const animationPlaylistModes = normalizeSpriteAnimationPlaylistModeMap(config.animationPlaylistModes);

  return {
    width: config.width ?? playback?.width ?? DEFAULT_SPRITE_CONFIG.width,
    height: config.height ?? playback?.height ?? DEFAULT_SPRITE_CONFIG.height,
    padding: config.padding ?? playback?.padding ?? DEFAULT_SPRITE_CONFIG.padding,
    animationPlaylistMode: normalizeSpriteAnimationPlaylistMode(config.animationPlaylistMode),
    ...(Object.keys(animationPlaylistModes).length > 0 ? { animationPlaylistModes } : {}),
    debugOverlayEnabled: config.debugOverlayEnabled ?? DEFAULT_SPRITE_CONFIG.debugOverlayEnabled,
    bubbleMode: normalizeSpriteBubbleMode(config.bubbleMode ?? DEFAULT_SPRITE_CONFIG.bubbleMode)
  };
}

export function mergePlayCommandIntoSpriteConfig(prev: SpriteConfig, playCommand: SpritePlayCommand): SpriteConfig {
  const playback = playCommand.playback;
  if (!playback) {
    return prev;
  }

  return {
    ...prev,
    width: playback.width ?? DEFAULT_SPRITE_CONFIG.width,
    height: playback.height ?? DEFAULT_SPRITE_CONFIG.height,
    padding: playback.padding ?? DEFAULT_SPRITE_CONFIG.padding,
    animationPlaylistMode: prev.animationPlaylistMode,
    ...(prev.animationPlaylistModes ? { animationPlaylistModes: prev.animationPlaylistModes } : {}),
    debugOverlayEnabled: prev.debugOverlayEnabled,
    bubbleMode: prev.bubbleMode
  };
}

export function resolveWalkState(data: SpriteWalkState): { isWalking: boolean; walkDirection: 'left' | 'right' | null } {
  return {
    isWalking: data.active,
    walkDirection: data.active ? (data.direction ?? null) : null
  };
}
