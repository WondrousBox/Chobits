import { AimSegments, utils } from '@aim-packages/subtitle';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';

import { SubtitleRow } from './SubtitleRow';

/**
 * Chunk 总结信息（支持多 chunk 并发翻译时各自的 summary 展示）
 */
export interface ChunkSummaryInfo {
  /** chunk 索引 */
  chunkIndex: number;
  /** 当前 chunk 的总结内容 */
  summary: string;
  /** 该 chunk 在字幕数组中的起始索引 */
  startIndex: number;
  /** 该 chunk 在字幕数组中的结束索引 */
  endIndex: number;
  /** 上一个 chunk 的总结（作为上下文） */
  prevSummary?: string;
}

/**
 * 旧版总结信息格式（向后兼容）
 */
export interface LegacySummaries {
  /** 上一段翻译的总结 */
  prev?: string;
  /** 当前正在翻译的总结 */
  current?: string;
}

/**
 * 纯展示型字幕播放器（不包含资源读取、保存、翻译等业务逻辑）
 */
export interface SubtitlePlayerProps {
  /** 字幕轨道数组，第一个轨道（tracks[0]）作为主轨（负责时间轴和原文），其他轨道作为附加轨道显示 */
  tracks: AimSegments[][];
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
  /**
   * 总结信息，支持两种格式：
   * - Map<number, ChunkSummaryInfo>: 新格式，支持多 chunk 并发展示
   * - LegacySummaries: 旧格式，向后兼容
   */
  summaries?: Map<number, ChunkSummaryInfo> | LegacySummaries;
}

const toIndexSet = (value?: Set<number> | number[]): Set<number> | undefined => {
  if (!value) return undefined;
  return value instanceof Set ? value : new Set(value);
};

/**
 * 判断 summaries 是否为新格式（Map）
 */
const isChunkSummaryMap = (summaries?: Map<number, ChunkSummaryInfo> | LegacySummaries): summaries is Map<number, ChunkSummaryInfo> => {
  return summaries instanceof Map;
};

/**
 * Summary 卡片组件 - 用于展示翻译中的 chunk summary
 */
const SummaryCard: React.FC<{
  prevSummary?: string;
  currentSummary?: string;
  chunkLabel?: string;
}> = ({ prevSummary, currentSummary, chunkLabel }) => (
  <div className="relative px-3 py-3 rounded-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-500">
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
      {prevSummary && (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-pulse" style={{ animationDelay: '0s' }} />
              <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
            </div>
            <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">前面提到</span>
          </div>
          <div className="text-xs text-foreground/80 dark:text-foreground/70 italic border-l-2 border-slate-400/60 dark:border-slate-500/60 pl-3 py-1 leading-relaxed">
            <span>{prevSummary}</span>
          </div>
        </div>
      )}
      {currentSummary && (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0s' }} />
              <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
              <div className="w-1.5 h-1.5 bg-pink-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
            </div>
            <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
              {chunkLabel || '正在翻译中'}
            </span>
          </div>
          <div className="text-xs text-foreground/90 dark:text-foreground/80 italic border-l-2 border-blue-400/60 dark:border-blue-500/60 pl-3 py-1 leading-relaxed">
            <span>{currentSummary}</span>
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
);

// 仅负责渲染和交互的字幕组件
export const SubtitlePlayer: React.FC<SubtitlePlayerProps> = ({ tracks, currentTime = 0, onSeek, onSegmentsChange, disabledIndices, highlightIndices, summaries }) => {
  const activeRowRef = useRef<HTMLDivElement>(null);

  // 第一个轨道作为主轨道（添加空值保护）
  const mainTrack = tracks?.[0] || [];
  // 其他轨道作为附加轨道
  const additionalTracks = tracks?.slice(1) || [];

  const disabledSet = toIndexSet(disabledIndices);
  const highlightSet = toIndexSet(highlightIndices);

  const handleTextChange = useCallback(
    (index: number, text: string): void => {
      if (!onSegmentsChange) return;
      const updated = mainTrack.map((item, i) => {
        if (i === index) {
          return { ...item, text };
        }
        return item;
      });
      onSegmentsChange(updated);
    },
    [mainTrack, onSegmentsChange]
  );

  const handleMergePrev = useCallback(
    (index: number): void => {
      if (!onSegmentsChange || index <= 0) return;
      const merged = utils.mergeAimSegmentRange(mainTrack, index - 1, index);
      onSegmentsChange(merged);
    },
    [mainTrack, onSegmentsChange]
  );

  const handleMergeNext = useCallback(
    (index: number): void => {
      if (!onSegmentsChange) return;
      const merged = utils.mergeAimSegmentRange(mainTrack, index, index + 1);
      onSegmentsChange(merged);
    },
    [mainTrack, onSegmentsChange]
  );

  // 根据当前时间找到对应的字幕索引（基于主轨道）
  const activeIndex = useMemo(() => {
    if (!currentTime || mainTrack.length === 0) return -1;

    for (let i = 0; i < mainTrack.length; i++) {
      const segment = mainTrack[i];
      if (segment.delete) continue;

      const startTime = utils.convertToSeconds(segment.st);
      const endTime = utils.convertToSeconds(segment.et);

      if (currentTime >= startTime && currentTime < endTime) {
        return i;
      }
    }

    return -1;
  }, [currentTime, mainTrack]);

  // 计算需要在哪些索引前显示 summary 卡片
  // 返回 Map<segmentIndex, ChunkSummaryInfo>
  const summaryDisplayMap = useMemo(() => {
    const map = new Map<number, ChunkSummaryInfo>();
    if (!summaries) return map;

    if (isChunkSummaryMap(summaries)) {
      // 新格式：直接使用 startIndex 作为 key
      for (const [, info] of summaries) {
        map.set(info.startIndex, info);
      }
    } else {
      // 旧格式：使用 firstTranslatingIndex
      if (highlightSet && highlightSet.size > 0 && (summaries.prev || summaries.current)) {
        const firstIdx = Math.min(...Array.from(highlightSet));
        if (firstIdx >= 0) {
          map.set(firstIdx, {
            chunkIndex: 0,
            summary: summaries.current || '',
            startIndex: firstIdx,
            endIndex: Math.max(...Array.from(highlightSet)),
            prevSummary: summaries.prev
          });
        }
      }
    }
    return map;
  }, [summaries, highlightSet]);

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

  return (
    <div className="flex h-full w-full flex-col text-muted-foreground">
      <ScrollArea className="h-full w-full">
        <div className="box-border h-full w-full select-text overflow-auto px-4 py-3 leading-relaxed">
          {mainTrack.map((entry, idx) => {
            const disabled = !!disabledSet?.has(idx);
            const highlight = !!highlightSet?.has(idx);
            // 检查是否需要在当前索引前显示 summary 卡片
            const summaryInfo = summaryDisplayMap.get(idx);

            return (
              <React.Fragment key={idx}>
                {summaryInfo && (
                  <SummaryCard
                    prevSummary={summaryInfo.prevSummary}
                    currentSummary={summaryInfo.summary}
                    chunkLabel={summaryDisplayMap.size > 1 ? `分块 ${summaryInfo.chunkIndex + 1} 翻译中` : '正在翻译中'}
                  />
                )}
                {/* 主轨道 */}
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
                {/* 附加轨道 */}
                {additionalTracks.map((track, trackIndex) => {
                  const trackSegment = track[idx];
                  if (!trackSegment || !trackSegment.text) return null;
                  return (
                    <SubtitleRow
                      key={`track-${trackIndex}-${idx}`}
                      index={idx}
                      segment={trackSegment}
                      isActive={false}
                      disabled={disabled}
                      highlight={highlight}
                      onTextChange={handleTextChange}
                      onMergePrev={handleMergePrev}
                      onMergeNext={handleMergeNext}
                      onTimeClick={onSeek}
                    />
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};
