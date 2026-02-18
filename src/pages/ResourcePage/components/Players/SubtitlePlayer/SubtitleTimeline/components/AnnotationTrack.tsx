import clsx from 'clsx';
import React, { useMemo } from 'react';
import { TbBookmark, TbHighlight, TbNote, TbTrash, TbVocabulary } from 'react-icons/tb';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import type { AnnotationItem } from '../../useAnnotations';
import { getAnnotationColor } from '../../useAnnotations';
import type { AnnotationTrackCallbacks, ViewportState } from '../types';
import { DEFAULT_CONFIG } from '../types';

interface AnnotationTrackProps {
  /** 标注列表 */
  annotations: AnnotationItem[];
  /** 总宽度（像素） */
  totalWidth: number;
  /** 每秒像素数 */
  pixelsPerSecond: number;
  /** 视口状态 */
  viewport: ViewportState;
  /** 回调 */
  callbacks?: AnnotationTrackCallbacks;
  /** 是否启用 */
  enabled?: boolean;
}

const ANNOTATION_TYPE_ICONS: Record<string, React.ReactNode> = {
  highlight: <TbHighlight className="w-3 h-3" />,
  note: <TbNote className="w-3 h-3" />,
  vocabulary: <TbVocabulary className="w-3 h-3" />,
  comment: <TbNote className="w-3 h-3" />,
  custom: <TbBookmark className="w-3 h-3" />
};

/**
 * AnnotationTrack - 标注轨道渲染组件
 * 在时间轴上显示标注标记，每个标注显示为一个色块
 */
export const AnnotationTrack: React.FC<AnnotationTrackProps> = ({ annotations, totalWidth, pixelsPerSecond, viewport, callbacks, enabled = true }) => {
  // 虚拟化：只渲染视口内的标注（带缓冲区）
  const bufferSeconds = 5;
  const visibleAnnotations = useMemo(() => {
    const viewStart = viewport.startTime - bufferSeconds;
    const viewEnd = viewport.endTime + bufferSeconds;
    return annotations.filter((a) => a.endTime >= viewStart && a.startTime <= viewEnd);
  }, [annotations, viewport.startTime, viewport.endTime]);

  return (
    <div
      className={clsx('relative border-b border-border shrink-0', !enabled && 'opacity-30')}
      style={{
        width: totalWidth,
        height: DEFAULT_CONFIG.TRACK_HEIGHT + DEFAULT_CONFIG.TRACK_GAP
      }}
    >
      {visibleAnnotations.map((annotation) => {
        const left = annotation.startTime * pixelsPerSecond;
        const width = Math.max((annotation.endTime - annotation.startTime) * pixelsPerSecond, 6); // 最小 6px 确保可见
        const color = annotation.color || getAnnotationColor(annotation.type);

        return (
          <Tooltip key={annotation.id}>
            <TooltipTrigger asChild>
              <div
                data-annotation-marker
                className="absolute top-1 cursor-pointer rounded-sm flex items-center justify-center gap-0.5 hover:brightness-110 transition-all"
                style={{
                  left,
                  width,
                  height: DEFAULT_CONFIG.TRACK_HEIGHT - 8,
                  backgroundColor: `${color}30`,
                  borderLeft: `2px solid ${color}`,
                  borderBottom: `1px solid ${color}40`
                }}
                onClick={() => callbacks?.onAnnotationClick?.(annotation)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (callbacks?.onAnnotationDelete) {
                    if (window.confirm('删除此标注？')) {
                      callbacks.onAnnotationDelete(annotation.id);
                    }
                  }
                }}
              >
                <span style={{ color }} className="text-xs opacity-80">
                  {ANNOTATION_TYPE_ICONS[annotation.type] || ANNOTATION_TYPE_ICONS.custom}
                </span>
                {width > 40 && (
                  <span className="text-[10px] truncate max-w-full px-0.5" style={{ color }}>
                    {annotation.title || annotation.text}
                  </span>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[250px]">
              <div className="text-xs space-y-1">
                <div className="flex items-center gap-1.5">
                  <span style={{ color }}>{ANNOTATION_TYPE_ICONS[annotation.type]}</span>
                  <span className="font-medium">{annotation.title || annotation.type}</span>
                </div>
                <div className="text-muted-foreground italic">「{annotation.text}」</div>
                {annotation.description && <div className="text-muted-foreground">{annotation.description}</div>}
                <div className="text-muted-foreground/60 text-[10px]">
                  {formatTime(annotation.startTime)} → {formatTime(annotation.endTime)}
                </div>
                {callbacks?.onAnnotationDelete && <div className="text-muted-foreground/50 text-[10px]">右键删除</div>}
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
