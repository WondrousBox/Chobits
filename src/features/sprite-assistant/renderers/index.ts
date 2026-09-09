import { createElement } from 'react';

import { useSpriteState } from '../context/hooks';
import { Live2DRendererSlot } from './Live2DRendererSlot';
import ThreeSprite from './ThreeSprite';
import VideoSprite from './VideoSprite';

export interface SpriteRendererProps {
  width?: number;
  height?: number;
  walkDirection?: 'left' | 'right' | null;
  isDragging?: boolean;
  onFirstFrame?: () => void;
}

export function Renderer(props: SpriteRendererProps): JSX.Element {
  const { presentation } = useSpriteState();
  const key = presentation.renderer === 'video' ? 'video' : `${presentation.renderer}:${presentation.model?.localPath ?? ''}`;

  if (presentation.renderer === 'live2d') {
    return createElement(Live2DRendererSlot, { ...props, presentation, key });
  }
  if (presentation.renderer === 'three') {
    return createElement(ThreeSprite, { ...props, presentation, key });
  }
  return createElement(VideoSprite, { ...props, key });
}

export type { Live2DRendererComponent } from './live2d-renderer-registry';
export { registerLive2DRenderer } from './live2d-renderer-registry';
