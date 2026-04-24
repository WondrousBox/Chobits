/**
 * Sprite Assistant — renderer feature module
 *
 * 渲染进程只需:
 *   import { AIAssistant, SpriteStateProvider } from '@/features/sprite-assistant'
 */

// ── Components ──────────────────────────────────────────────
export { AIAssistant } from './AIAssistant';
export { useSpriteState } from './context/hooks';
export { SpriteStateProvider } from './context/SpriteStateContext';

// ── Types (re-exported from @packages/sprite-core) ──────────
export type {
  MessageCatalog,
  MessageCategory,
  MessageProducer,
  MessagesProvider,
  SpriteAnimation,
  SpriteAnimationCondition,
  SpriteAnimationConditionGroup,
  SpriteAnimationConditionOperator,
  SpriteAnimationConditionScalar,
  SpriteAnimationConditionValue,
  SpriteAnimationMeta,
  SpriteAnimationTrigger,
  SpriteAnimationTriggerMetadata,
  SpriteEventType,
  SpriteTriggerOptions
} from './types';
export {
  compileSpriteAnimationCondition,
  getPrimarySpriteAnimationTrigger,
  getSpriteAnimationTriggerAliases,
  getSpriteAnimationTriggers,
  hasSpriteAnimationTrigger,
  isBuiltinSpriteAnimationTrigger,
  isCustomSpriteAnimationTrigger,
  matchesSpriteAnimationCondition,
  normalizeSpriteAnimationCondition,
  normalizeSpriteAnimationMeta,
  normalizeSpriteAnimationMetaPatch,
  SPRITE_EVENT_TYPES,
  SpriteEventGroups
} from './types';

// ── Pages ───────────────────────────────────────────────────
export { default as LevelUpPage } from './pages/LevelUp';
export { StatusPage } from './pages/StatusPage';

// ── Utils ───────────────────────────────────────────────────
export { resolveSpriteSrc } from './utils/resource';
