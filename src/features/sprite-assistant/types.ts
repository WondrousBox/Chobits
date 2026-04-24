/**
 * Types for AI Assistant — re-exported from @packages/sprite-core/types
 * 保持向后兼容，所有类型定义已迁移至 packages/sprite-core/types.ts
 */
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
} from '@packages/sprite-core/types';
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
} from '@packages/sprite-core/types';
