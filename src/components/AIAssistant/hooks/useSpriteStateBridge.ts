/**
 * useSpriteStateBridge
 *
 * 桥接 sprite-core 的 SpriteStateMachine 与 useSpriteConductor（动画播放控制）。
 *
 * 职责：
 * 1. 订阅 StateMachine 状态变化 → 驱动 Conductor 切换到对应动画
 * 2. 订阅主进程 IPC sprite-command → 映射到 StateMachine 操作
 *
 * 替代原有的 useSpriteEventController（基于旧 spriteEvents 的事件监听）。
 */
import type { SpriteState, SpriteSubState } from '@packages/sprite-core';
import { useEffect } from 'react';

import { useSpritePersona } from '../context/SpritePersonaContext';
import useSpriteConductor, { type AssistantVisualState } from './useSpriteConductor';

/** 将 StateMachine 的 SpriteState + SubState 映射到 Conductor 的 AssistantVisualState */
function mapToVisualState(state: SpriteState, subState: SpriteSubState | null): { visual: AssistantVisualState; ephemeral: boolean } {
  switch (state) {
    case 'idle':
      return { visual: 'idle', ephemeral: false };
    case 'walking':
      return { visual: 'walking', ephemeral: false };
    case 'running':
      return { visual: 'running', ephemeral: false };
    case 'dragging':
      return { visual: 'dragging', ephemeral: false };
    case 'sleeping':
      return { visual: 'sleepy', ephemeral: true };
    case 'bored':
      return { visual: 'bored', ephemeral: true };
    case 'reacting':
      switch (subState) {
        case 'click':
          return { visual: 'click', ephemeral: true };
        case 'hold':
          return { visual: 'hold', ephemeral: true };
        case 'drop':
          return { visual: 'drop', ephemeral: true };
        case 'file-drag-over':
          return { visual: 'fileDragOver', ephemeral: false };
        case 'file-drop':
          return { visual: 'fileDrop', ephemeral: true };
        case 'sleepy':
          return { visual: 'sleepy', ephemeral: true };
        default:
          return { visual: 'idle', ephemeral: false };
      }
    default:
      return { visual: 'idle', ephemeral: false };
  }
}

export default function useSpriteStateBridge(): void {
  const { stateMachine } = useSpritePersona();
  const sprite = useSpriteConductor();

  // 订阅 StateMachine 状态变化 → 驱动 Conductor
  useEffect(() => {
    const off = stateMachine.onChange((newState, _oldState, context) => {
      const { visual, ephemeral } = mapToVisualState(newState, context.subState);

      if (ephemeral) {
        sprite.playOnce(visual, { fallback: 'idle' });
      } else {
        sprite.to(visual);
      }
    });

    return off;
  }, [stateMachine, sprite]);

  // IPC bridge：主进程可以通过 sprite-command 控制精灵
  useEffect(() => {
    const onSpriteCommand = (_: any, action: string, payload?: any): void => {
      switch (action) {
        case 'sprite:idle':
          stateMachine.transitionTo('idle');
          break;
        case 'sprite:click':
          stateMachine.playOnce('click');
          break;
        case 'sprite:drag:start':
          stateMachine.transitionTo('dragging');
          break;
        case 'sprite:drag:end':
          stateMachine.transitionTo('idle');
          break;
        case 'sprite:walk:start':
          stateMachine.transitionTo('walking');
          break;
        case 'sprite:walk:end':
          stateMachine.transitionTo('idle');
          break;
        case 'sprite:run:start':
          stateMachine.transitionTo('running');
          break;
        case 'sprite:run:end':
          stateMachine.transitionTo('idle');
          break;
        case 'sprite:drop':
          stateMachine.playOnce('drop', { durationMs: payload?.durationMs || 600 });
          break;
        case 'sprite:fileDragOver':
          stateMachine.transitionTo('reacting', { subState: 'file-drag-over' });
          break;
        case 'sprite:fileDrop':
          stateMachine.playOnce('file-drop', { durationMs: payload?.durationMs || 600, fallback: 'idle' });
          break;
        default:
          break;
      }
    };

    window.ipcRenderer?.on('sprite-command', onSpriteCommand);
    return () => {
      window.ipcRenderer?.off('sprite-command', onSpriteCommand as any);
    };
  }, [stateMachine]);
}
