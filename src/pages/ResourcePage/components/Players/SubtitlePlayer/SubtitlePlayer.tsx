import { AimSegments, utils } from '@aim-packages/subtitle';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';

import { SubtitleRow } from './SubtitleRow';

/**
 * 纯展示型字幕播放器（不包含资源读取、保存、翻译等业务逻辑）
 */
export interface SubtitlePlayerProps {
  /** 字幕主轨（负责时间轴和原文） */
  segments: AimSegments[];
  /** 当前播放时间（秒），用于自动滚动和高亮 */
  currentTime?: number;
  /** 点击时间戳时的跳转回调 */
  onSeek?: (time: number) => void;
  /** 当某一行文本变更后回调，返回新的 segments 数组（外层负责持久化等业务） */
  onSegmentsChange?: (segments: AimSegments[]) => void;
  /** 需要禁用交互的行索引集合（例如翻译中的片段） */
  disabledIndices?: Set<number> | number[];
  /** 需要高亮显示的行索引集合（例如当前翻译中的片段） */
  highlightIndices?: Set<number> | number[];
  /** 第二轨道字幕（例如翻译结果），与主轨道 segments 一一对应 */
  track2Segments?: AimSegments[];
  /** 总结信息，仅负责展示 */
  summaries?: {
    /** 上一段翻译的总结 */
    prev?: string;
    /** 当前正在翻译的总结 */
    current?: string;
  };
  /** 是否自动滚动到总结位置（当总结位置变化时） */
  autoScrollToSummary?: boolean;
}

const toIndexSet = (value?: Set<number> | number[]): Set<number> | undefined => {
  if (!value) return undefined;
  return value instanceof Set ? value : new Set(value);
};

// 仅负责渲染和交互的字幕组件
export const SubtitlePlayer: React.FC<SubtitlePlayerProps> = ({
  segments,
  currentTime = 0,
  onSeek,
  onSegmentsChange,
  disabledIndices,
  highlightIndices,
  track2Segments,
  summaries,
  autoScrollToSummary = false
}) => {
  const activeRowRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const disabledSet = toIndexSet(disabledIndices);
  const highlightSet = toIndexSet(highlightIndices);

  const handleTextChange = useCallback(
    (index: number, text: string): void => {
      if (!onSegmentsChange) return;
      const updated = segments.map((item, i) => {
        if (i === index) {
          return { ...item, text };
        }
        return item;
      });
      onSegmentsChange(updated);
    },
    [segments, onSegmentsChange]
  );

  const handleMergePrev = useCallback(
    (index: number): void => {
      if (!onSegmentsChange || index <= 0) return;
      const merged = utils.mergeAimSegmentRange(segments, index - 1, index);
      onSegmentsChange(merged);
    },
    [segments, onSegmentsChange]
  );

  const handleMergeNext = useCallback(
    (index: number): void => {
      if (!onSegmentsChange) return;
      const merged = utils.mergeAimSegmentRange(segments, index, index + 1);
      onSegmentsChange(merged);
    },
    [segments, onSegmentsChange]
  );

  // 根据当前时间找到对应的字幕索引
  const activeIndex = useMemo(() => {
    if (!currentTime || segments.length === 0) return -1;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (segment.delete) continue;

      const startTime = utils.convertToSeconds(segment.st);
      const endTime = utils.convertToSeconds(segment.et);

      if (currentTime >= startTime && currentTime < endTime) {
        return i;
      }
    }

    return -1;
  }, [currentTime, segments]);

  // 找到正在翻译的片段的最小索引（用于在它前面显示总结）
  const firstTranslatingIndex = useMemo(() => {
    if (!highlightSet || highlightSet.size === 0) return -1;
    return Math.min(...Array.from(highlightSet));
  }, [highlightSet]);

  // 当高亮字幕改变时，自动滚动到该位置
  useEffect(() => {
    if (activeIndex >= 0 && activeRowRef.current) {
      const rowElement = activeRowRef.current;
      // 查找 ScrollArea 的 viewport（从行元素向上查找）
      const scrollArea = rowElement.closest('[data-radix-scroll-area-viewport]') as HTMLElement;

      if (scrollArea) {
        // 使用 requestAnimationFrame 确保 DOM 已更新
        requestAnimationFrame(() => {
          // 获取行元素相对于滚动容器的位置
          const container = rowElement.offsetParent as HTMLElement;
          if (!container) return;

          const rowTop = rowElement.offsetTop;
          const rowHeight = rowElement.offsetHeight;
          const scrollTop = scrollArea.scrollTop;
          const scrollHeight = scrollArea.clientHeight;

          // 如果当前行不在可视区域内，则滚动到该位置
          if (rowTop < scrollTop || rowTop + rowHeight > scrollTop + scrollHeight) {
            // 滚动到行位置，让当前行显示在视口中间偏上的位置
            scrollArea.scrollTo({
              top: rowTop - scrollHeight / 3,
              behavior: 'smooth'
            });
          }
        });
      }
    }
  }, [activeIndex]);

  // 当总结位置变化时，自动滚动到总结位置（如果开启了自动滚动）
  useEffect(() => {
    if (!autoScrollToSummary || firstTranslatingIndex < 0 || !summaries?.current || !summaryRef.current) {
      return;
    }

    const summaryElement = summaryRef.current;
    // 查找 ScrollArea 的 viewport
    const scrollArea = summaryElement.closest('[data-radix-scroll-area-viewport]') as HTMLElement;

    if (scrollArea) {
      // 使用 requestAnimationFrame 确保 DOM 已更新
      requestAnimationFrame(() => {
        // 获取总结元素相对于滚动容器的位置
        const container = summaryElement.offsetParent as HTMLElement;
        if (!container) return;

        const summaryTop = summaryElement.offsetTop;
        const summaryHeight = summaryElement.offsetHeight;
        const scrollTop = scrollArea.scrollTop;
        const scrollHeight = scrollArea.clientHeight;

        // 如果总结不在可视区域内，则滚动到该位置
        if (summaryTop < scrollTop || summaryTop + summaryHeight > scrollTop + scrollHeight) {
          // 滚动到总结位置，让总结显示在视口上方一点的位置
          scrollArea.scrollTo({
            top: Math.max(0, summaryTop - 20),
            behavior: 'smooth'
          });
        }
      });
    }
  }, [firstTranslatingIndex, summaries?.current, autoScrollToSummary]);

  return (
    <div className="flex h-full w-full flex-col text-muted-foreground">
      <ScrollArea className="h-full w-full">
        <div className="box-border h-full w-full select-text overflow-auto rounded border px-4 py-3 leading-relaxed shadow-inner">
          {segments.map((entry, idx) => {
            const disabled = !!disabledSet?.has(idx);
            const highlight = !!highlightSet?.has(idx);
            const track2Segment = track2Segments?.[idx];
            // 如果当前索引是第一个正在翻译的片段，且存在总结，则在它前面显示总结
            const shouldShowSummaryBefore = idx === firstTranslatingIndex && (summaries?.prev || summaries?.current);

            return (
              <React.Fragment key={idx}>
                {shouldShowSummaryBefore && (
                  <div ref={summaryRef} className="relative px-3 py-3 rounded-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-500">
                    {/* 渐变背景 */}
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 dark:from-blue-500/10 dark:via-purple-500/10 dark:to-pink-500/10 animate-pulse" />
                    {/* 流动光效 */}
                    <div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent dark:via-white/10 animate-[shimmer_3s_ease-in-out_infinite] -translate-x-full"
                      style={{ animationDelay: '0.5s' }}
                    />
                    {/* 边框光晕 */}
                    <div className="absolute inset-0 rounded-lg border-2 border-blue-400/50 dark:border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.5)] dark:shadow-[0_0_15px_rgba(59,130,246,0.3)] animate-pulse" />
                    {/* 内容 */}
                    <div className="relative z-10 space-y-2">
                      {summaries?.prev && (
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <div className="flex gap-1">
                              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-pulse" style={{ animationDelay: '0s' }} />
                              <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                            </div>
                            <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">前面提到</span>
                          </div>
                          <div className="text-xs text-foreground/80 dark:text-foreground/70 italic border-l-2 border-slate-400/60 dark:border-slate-500/60 pl-3 py-1 leading-relaxed">
                            <span>{summaries.prev}</span>
                          </div>
                        </div>
                      )}
                      {summaries?.current && (
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <div className="flex gap-1">
                              <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0s' }} />
                              <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                              <div className="w-1.5 h-1.5 bg-pink-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                            </div>
                            <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">正在翻译中</span>
                          </div>
                          <div className="text-xs text-foreground/90 dark:text-foreground/80 italic border-l-2 border-blue-400/60 dark:border-blue-500/60 pl-3 py-1 leading-relaxed">
                            <span>{summaries.current}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <style>{`
                      @keyframes shimmer {
                        0% { transform: translateX(-100%) skewX(-15deg); }
                        100% { transform: translateX(200%) skewX(-15deg); }
                      }
                    `}</style>
                  </div>
                )}
                <SubtitleRow
                  index={idx}
                  segment={entry}
                  isActive={idx === activeIndex}
                  rowRef={idx === activeIndex ? activeRowRef : undefined}
                  onTextChange={handleTextChange}
                  onMergePrev={handleMergePrev}
                  onMergeNext={handleMergeNext}
                  onTimeClick={onSeek}
                  disabled={disabled}
                  highlight={highlight}
                />
                {track2Segment && track2Segment.text && (
                  <SubtitleRow
                    index={idx}
                    segment={track2Segment}
                    isActive={false}
                    disabled={disabled}
                    highlight={highlight}
                    onTextChange={handleTextChange}
                    onMergePrev={handleMergePrev}
                    onMergeNext={handleMergeNext}
                    onTimeClick={onSeek}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};
