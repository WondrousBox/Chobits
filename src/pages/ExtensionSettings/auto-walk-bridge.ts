import type { SpriteConfig } from '@packages/sprite-core/types';

type AutoWalkListener = (enabled: boolean) => void;

export async function getSpriteAutoWalkEnabled(): Promise<boolean> {
  return window.YUA.sprite.getAutoWalk();
}

export async function setSpriteAutoWalkEnabled(enabled: boolean): Promise<boolean> {
  return window.YUA.sprite.setAutoWalk(enabled);
}

export function subscribeSpriteAutoWalkEnabled(listener: AutoWalkListener): () => void {
  return window.YUA.sprite.onConfig((config: SpriteConfig) => {
    if (typeof config.autoWalkEnabled === 'boolean') {
      listener(config.autoWalkEnabled);
    }
  });
}
