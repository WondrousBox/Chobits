import { ASSISTANT_RENDERER_MODE } from '../constants';
import ThreeSprite from './ThreeSprite';
import VideoSprite from './VideoSprite';

export const Renderer = ASSISTANT_RENDERER_MODE === 'three' ? ThreeSprite : VideoSprite;
