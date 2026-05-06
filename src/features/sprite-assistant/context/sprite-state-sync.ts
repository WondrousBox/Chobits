import {
  DEFAULT_SPRITE_ANIMATION_PLAYLIST_MODE,
  normalizeSpriteAnimationPlaylistMode,
  normalizeSpriteAnimationPlaylistModeMap,
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
  autoWalkEnabled: true,
  showDebugOverlay: false
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
    autoWalkEnabled: config.autoWalkEnabled ?? DEFAULT_SPRITE_CONFIG.autoWalkEnabled,
    showDebugOverlay: config.showDebugOverlay ?? DEFAULT_SPRITE_CONFIG.showDebugOverlay
  };
}

export function mergePlayCommandIntoSpriteConfig(prev: SpriteConfig, playCommand: SpritePlayCommand): SpriteConfig {
  const playback = playCommand.playback;
  if (!playback) {
    return prev;
  }

  return {
    ...prev,
    width: playback.width ?? prev.width,
    height: playback.height ?? prev.height,
    padding: playback.padding ?? prev.padding,
    animationPlaylistMode: prev.animationPlaylistMode,
    ...(prev.animationPlaylistModes ? { animationPlaylistModes: prev.animationPlaylistModes } : {}),
    showDebugOverlay: prev.showDebugOverlay,
    autoWalkEnabled: prev.autoWalkEnabled
  };
}

export function resolveWalkState(data: SpriteWalkState): { isWalking: boolean; walkDirection: 'left' | 'right' | null } {
  return {
    isWalking: data.active,
    walkDirection: data.active ? (data.direction ?? null) : null
  };
}
