/**
 * Sprite Handler barrel exports
 *
 * 主进程只需:
 *   import { initSpriteHandlers, initSpriteManagerIPC } from '@packages/sprite-core/handler'
 */

export type { SpriteAssetsDeps } from './sprite-assets';
export { initSpriteHandlers, listSprites } from './sprite-assets';
export { initSpriteManagerIPC } from './sprite-manager-ipc';
