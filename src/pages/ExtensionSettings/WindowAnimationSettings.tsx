import React from 'react';
import { TbRoute } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { WINDOW_ANIMATION_PRESET_CATEGORIES, WINDOW_ANIMATION_PRESETS, type WindowAnimationPresetId } from './window-animation-presets';

export const WindowAnimationItem: React.FC<{
  selected: boolean;
  onSelect: () => void;
}> = ({ selected, onSelect }) => (
  <div onClick={onSelect} className={cn('flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-accent/50', selected && 'bg-accent ring-1 ring-primary/30')}>
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      <TbRoute className="h-5 w-5" />
    </div>
    <div className="min-w-0 flex-1">
      <div className="text-sm font-medium text-foreground">窗口动画编排</div>
      <div className="line-clamp-1 text-xs text-muted-foreground">编辑桌面路径、关键帧、窗口大小和透明度</div>
    </div>
  </div>
);

function openEditor(presetId?: WindowAnimationPresetId): void {
  void window.YUA.window['window:open']('windowAnimationEditor', presetId ? { presetId } : undefined);
}

export const WindowAnimationDetailContent: React.FC = () => (
  <div className="space-y-4">
    <div className="space-y-1">
      <h3 className="text-base font-semibold text-foreground">窗口动画编排</h3>
      <p className="text-sm text-muted-foreground">通过独立编辑器绘制桌面坐标路径，为任意窗口配置关键帧、贝塞尔曲线、尺寸变化和透明度变化。</p>
    </div>
    <Button size="sm" onClick={() => openEditor()}>
      新建自定义动画
    </Button>

    <div className="space-y-3">
      {WINDOW_ANIMATION_PRESET_CATEGORIES.map((group) => (
        <div key={group.category} className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">{group.label}</div>
          <div className="grid grid-cols-2 gap-2">
            {WINDOW_ANIMATION_PRESETS.filter((preset) => preset.category === group.category).map((preset) => (
              <button key={preset.id} type="button" className="rounded-md border px-3 py-2 text-left transition-colors hover:border-primary/60 hover:bg-accent" onClick={() => openEditor(preset.id)}>
                <div className="text-sm font-medium text-foreground">{preset.label}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{preset.supportsDirection ? '可选方向' : '基于当前帧'}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default WindowAnimationDetailContent;
