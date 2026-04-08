/**
 * Sprite Interaction Contract
 *
 * 统一收口 renderer → preload → IPC → runtime 的交互输入与事件契约。
 * `SpriteInteractionIntent` 表示渲染层上报的用户意图；
 * `SpriteInteractionEvent` 表示 EventBus 内部流转的事件名。
 */

/** 渲染层可上报的交互意图 */
export const SPRITE_INTERACTION_INTENTS = ['click', 'double-click', 'hover-enter', 'hover-leave', 'file-drag-over', 'file-drag-leave', 'file-drop', 'context-menu'] as const;

export type SpriteInteractionIntent = (typeof SPRITE_INTERACTION_INTENTS)[number];

/** EventBus 中的完整交互事件集（含运行时内部事件） */
export const SPRITE_INTERACTION_EVENTS = [
  'interact:click',
  'interact:double-click',
  'interact:drag:start',
  'interact:drag:end',
  'interact:hold:start',
  'interact:hold:end',
  'interact:hover:enter',
  'interact:hover:leave',
  'interact:file-drag-over',
  'interact:file-drag-leave',
  'interact:file-drop',
  'interact:context-menu'
] as const;

export type SpriteInteractionEvent = (typeof SPRITE_INTERACTION_EVENTS)[number];

export type SpriteInteractionPayload = Record<string, unknown>;

/** 交互意图 → EventBus 事件名 */
export const SPRITE_INTERACTION_EVENT_BY_INTENT: Record<SpriteInteractionIntent, SpriteInteractionEvent> = {
  click: 'interact:click',
  'double-click': 'interact:double-click',
  'hover-enter': 'interact:hover:enter',
  'hover-leave': 'interact:hover:leave',
  'file-drag-over': 'interact:file-drag-over',
  'file-drag-leave': 'interact:file-drag-leave',
  'file-drop': 'interact:file-drop',
  'context-menu': 'interact:context-menu'
};

const intentSet = new Set<string>(SPRITE_INTERACTION_INTENTS);
const eventSet = new Set<string>(SPRITE_INTERACTION_EVENTS);

export function isSpriteInteractionIntent(value: string): value is SpriteInteractionIntent {
  return intentSet.has(value);
}

export function isSpriteInteractionEvent(value: string): value is SpriteInteractionEvent {
  return eventSet.has(value);
}
