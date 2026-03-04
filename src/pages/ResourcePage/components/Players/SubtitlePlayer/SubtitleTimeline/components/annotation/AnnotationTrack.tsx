import clsx from 'clsx';
import React, { useMemo } from 'react';
import { TbBookmark, TbHighlight, TbNote, TbTrash, TbVocabulary } from 'react-icons/tb';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import type { AnnotationItem } from '../../adapters/types';
import { useAnnotationAdapter } from '../../context';
import type { AnnotationTrackCallbacks, ViewportState } from '../../types';
import { DEFAULT_CONFIG } from '../../types';

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
  // Get annotation adapter from context
  const annotationAdapter = useAnnotationAdapter();

  // 虚拟化：只渲染视口内的标注（带缓冲区）
  const bufferSeconds = 5;
  const visibleAnnotations = useMemo(() => {
    const viewStart = viewport.startTime - bufferSeconds;
    const viewEnd = viewport.endTime + bufferSeconds;
    return annotations.filter((a) => a.endTime >= viewStart && a.startTime <= viewEnd);
  }, [annotations, viewport.startTime, viewport.endTime]);

  // Helper to get annotation color from adapter
  const getAnnotationColorFromAdapter = (type: AnnotationItem['type']): string => {
    return annotationAdapter?.getAnnotationColor?.(type) || 'hsl(48, 95%, 55%)';
  };

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
        const color = annotation.color || getAnnotationColorFromAdapter(annotation.type);

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
                  callbacks?.onAnnotationDelete?.(annotation.id);
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
            <TooltipContent side="top" className="max-w-[200px]">
              <div className="text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {annotation.title && <div className="font-medium truncate">{annotation.title}</div>}
                    {annotation.description && <div className="text-muted-foreground mt-0.5 line-clamp-2">{annotation.description}</div>}
                    {/* 高亮类型不显示类型文字 */}
                    {!annotation.title && !annotation.description && annotation.type !== 'highlight' && <div className="text-muted-foreground">{annotation.type}</div>}
                  </div>
                  {callbacks?.onAnnotationDelete && (
                    <button
                      onClick={() => callbacks.onAnnotationDelete?.(annotation.id)}
                      className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      title="删除标注"
                    >
                      <TbTrash className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
};
