import type { PersonaSnapshot } from '@packages/sprite-core/types';
import { useContext } from 'react';

import { SpriteStateContext, type SpriteStateContextValue } from './sprite-state-context';

/** 获取完整精灵状态上下文 */
export function useSpriteState(): SpriteStateContextValue {
  const ctx = useContext(SpriteStateContext);
  if (!ctx) throw new Error('useSpriteState must be used within SpriteStateProvider');
  return ctx;
}

/** 仅获取人格状态快照 */
export function usePersonaState(): PersonaSnapshot | null {
  const { personaState } = useSpriteState();
  return personaState;
}

/** 仅获取精灵主状态 */
export function useSpriteStateName(): string {
  const { spriteState } = useSpriteState();
  return spriteState;
}
