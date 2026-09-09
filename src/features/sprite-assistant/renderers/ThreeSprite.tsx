import type { SpritePresentationConfig } from '@packages/sprite-core/types';
import { useEffect } from 'react';

import type { SpriteRendererProps } from '.';
import VrmSprite from './vrm/VrmSprite';

type ThreePresentation = Extract<SpritePresentationConfig, { renderer: 'three' }>;

export interface ThreeSpriteProps extends SpriteRendererProps {
  presentation?: ThreePresentation;
}

/** Stable three-mode entry point. Its implementation is now backed by three-vrm. */
export default function ThreeSprite({ presentation, onFirstFrame, ...props }: ThreeSpriteProps): JSX.Element {
  useEffect(() => {
    if (!presentation?.model) onFirstFrame?.();
  }, [onFirstFrame, presentation]);

  if (!presentation?.model) {
    return <div data-sprite-renderer="three" data-renderer-status="missing-model" style={{ width: props.width ?? 180, height: props.height ?? 240, background: 'transparent' }} />;
  }
  return <VrmSprite {...props} presentation={{ ...presentation, model: presentation.model }} onFirstFrame={onFirstFrame} />;
}
