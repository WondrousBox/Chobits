/**
 * useAssistant
 * - 负责：问候/工作区检查、获取屏幕与 movement 配置（含 padding）、初始窗口定位、阻止默认拖拽行为。
 * - 返回：{ padding, setPadding, screenSize, messageState, setMessageState }
 * - 场景：AIAssistant 组件挂载时调用一次。
 */
import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_ASSISTANT_PADDING, ASSISTANT_WIDTH, ASSISTANT_HEIGHT } from '../constants';
import type { MessageCategory } from '../types';

import { dispatchSpriteEvent, SpriteEventName } from '../events/spriteEvents';

export function useAssistant(): {
  padding: number;
  setPadding: (p: number) => void;
  screenSize: { width: number; height: number };
  messageState: MessageCategory;
  setMessageState: (s: MessageCategory) => void;
  setAssistantState: (e: SpriteEventName, s?: MessageCategory) => void;
} {
  const [padding, setPadding] = useState(DEFAULT_ASSISTANT_PADDING);
  const [screenSize, setScreenSize] = useState<{ width: number; height: number }>({ width: 1920, height: 1080 });
  const [messageState, setMessageState] = useState<MessageCategory>('welcome');

  // Greeting + workspace check
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setMessageState('welcome');
        await new Promise((r) => setTimeout(r, 600));
        if (!mounted) return;
        setMessageState('loading');
        const list = await window.YUA.workspace['workspace:list']({ filter: { deletedAt: 0 } as any, limit: 1, offset: 0 });
        if (!mounted) return;
        if (!Array.isArray(list) || list.length === 0) {
          setMessageState('configure');
          setTimeout(() => {
            try {
              window.YUA.window['window:open']('workspaceWizard');
            } catch { }
          }, 800);
        }
      } catch {
        /* noop */
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Get screen and movement config, and place window
  useEffect(() => {
    const getScreenInfo = async (): Promise<void> => {
      try {
        const size = await window.YUA.window['screen:size:get']();
        setScreenSize(size);
        const cfg = await window.YUA.window.getMovementConfig();
        const pad = cfg.assistantPadding;
        setPadding(pad);
        const winWidth = ASSISTANT_WIDTH + pad * 2;
        const winHeight = ASSISTANT_HEIGHT + pad * 2;
        const winX = Math.max(0, size.width - winWidth - 20);
        const winY = Math.max(0, size.height - winHeight - 40);
        await window.YUA.window['window:move']({ x: winX, y: winY });
      } catch (error) {
        console.error('Failed to get screen info:', error);
      }
    };
    getScreenInfo();
  }, []);

  const setAssistantState = useCallback((eventType: SpriteEventName, messageState?: MessageCategory) => {
    if (messageState) {
      setMessageState(messageState);
    }
    if (eventType) {
      dispatchSpriteEvent(eventType);
    }
  }, []);

  // Prevent browser default
  useEffect(() => {
    const prevent = (e: DragEvent): void => {
      e.preventDefault();
    };
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  return { padding, setPadding, screenSize, messageState, setMessageState, setAssistantState };
}

export default useAssistant;
