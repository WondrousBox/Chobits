/**
 * Sprite Assistant — renderer feature module
 *
 * 渲染进程只需:
 *   import { AIAssistant, SpriteStateProvider } from '@/features/sprite-assistant'
 */

// ── Components ──────────────────────────────────────────────
export { AIAssistant } from './AIAssistant';
export { SpriteStateProvider, useSpriteState } from './context/SpriteStateContext';

// ── Types (re-exported from @packages/sprite-core) ──────────
export type { MessageCatalog, MessageCategory, MessageProducer, MessagesProvider, SpriteAnimation, SpriteEventType } from './types';
export { SPRITE_EVENT_TYPES, SpriteEventGroups } from './types';

// ── Pages ───────────────────────────────────────────────────
export { default as LevelUpPage } from './pages/LevelUp';
export { StatusPage } from './pages/StatusPage';

// ── Utils ───────────────────────────────────────────────────
export { resolveSpriteSrc } from './utils/resource';
