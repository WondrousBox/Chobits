/**
 * Types for AI Assistant — re-exported from @packages/sprite-core/types
 * 保持向后兼容，所有类型定义已迁移至 packages/sprite-core/types.ts
 */
export type {
  CharacterGalleryAIEditContext,
  CharacterGalleryAIEditDraft,
  CharacterGalleryAIEditReferenceImage,
  CharacterGalleryAIHints,
  CharacterGalleryAIReferenceGroup,
  CharacterGalleryAIReferenceSetSummary,
  CharacterGalleryImageRef,
  CharacterGalleryIndex,
  CharacterGalleryItem,
  CharacterGalleryItemDraft,
  CharacterGalleryItemKind,
  CharacterGalleryItemOrigin,
  CharacterGalleryItemPatch,
  CharacterGalleryOriginType,
  CharacterGalleryReferenceRole,
  CharacterGallerySemantic,
  CharacterGalleryViewAngle
} from '@packages/sprite-core/character-gallery';
export {
  CHARACTER_GALLERY_ITEM_KINDS,
  CHARACTER_GALLERY_REFERENCE_ROLES,
  CHARACTER_GALLERY_VIEW_ANGLES,
  DEFAULT_CHARACTER_GALLERY_INDEX_PATH,
  getCharacterGalleryImageMimeFromPath,
  isSupportedCharacterGalleryImagePath,
  MAX_CHARACTER_GALLERY_AI_EDIT_REFERENCES,
  normalizeCharacterGalleryAIHints,
  normalizeCharacterGalleryIndex,
  normalizeCharacterGalleryItem,
  normalizeCharacterGalleryItemDraft,
  normalizeCharacterGalleryItemId,
  normalizeCharacterGalleryItemPatch,
  normalizeCharacterGalleryKind,
  normalizeCharacterGallerySemantic
} from '@packages/sprite-core/character-gallery';
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
  SpriteAnimationPlaylistMode,
  SpriteAnimationPlaylistModeMap,
  SpriteAnimationTrigger,
  SpriteAnimationTriggerMetadata,
  SpriteEventType,
  SpriteFeedbackKind,
  SpriteFeedbackRequest,
  SpriteFeedbackResult,
  SpriteTriggerOptions
} from '@packages/sprite-core/types';
export {
  compileSpriteAnimationCondition,
  DEFAULT_SPRITE_ANIMATION_PLAYLIST_MODE,
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
  normalizeSpriteAnimationPlaylistMode,
  normalizeSpriteAnimationPlaylistModeMap,
  SPRITE_ANIMATION_PLAYLIST_MODES,
  SPRITE_EVENT_TYPES,
  SpriteEventGroups
} from '@packages/sprite-core/types';
