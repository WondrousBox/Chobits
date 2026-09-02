import type { CharacterSnapshot } from '@packages/sprite-core/types';
import { useContext } from 'react';

import { SpriteStateContext, type SpriteStateContextValue } from './sprite-state-context';

/** 获取完整精灵状态上下文 */
export function useSpriteState(): SpriteStateContextValue {
  const ctx = useContext(SpriteStateContext);
  if (!ctx) throw new Error('useSpriteState must be used within SpriteStateProvider');
  return ctx;
}

/** 仅获取角色状态快照 */
export function useCharacterState(): CharacterSnapshot | null {
  const { characterState } = useSpriteState();
  return characterState;
}

/** 仅获取精灵主状态 */
export function useSpriteStateName(): string {
  const { spriteState } = useSpriteState();
  return spriteState;
}
