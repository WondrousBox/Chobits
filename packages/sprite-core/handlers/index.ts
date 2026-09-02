/**
 * Sprite Handler barrel exports
 *
 * 主进程只需:
 *   import { initSpriteHandlers, initSpriteManagerHandlers } from '@packages/sprite-core/handlers'
 */

export type { SpriteAssetsDeps } from './sprite-assets';
export { getDefaultSpritesDir, initSpriteHandlers, listSprites } from './sprite-assets';
export type { SpriteEventPayload } from './sprite-event-listener';
export { initSpriteEventListener } from './sprite-event-listener';
export { initSpriteManagerHandlers } from './sprite-manager-ipc';
