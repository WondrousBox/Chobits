/**
 * 状态→事件映射
 *
 * 将精灵状态机的 SpriteState + SpriteSubState 映射到
 * AnimationRegistry 使用的 eventType 字符串。
 */

import type { SpriteState, SpriteSubState } from '../state-machine';

export function mapStateToEventType(state: SpriteState, subState: SpriteSubState | null): string {
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
        case 'drop':
          return 'drop';
        case 'file-drag-over':
          return 'fileDragOver';
        case 'file-drop':
          return 'fileDrop';
        case 'sleepy':
          return 'sleep';
        case 'celebrate':
          return 'celebrate';
        case 'emotion':
          return 'happy';
        default:
          return 'idle';
      }
    default:
      return 'idle';
  }
}
