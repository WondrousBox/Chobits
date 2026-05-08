/**
 * BubbleModeSettings — 桌面精灵气泡展示模式总开关
 *
 * - 'inline' 传统模式：气泡渲染在主精灵窗口内，沿用 padding 撑出的空白区域。
 * - 'external' 跟随窗口模式：气泡由独立的 spriteBubble 跟随窗口承载，主窗口 padding
 *   在运行期被视为 0。
 * - 'fixed-top' 顶部悬浮模式：气泡由独立的 spriteBubbleFixedTop 窗口固定在主窗口上方展示。
 *
 * 切换 mode 时主进程会持久化新的偏好并广播 sprite:config，主/气泡窗口都会随之刷新。
 */

import type { SpriteBubbleMode } from '@packages/sprite-core/types';
import { DEFAULT_SPRITE_BUBBLE_MODE, normalizeSpriteBubbleMode } from '@packages/sprite-core/types';
import React, { useCallback, useEffect, useState } from 'react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const BUBBLE_MODE_OPTIONS: Array<{ value: SpriteBubbleMode; label: string; description: string }> = [
  { value: 'inline', label: '传统（精灵内嵌）', description: '气泡显示在主精灵窗口内，使用 padding 撑出的空白区域。' },
  { value: 'external', label: '跟随窗口', description: '气泡使用独立的跟随窗口展示，主窗口 padding 运行期视为 0。' },
  { value: 'fixed-top', label: '顶部悬浮', description: '气泡使用独立窗口固定在主窗口上方展示，并继续跟随主窗口移动。' }
];

interface BubbleModeSettingsProps {
  className?: string;
}

export const BubbleModeSettings: React.FC<BubbleModeSettingsProps> = ({ className }) => {
  const [mode, setMode] = useState<SpriteBubbleMode>(DEFAULT_SPRITE_BUBBLE_MODE);

  // 初始化：从主进程读取当前模式，并订阅 sprite:config 配置变更
  useEffect(() => {
    let disposed = false;

    window.YUA.sprite
      .getBubbleMode()
      .then((value) => {
        if (!disposed) setMode(normalizeSpriteBubbleMode(value));
      })
      .catch(() => undefined);

    const unsubscribe = window.YUA.sprite.onConfig((config) => {
      if (!config) return;
      setMode(normalizeSpriteBubbleMode(config.bubbleMode));
    });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);

  const handleChange = useCallback(async (next: SpriteBubbleMode) => {
    setMode(next);
    try {
      const applied = await window.YUA.sprite.setBubbleMode(next);
      setMode(normalizeSpriteBubbleMode(applied));
    } catch (error) {
      console.warn('[BubbleModeSettings] setBubbleMode failed:', error);
    }
  }, []);

  const description = BUBBLE_MODE_OPTIONS.find((o) => o.value === mode)?.description;

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground whitespace-nowrap">气泡模式</span>
        <Select value={mode} onValueChange={(value) => void handleChange(value as SpriteBubbleMode)}>
          <SelectTrigger className="h-8 w-[180px]" title="桌面精灵气泡展示模式">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BUBBLE_MODE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {description && <div className="text-[10px] text-muted-foreground/70 mt-1">{description}</div>}
    </div>
  );
};

export default BubbleModeSettings;
