import type { ComponentType } from 'react';

import { ASSISTANT_RENDERER_MODE } from '../constants';
import ThreeSprite from './ThreeSprite';
import VideoSprite from './VideoSprite';

export interface SpriteRendererProps {
  width?: number;
  height?: number;
  walkDirection?: 'left' | 'right' | null;
  onFirstFrame?: () => void;
}

export const Renderer: ComponentType<SpriteRendererProps> = ASSISTANT_RENDERER_MODE === 'three' ? ThreeSprite : VideoSprite;
