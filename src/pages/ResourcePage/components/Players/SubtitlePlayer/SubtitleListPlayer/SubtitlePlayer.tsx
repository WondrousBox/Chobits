import { AimSegments, utils } from '@aim-packages/subtitle';
import { useVirtualizer } from '@tanstack/react-virtual';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';

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
 * TTS合成结果项
 */
export interface TTSSynthesizedItem {
  /** 音频文件路径 */
  audioPath?: string;
  /** 音频时长（秒） */
  duration?: number;
  /** 去除静音后的时长（秒） */
  trimmedDuration?: number;
  /** 合成状态 */
  status: 'pending' | 'synthesizing' | 'completed' | 'error';
  /** 错误信息 */
  error?: string;
}

/**
 * 纯展示型字幕播放器（不包含资源读取、保存、翻译等业务逻辑）
 */
export interface SubtitlePlayerProps {
  /** 字幕轨道数组，第一个轨道（tracks[0]）作为主轨（负责时间轴和原文），其他轨道作为附加轨道显示 */
  tracks: AimSegments[][];
  /** 当前播放时间（秒），用于自动滚动和高亮 */
  currentTime?: number;
  /** 是否跟随当前时间自动滚动到可见区域 */
  followCurrentTime?: boolean;
  /** 点击时间戳时的跳转回调 */
  onSeek?: (time: number) => void;
  /** 当某一行文本变更后回调，返回新的 segments 数组（外层负责持久化等业务） */
  onSegmentsChange?: (segments: AimSegments[]) => void;
  /** 非主轨道文本变更回调（trackIndex 对应 tracks 数组的下标），外层负责持久化 */
  onTrackTextChange?: (trackIndex: number, segmentIndex: number, newText: string) => void;
  /** 启用的轨道索引集合，未在集合中的轨道将被隐藏；不传则全部显示 */
  enabledTrackIndices?: Set<number>;
  /** 外部处理：往前合并当前片段（与时间轴统一），主轨使用 trackId: 'track-0' */
  onMergePrev?: (payload: { trackId: string; segmentIndex: number }) => void;
  /** 外部处理：往后合并当前片段，主轨使用 trackId: 'track-0' */
  onMergeNext?: (payload: { trackId: string; segmentIndex: number }) => void;
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
  /** 轨道 ID 列表，与 tracks 顺序一致：主轨为 'main'，翻译轨为语言代码 */
  trackIds?: string[];
  /** 轨道显示名称列表，与 tracks 顺序一致：主轨为 '原文'，翻译轨为语言名 */
  trackLabels?: string[];
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
            <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">{chunkLabel || '正在翻译中'}</span>
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
export const SubtitlePlayer: React.FC<SubtitlePlayerProps> = ({
  tracks,
  currentTime = 0,
  followCurrentTime = false,
  onSeek,
  onSegmentsChange,
  onTrackTextChange,
  enabledTrackIndices,
  onMergePrev,
  onMergeNext,
  disabledIndices,
  highlightIndices,
  summaries,
  trackIds = ['main'],
  trackLabels
}) => {
  const activeRowRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 第一个轨道作为主轨道（添加空值保护）
  const mainTrack = useMemo(() => tracks?.[0] || [], [tracks]);

  const trackIdList = useMemo(() => {
    if (trackIds.length >= tracks.length) return trackIds;
    return tracks.map((_, idx) => trackIds[idx] ?? `track-${idx}`);
  }, [trackIds, tracks]);

  const trackLabelList = useMemo(() => {
    if (trackLabels && trackLabels.length >= tracks.length) return trackLabels;
    return tracks.map((_, idx) => {
      if (idx === 0) return '原文';
      return trackLabels?.[idx] ?? trackIdList[idx] ?? `track-${idx}`;
    });
  }, [trackLabels, trackIdList, tracks]);

  type ListRow = {
    id: string;
    trackIndex: number;
    segmentIndex: number;
    trackId: string;
    trackLabel: string;
    segment: AimSegments;
    start: number;
    end: number;
    isMain: boolean;
  };

  const listRows = useMemo<ListRow[]>(() => {
    const rows: ListRow[] = [];
    tracks.forEach((track, trackIndex) => {
      // 如果传入了 enabledTrackIndices 且当前轨道不在其中，跳过
      if (enabledTrackIndices && !enabledTrackIndices.has(trackIndex)) return;
      const trackId = trackIdList[trackIndex] ?? `track-${trackIndex}`;
      const trackLabel = trackLabelList[trackIndex] ?? trackId;
      track.forEach((segment, segmentIndex) => {
        if (segment.delete) return;
        const start = utils.convertToSeconds(segment.st);
        const end = utils.convertToSeconds(segment.et);
        rows.push({
          id: `${trackId}-${segmentIndex}`,
          trackIndex,
          segmentIndex,
          trackId,
          trackLabel,
          segment,
          start: Number.isFinite(start) ? start : 0,
          end: Number.isFinite(end) ? end : 0,
          isMain: trackIndex === 0
        });
      });
    });
    rows.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      if (a.trackIndex !== b.trackIndex) return a.trackIndex - b.trackIndex;
      return a.segmentIndex - b.segmentIndex;
    });
    return rows;
  }, [tracks, trackIdList, trackLabelList, enabledTrackIndices]);

  const disabledSet = toIndexSet(disabledIndices);
  const highlightSet = toIndexSet(highlightIndices);

  // 虚拟滚动配置
  const virtualizer = useVirtualizer({
    count: listRows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: useCallback(
      (index: number) => {
        const row = listRows[index];
        if (!row) return 56;
        return row.isMain ? 62 : 48;
      },
      [listRows]
    ),
    overscan: 8 // 预渲染前后8项
  });

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

  // 为每个 listRow 创建 onTextChange：主轨道走 handleTextChange，其他轨道走 onTrackTextChange
  const makeRowTextChangeHandler = useCallback(
    (row: ListRow) => {
      if (row.isMain) return handleTextChange;
      return (_segmentIndex: number, newText: string) => {
        onTrackTextChange?.(row.trackIndex, _segmentIndex, newText);
      };
    },
    [handleTextChange, onTrackTextChange]
  );

  const handleMergePrev = useCallback(
    (index: number): void => {
      // 仅通过外部回调处理合并
      onMergePrev?.({ trackId: 'track-0', segmentIndex: index });
    },
    [onMergePrev]
  );

  const handleMergeNext = useCallback(
    (index: number): void => {
      onMergeNext?.({ trackId: 'track-0', segmentIndex: index });
    },
    [onMergeNext]
  );

  // 每一行根据自身 st/et 判断是否处于当前播放时间范围内
  const activeRowSet = useMemo(() => {
    const set = new Set<number>();
    if (!currentTime || listRows.length === 0) return set;
    for (let i = 0; i < listRows.length; i++) {
      const row = listRows[i];
      if (currentTime >= row.start && currentTime < row.end) {
        set.add(i);
      }
    }
    return set;
  }, [currentTime, listRows]);

  // 用于自动滚动的目标行：优先主轨道的活跃行
  const scrollTargetIndex = useMemo(() => {
    for (const idx of activeRowSet) {
      if (listRows[idx]?.isMain) return idx;
    }
    // 如果没有主轨道匹配，取第一个活跃行
    const first = activeRowSet.values().next();
    return first.done ? -1 : first.value;
  }, [activeRowSet, listRows]);

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

  // 当高亮字幕改变时，自动滚动到该位置（虚拟滚动版本）
  useEffect(() => {
    if (!followCurrentTime) return;
    if (scrollTargetIndex >= 0) {
      virtualizer.scrollToIndex(scrollTargetIndex, {
        align: 'center',
        behavior: 'smooth'
      });
    }
  }, [scrollTargetIndex, followCurrentTime, virtualizer]);

  // 获取虚拟项
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollContainerRef}
      className="h-full w-full box-border text-muted-foreground overflow-auto select-text px-4 py-3 leading-relaxed [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/50"
    >
      {/* 虚拟滚动容器 */}
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative'
        }}
      >
        {/* 只渲染可见的项 */}
        {virtualItems.map((virtualItem) => {
          const rowIndex = virtualItem.index;
          const row = listRows[rowIndex];
          if (!row) return null;
          const disabled = row.isMain ? !!disabledSet?.has(row.segmentIndex) : false;
          const highlight = row.isMain ? !!highlightSet?.has(row.segmentIndex) : false;
          // 检查是否需要在当前索引前显示 summary 卡片（只绑定主轨道）
          const summaryInfo = row.isMain ? summaryDisplayMap.get(row.segmentIndex) : undefined;

          return (
            <div
              key={row.id}
              data-index={rowIndex}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`
              }}
            >
              {summaryInfo && (
                <SummaryCard
                  prevSummary={summaryInfo.prevSummary}
                  currentSummary={summaryInfo.summary}
                  chunkLabel={summaryDisplayMap.size > 1 ? `分块 ${summaryInfo.chunkIndex + 1} 翻译中` : '正在翻译中'}
                />
              )}
              <SubtitleRow
                index={row.segmentIndex}
                segment={row.segment}
                isActive={activeRowSet.has(rowIndex)}
                rowRef={rowIndex === scrollTargetIndex ? activeRowRef : undefined}
                onTextChange={makeRowTextChangeHandler(row)}
                onMergePrev={row.isMain ? handleMergePrev : undefined}
                onMergeNext={row.isMain ? handleMergeNext : undefined}
                onTimeClick={onSeek}
                disabled={disabled}
                highlight={highlight}
                isMainTrack={row.isMain}
                isEditable={true}
                trackLabel={row.trackLabel}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
