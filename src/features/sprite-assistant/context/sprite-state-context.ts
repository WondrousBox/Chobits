import type { CharacterSnapshot, SpriteConfig, SpritePlayCommand } from '@packages/sprite-core/types';
import { createContext } from 'react';

export interface SpriteStateContextValue {
  /** 当前精灵主状态 */
  spriteState: string;
  /** 当前子状态 */
  subState: string | null;
  /** 只读角色状态快照 */
  characterState: CharacterSnapshot | null;
  /** 当前播放动画信息 */
  currentAnimation: SpritePlayCommand | null;
  /** 行走方向 */
  walkDirection: 'left' | 'right' | null;
  /** 是否正在行走 */
  isWalking: boolean;
  /** 是否正在拖拽 */
  isDragging: boolean;
  /** 精灵尺寸配置 */
  spriteConfig: SpriteConfig;
  /** 是否已就绪 */
  ready: boolean;
}

export const SpriteStateContext = createContext<SpriteStateContextValue | null>(null);
