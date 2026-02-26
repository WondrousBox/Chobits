/**
 * useAssistant
 * - 负责：获取屏幕与精灵动画配置（含 padding）、初始窗口定位、阻止默认拖拽行为。
 * - 返回：{ padding, setPadding, screenSize, messageState, setMessageState }
 * - 场景：AIAssistant 组件挂载时调用一次。
 */
import { useEffect, useRef, useState } from 'react';

import { DEFAULT_ASSISTANT_PADDING } from '../constants';
import { useSpritePlayer } from '../context/SpritePlayerContext';
import type { MessageCategory } from '../types';

export function useAssistant(): {
  padding: number;
  setPadding: (p: number) => void;
  screenSize: { width: number; height: number };
  messageState: MessageCategory;
  setMessageState: (s: MessageCategory) => void;
} {
  const { current: currentSprite } = useSpritePlayer();
  const [padding, setPadding] = useState(DEFAULT_ASSISTANT_PADDING);
  const [screenSize, setScreenSize] = useState<{ width: number; height: number }>({ width: 1920, height: 1080 });
  const [messageState, setMessageState] = useState<MessageCategory>('welcome');
  const isInitialMountRef = useRef(true);

  // 根据当前精灵动画更新 padding
  useEffect(() => {
    if (currentSprite) {
      const pad = currentSprite.padding ?? DEFAULT_ASSISTANT_PADDING;
      setPadding(pad);
    }
  }, [currentSprite]);

  // Get screen info and place window
  useEffect(() => {
    const getScreenInfo = async (): Promise<void> => {
      try {
        const size = await window.YUA.window['screen:size:get']();
        setScreenSize(size);
      } catch (error) {
        console.error('Failed to get screen info:', error);
      }
    };
    getScreenInfo();
  }, []);

  // 当精灵动画或屏幕尺寸变化时，处理窗口位置
  useEffect(() => {
    if (!currentSprite || !screenSize.width || !screenSize.height) return;

    const handleWindowPosition = async (): Promise<void> => {
      try {
        const width = currentSprite.width ?? 180;
        const height = currentSprite.height ?? 240;
        const pad = currentSprite.padding ?? DEFAULT_ASSISTANT_PADDING;
        const winWidth = width + pad * 2;
        const winHeight = height + pad * 2;

        // 首次启动时，重置位置到右下角
        if (isInitialMountRef.current) {
          const winX = Math.max(0, screenSize.width - winWidth - 20);
          const winY = Math.max(0, screenSize.height - winHeight - 40);
          await window.YUA.window['window:move']({ x: winX, y: winY });
          isInitialMountRef.current = false;
        } else {
          // 非首次启动时，获取当前位置并检查是否超出屏幕
          const [currentX, currentY] = await window.YUA.window['window:position:get']();

          // 计算边界
          const minX = -pad;
          const maxX = screenSize.width - winWidth + pad;
          const minY = -pad;
          const maxY = screenSize.height - winHeight + pad;

          // 如果位置超出屏幕，调整到边界内
          let newX = currentX;
          let newY = currentY;
          let needsMove = false;

          if (currentX < minX) {
            newX = minX;
            needsMove = true;
          } else if (currentX > maxX) {
            newX = maxX;
            needsMove = true;
          }

          if (currentY < minY) {
            newY = minY;
            needsMove = true;
          } else if (currentY > maxY) {
            newY = maxY;
            needsMove = true;
          }

          // 只有在需要调整时才移动窗口
          if (needsMove) {
            await window.YUA.window['window:move']({ x: newX, y: newY });
          }
        }
      } catch (error) {
        console.error('Failed to handle window position:', error);
      }
    };

    handleWindowPosition();
  }, [currentSprite, screenSize]);

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

  return { padding, setPadding, screenSize, messageState, setMessageState };
}

export default useAssistant;
