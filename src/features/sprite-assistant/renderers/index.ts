import { ASSISTANT_RENDERER_MODE } from '../constants';
import Live2DSprite from './Live2DSprite';
import ThreeSprite from './ThreeSprite';
import VideoSprite from './VideoSprite';

export const Renderer =
  ASSISTANT_RENDERER_MODE === 'three' ? ThreeSprite : ASSISTANT_RENDERER_MODE === 'live2d' ? Live2DSprite : VideoSprite;
