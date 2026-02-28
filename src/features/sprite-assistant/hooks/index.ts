/**
 * useAssistant (简化版)
 *
 * 仅负责：阻止默认拖拽行为。
 * 精灵尺寸/定位现由 SpriteStateContext + 主进程管理。
 */
import { useEffect } from 'react';

export function useAssistant(): void {
  // Prevent browser default drag behavior
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
}

export default useAssistant;
