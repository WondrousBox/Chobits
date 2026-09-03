/**
 * 状态→事件映射
 *
 * 将精灵状态机的 `SpriteState + SpriteReactionState`
 * 映射到 AnimationRegistry 使用的 eventType 字符串。
 */

import type { SpriteReactionState, SpriteState } from '../state-machine';

export function mapStateToEventType(state: SpriteState, subState: SpriteReactionState | null): string {
  switch (state) {
    case 'idle':
      return 'idle';
    case 'walking':
      return 'walk';
    case 'running':
      return 'run';
    case 'dragging':
      return 'drag';
    case 'sleeping':
      return 'sleep';
    case 'bored':
      return 'bored';
    case 'reacting':
      switch (subState) {
        case 'click':
          return 'click';
        case 'hold':
          return 'hold';
        case 'sleepy':
          return 'sleep';
        default:
          return 'idle';
      }
    default:
      return 'idle';
  }
}
