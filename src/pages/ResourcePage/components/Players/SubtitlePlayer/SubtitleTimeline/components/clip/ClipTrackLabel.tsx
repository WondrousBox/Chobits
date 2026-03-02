import clsx from 'clsx';
import React from 'react';
import { TbPointer, TbScissors } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

import type { ClipTool } from '../../types';
import { DEFAULT_CONFIG } from '../../types';

interface ClipTrackLabelProps {
  /** 当前激活的工具 */
  activeTool: ClipTool;
  /** 切换工具回调 */
  onToolChange?: (tool: ClipTool) => void;
  /** 剪辑片段数量 */
  clipCount: number;
  className?: string;
}

/**
 * ClipTrackLabel - 剪辑轨道左侧标签
 *
 * 显示轨道名称和工具切换按钮
 */
export const ClipTrackLabel: React.FC<ClipTrackLabelProps> = ({ activeTool, onToolChange, clipCount, className }) => {
  return (
    <div
      className={clsx('flex flex-col items-start justify-center px-2 border-b border-border bg-muted/30 shrink-0 overflow-hidden gap-0.5', className)}
      style={{ height: DEFAULT_CONFIG.CLIP_TRACK_HEIGHT + DEFAULT_CONFIG.TRACK_GAP }}
    >
      {/* 轨道名称 */}
      <div className="flex items-center gap-1.5 min-w-0 w-full">
        <div className="w-1.5 h-4 rounded-full shrink-0 bg-cyan-500" />
        <span className="text-xs text-foreground/80 truncate flex-1">剪辑</span>
        <span className="text-[10px] text-muted-foreground">{clipCount}</span>
      </div>

      {/* 工具切换 */}
      <div className="flex items-center gap-0.5">
        <Button variant={activeTool === 'select' ? 'secondary' : 'ghost'} size="sm" className="w-6 h-5 p-0" onClick={() => onToolChange?.('select')} title="选择工具">
          <TbPointer className="w-3 h-3" />
        </Button>
        <Button variant={activeTool === 'cut' ? 'secondary' : 'ghost'} size="sm" className="w-6 h-5 p-0" onClick={() => onToolChange?.('cut')} title="裁剪工具">
          <TbScissors className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
};
