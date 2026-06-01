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
  CharacterGalleryViewAngle,
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
  SpriteTriggerOptions
} from './types';
export {
  CHARACTER_GALLERY_ITEM_KINDS,
  CHARACTER_GALLERY_REFERENCE_ROLES,
  CHARACTER_GALLERY_VIEW_ANGLES,
  compileSpriteAnimationCondition,
  DEFAULT_CHARACTER_GALLERY_INDEX_PATH,
  DEFAULT_SPRITE_ANIMATION_PLAYLIST_MODE,
  getCharacterGalleryImageMimeFromPath,
  getPrimarySpriteAnimationTrigger,
  getSpriteAnimationTriggerAliases,
  getSpriteAnimationTriggers,
  hasSpriteAnimationTrigger,
  isBuiltinSpriteAnimationTrigger,
  isCustomSpriteAnimationTrigger,
  isSupportedCharacterGalleryImagePath,
  matchesSpriteAnimationCondition,
  MAX_CHARACTER_GALLERY_AI_EDIT_REFERENCES,
  normalizeCharacterGalleryAIHints,
  normalizeCharacterGalleryIndex,
  normalizeCharacterGalleryItem,
  normalizeCharacterGalleryItemDraft,
  normalizeCharacterGalleryItemId,
  normalizeCharacterGalleryItemPatch,
  normalizeCharacterGalleryKind,
  normalizeCharacterGallerySemantic,
  normalizeSpriteAnimationCondition,
  normalizeSpriteAnimationMeta,
  normalizeSpriteAnimationMetaPatch,
  normalizeSpriteAnimationPlaylistMode,
  normalizeSpriteAnimationPlaylistModeMap,
  SPRITE_ANIMATION_PLAYLIST_MODES,
  SPRITE_EVENT_TYPES,
  SpriteEventGroups
} from './types';

// ── Pages ───────────────────────────────────────────────────
export { default as AchievementUnlockPage } from './pages/AchievementUnlock';
export { default as LevelUpPage } from './pages/LevelUp';
export { StatusPage } from './pages/StatusPage';

// ── Utils ───────────────────────────────────────────────────
export { resolveSpriteSrc } from './utils/resource';
