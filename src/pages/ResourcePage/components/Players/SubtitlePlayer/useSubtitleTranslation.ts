import { AimSegments } from '@aim-packages/subtitle';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ChunkSummaryInfo } from './SubtitleListPlayer/SubtitlePlayer';

/**
 * 节流状态 Hook - 用于高频更新的状态，但不丢失数据
 * 与防抖不同，节流会累积所有更新，然后在延迟后一次性应用
 */
function useThrottledState<T>(initialValue: T, delay: number = 100): [T, (updater: (prev: T) => T) => void] {
  const [state, setState] = useState<T>(initialValue);
  const pendingUpdatersRef = useRef<Array<(prev: T) => T>>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const latestStateRef = useRef<T>(initialValue);

  // 保持 latestStateRef 同步
  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  const setThrottledState = useCallback(
    (updater: (prev: T) => T) => {
      // 累积更新器
      pendingUpdatersRef.current.push(updater);

      if (!timeoutRef.current) {
        timeoutRef.current = setTimeout(() => {
          // 应用所有累积的更新
          if (pendingUpdatersRef.current.length > 0) {
            let currentValue = latestStateRef.current;
            for (const fn of pendingUpdatersRef.current) {
              currentValue = fn(currentValue);
            }
            pendingUpdatersRef.current = [];
            setState(currentValue);
            latestStateRef.current = currentValue;
          }
          timeoutRef.current = null;
        }, delay);
      }
    },
    [delay]
  );

  useEffect(() => {
    return () => {
      // 组件卸载时，立即应用所有待处理的更新
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        if (pendingUpdatersRef.current.length > 0) {
          let currentValue = latestStateRef.current;
          for (const fn of pendingUpdatersRef.current) {
            currentValue = fn(currentValue);
          }
          pendingUpdatersRef.current = [];
          setState(currentValue);
        }
      }
    };
  }, []);

  return [state, setThrottledState];
}

/**
 * 批量状态更新 Hook - 合并多次状态更新，不丢失数据
 * 累积所有 updater 函数，然后在下一个帧一次性应用
 */
function useBatchedState<T>(initialValue: T): [T, (updater: (prev: T) => T) => void] {
  const [state, setState] = useState<T>(initialValue);
  const pendingUpdatersRef = useRef<Array<(prev: T) => T>>([]);
  const rafRef = useRef<number | null>(null);
  const latestStateRef = useRef<T>(initialValue);

  // 保持 latestStateRef 同步
  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  const setBatchedState = useCallback((updater: (prev: T) => T) => {
    // 累积更新器
    pendingUpdatersRef.current.push(updater);

    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        // 应用所有累积的更新
        if (pendingUpdatersRef.current.length > 0) {
          let currentValue = latestStateRef.current;
          for (const fn of pendingUpdatersRef.current) {
            currentValue = fn(currentValue);
          }
          pendingUpdatersRef.current = [];
          setState(currentValue);
          latestStateRef.current = currentValue;
        }
        rafRef.current = null;
      });
    }
  }, []);

  useEffect(() => {
    return () => {
      // 组件卸载时，立即应用所有待处理的更新
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        if (pendingUpdatersRef.current.length > 0) {
          let currentValue = latestStateRef.current;
          for (const fn of pendingUpdatersRef.current) {
            currentValue = fn(currentValue);
          }
          pendingUpdatersRef.current = [];
          setState(currentValue);
        }
      }
    };
  }, []);

  return [state, setBatchedState];
}

/**
 * 翻译事件类型
 */
export interface TranslationEvent {
  type: string;
  requestId?: string;
  data?: any;
}

/**
 * Chunk 完成时的回调数据
 */
export interface ChunkCompleteData {
  /** Chunk 索引 */
  chunkIndex: number;
  /** 起始索引 */
  startIndex: number;
  /** 结束索引 */
  endIndex: number;
  /** 翻译完成的片段数组 */
  segments: Array<{ index: number; text: string }>;
}

/**
 * Hook 配置选项
 */
export interface UseSubtitleTranslationOptions {
  /** 资源 ID，用于匹配翻译任务 */
  resourceId: string;
  /** 字幕条目数组的引用（用于获取最新值） */
  subtitleEntriesRef: React.RefObject<AimSegments[]>;
  /** 翻译完成时的回调 */
  onTranslationComplete?: () => void;
  /** Chunk 翻译完成时的回调（用于保存字幕） */
  onChunkComplete?: (data: ChunkCompleteData) => void;
}

/**
 * Hook 返回值
 */
export interface UseSubtitleTranslationReturn {
  /** 正在翻译的片段索引集合 */
  translatingChunks: Set<number>;
  /** 已翻译完成的片段索引集合 */
  translatedChunks: Set<number>;
  /** 第二轨道字幕（翻译结果，与主轨道一一对应） */
  typingTexts: AimSegments[];
  /** 多 chunk summary 信息 */
  chunkSummaryInfoMap: Map<number, ChunkSummaryInfo>;
  /** 翻译进度 0-100 */
  translationProgress: number;
  /** 是否正在翻译 */
  isTranslating: boolean;
  /** 翻译是否已完成 */
  isTranslationComplete: boolean;
  /** 开始翻译（设置 requestId） */
  startTranslation: (requestId: string) => void;
  /** 停止翻译 */
  stopTranslation: () => Promise<void>;
  /** 重置翻译状态 */
  resetTranslation: () => void;
  /** 清空临时翻译轨道（在新轨道加载成功后调用） */
  clearTypingTexts: () => void;
  /** 当前活跃的翻译请求 ID */
  activeRequestId: string | null;
}

/**
 * 字幕翻译逻辑 Hook
 * 负责管理翻译状态、监听翻译事件、处理翻译进度等
 * 与 UI 完全分离，可复用于任何字幕播放器组件
 */
export function useSubtitleTranslation({ resourceId, subtitleEntriesRef, onTranslationComplete, onChunkComplete }: UseSubtitleTranslationOptions): UseSubtitleTranslationReturn {
  // 翻译状态管理
  const [translatingChunks, setTranslatingChunks] = useBatchedState<Set<number>>(new Set());
  const [translatedChunks, setTranslatedChunks] = useBatchedState<Set<number>>(new Set());
  const [chunkSummaries, setChunkSummaries] = useThrottledState<Map<number, string>>(new Map(), 50);
  const [typingTexts, setTypingTexts] = useThrottledState<AimSegments[]>([], 50);
  const [isTranslationComplete, setIsTranslationComplete] = useState(false);
  const [chunkSummaryInfoMap, setChunkSummaryInfoMap] = useThrottledState<Map<number, ChunkSummaryInfo>>(new Map(), 50);
  const [translationProgress, setTranslationProgress] = useState(0);
  const [isTranslating, setIsTranslating] = useState(false);
  const [totalSegments, setTotalSegments] = useState(0);

  // Refs
  const activeTranslationRequestIdRef = useRef<string | null>(null);
  const totalSegmentsRef = useRef(0);
  const translatingChunkRangesRef = useRef<Map<number, { startIndex: number; endIndex: number }>>(new Map());

  // 辅助函数：根据已翻译完成的条数计算进度
  const calculateProgress = useCallback((completedCount: number, total: number): number => {
    if (total <= 0) return 0;
    return Math.min(100, Math.round((completedCount / total) * 100));
  }, []);

  // 辅助函数：合并所有正在翻译的 chunk 范围到 translatingChunks
  const updateTranslatingChunksFromRanges = useCallback(() => {
    const ranges = translatingChunkRangesRef.current;
    setTranslatingChunks(() => {
      const next = new Set<number>();
      for (const range of ranges.values()) {
        for (let i = range.startIndex; i <= range.endIndex; i++) {
          next.add(i);
        }
      }
      return next;
    });
  }, [setTranslatingChunks]);

  // 清理翻译状态
  const clearTranslationState = useCallback(
    (markComplete: boolean = false) => {
      if (markComplete) {
        setIsTranslationComplete(true);
        onTranslationComplete?.();
      }
      setTranslatingChunks(() => new Set());
      setChunkSummaryInfoMap(() => new Map());
      // 注意：翻译完成时不要清空 typingTexts，保持翻译结果显示
      // 直到 ResourceSubtitlePlayer 从数据库加载新的翻译轨道后再清空
      // typingTexts 会在 startTranslation 开始新翻译时被清空
      setIsTranslating(false);
      setTranslationProgress(0);
      activeTranslationRequestIdRef.current = null;
    },
    [setTranslatingChunks, setChunkSummaryInfoMap, onTranslationComplete]
  );

  // 重置翻译状态（用于外部调用）
  const resetTranslation = useCallback(() => {
    setIsTranslationComplete(false);
    setTranslatedChunks(() => new Set());
    setChunkSummaries(() => new Map());
    setTypingTexts(() => []);
    setTranslatingChunks(() => new Set());
    setChunkSummaryInfoMap(() => new Map());
    setIsTranslating(false);
    setTranslationProgress(0);
    activeTranslationRequestIdRef.current = null;
    translatingChunkRangesRef.current.clear();
  }, [setTranslatedChunks, setChunkSummaries, setTypingTexts, setTranslatingChunks, setChunkSummaryInfoMap]);

  // 开始翻译
  const startTranslation = useCallback(
    (requestId: string) => {
      activeTranslationRequestIdRef.current = requestId;
      setIsTranslating(true);
      setTranslationProgress(0);
      // 重置翻译相关状态，确保新翻译在新轨道上展示
      setTypingTexts(() => []);
      setTranslatingChunks(() => new Set());
      setTranslatedChunks(() => new Set());
      setChunkSummaryInfoMap(() => new Map());
      const total = subtitleEntriesRef.current?.length || 0;
      setTotalSegments(total);
      totalSegmentsRef.current = total;
      translatingChunkRangesRef.current.clear();
    },
    [subtitleEntriesRef, setTypingTexts, setTranslatingChunks, setTranslatedChunks, setChunkSummaryInfoMap]
  );

  // 停止翻译
  const stopTranslation = useCallback(async () => {
    if (activeTranslationRequestIdRef.current) {
      try {
        await window.YUA.ai.cancelTranslate(activeTranslationRequestIdRef.current);
      } catch (error) {
        console.error('停止翻译失败:', error);
      }
    }
  }, []);

  // 处理翻译事件
  const handleTranslationEvent = useCallback(
    (event: TranslationEvent) => {
      const currentEntries = subtitleEntriesRef.current || [];

      if (event.type === 'connected') {
        setIsTranslating(true);
        setTranslationProgress(0);
        const total = currentEntries.length;
        setTotalSegments(total);
        totalSegmentsRef.current = total;
        translatingChunkRangesRef.current.clear();
      } else if (event.type === 'chunk-start' && event.data) {
        const { chunkIndex, startIndex, endIndex, prevSummary } = event.data;
        if (startIndex !== undefined && endIndex !== undefined) {
          translatingChunkRangesRef.current.set(chunkIndex, { startIndex, endIndex });
          updateTranslatingChunksFromRanges();
          setChunkSummaryInfoMap((prev) => {
            const next = new Map(prev);
            next.set(chunkIndex, {
              chunkIndex,
              summary: '',
              startIndex,
              endIndex,
              prevSummary: prevSummary || undefined
            });
            return next;
          });
        }
      } else if (event.type === 'summary' && event.data) {
        const { chunkIndex, summary, startIndex, endIndex } = event.data;
        if (summary && startIndex !== undefined && endIndex !== undefined) {
          setChunkSummaryInfoMap((prev) => {
            const next = new Map(prev);
            if (chunkIndex !== undefined && next.has(chunkIndex)) {
              const existing = next.get(chunkIndex)!;
              next.set(chunkIndex, { ...existing, summary });
            } else {
              for (const [idx, info] of next) {
                if (info.startIndex === startIndex && info.endIndex === endIndex) {
                  next.set(idx, { ...info, summary });
                  break;
                }
              }
            }
            return next;
          });
          setChunkSummaries((prev) => {
            const next = new Map(prev);
            for (let i = startIndex; i <= endIndex; i++) {
              next.set(i, summary);
            }
            return next;
          });
        }
      } else if (event.type === 'parsed' && event.data) {
        const data = Array.isArray(event.data) ? event.data : [event.data];
        data.forEach((item: any) => {
          if (item.index !== undefined && item.text !== undefined) {
            const segmentIndex = item.index;
            setTranslatedChunks((prev) => {
              const next = new Set(prev);
              next.add(segmentIndex);
              const total = totalSegmentsRef.current || currentEntries.length;
              setTranslationProgress(calculateProgress(next.size, total));
              return next;
            });
            setTypingTexts((prev) => {
              const next = [...prev];
              while (next.length <= segmentIndex) {
                const baseSegment = currentEntries[next.length] || currentEntries[currentEntries.length - 1];
                if (baseSegment) {
                  next.push({ ...baseSegment, text: '' });
                } else {
                  next.push({ st: '00:00:00,000', et: '00:00:00,000', text: '' });
                }
              }
              if (next[segmentIndex]) {
                next[segmentIndex] = { ...next[segmentIndex], text: item.text };
              } else {
                const baseSegment = currentEntries[segmentIndex];
                if (baseSegment) {
                  next[segmentIndex] = { ...baseSegment, text: item.text };
                }
              }
              return next;
            });
            if (item.summary && item.startIndex !== undefined && item.endIndex !== undefined) {
              setChunkSummaryInfoMap((prev) => {
                const next = new Map(prev);
                for (const [idx, info] of next) {
                  if (info.startIndex === item.startIndex && info.endIndex === item.endIndex) {
                    next.set(idx, { ...info, summary: item.summary });
                    break;
                  }
                }
                return next;
              });
              setChunkSummaries((prev) => {
                const next = new Map(prev);
                for (let i = item.startIndex; i <= item.endIndex; i++) {
                  next.set(i, item.summary);
                }
                return next;
              });
            }
          }
        });
      } else if (event.type === 'parseProgress' && event.data) {
        const data = Array.isArray(event.data) ? event.data : [event.data];
        data.forEach((item: any) => {
          if (item.index !== undefined && item.text !== undefined) {
            const segmentIndex = item.index;
            setTypingTexts((prev) => {
              const next = [...prev];
              while (next.length <= segmentIndex) {
                const baseSegment = currentEntries[next.length] || currentEntries[currentEntries.length - 1];
                if (baseSegment) {
                  next.push({ ...baseSegment, text: '' });
                } else {
                  next.push({ st: '00:00:00,000', et: '00:00:00,000', text: '' });
                }
              }
              if (next[segmentIndex]) {
                next[segmentIndex] = { ...next[segmentIndex], text: item.text };
              } else {
                const baseSegment = currentEntries[segmentIndex];
                if (baseSegment) {
                  next[segmentIndex] = { ...baseSegment, text: item.text };
                }
              }
              return next;
            });
            if (item.summary && item.startIndex !== undefined && item.endIndex !== undefined) {
              setChunkSummaryInfoMap((prev) => {
                const next = new Map(prev);
                for (const [idx, info] of next) {
                  if (info.startIndex === item.startIndex && info.endIndex === item.endIndex) {
                    next.set(idx, { ...info, summary: item.summary });
                    break;
                  }
                }
                return next;
              });
              setChunkSummaries((prev) => {
                const next = new Map(prev);
                for (let i = item.startIndex; i <= item.endIndex; i++) {
                  next.set(i, item.summary);
                }
                return next;
              });
            }
          }
        });
      } else if (event.type === 'chunk-complete' && event.data) {
        const { chunkIndex, startIndex, endIndex, segments } = event.data;
        if (segments && Array.isArray(segments)) {
          setTypingTexts((prev) => {
            const next = [...prev];
            while (next.length <= endIndex) {
              const baseSegment = currentEntries[next.length] || currentEntries[currentEntries.length - 1];
              if (baseSegment) {
                next.push({ ...baseSegment, text: '' });
              } else {
                next.push({ st: '00:00:00,000', et: '00:00:00,000', text: '' });
              }
            }
            segments.forEach((item: any) => {
              if (item.index !== undefined && item.text !== undefined) {
                const baseSegment = currentEntries[item.index];
                if (baseSegment) {
                  next[item.index] = { ...baseSegment, text: item.text };
                } else if (next[item.index]) {
                  next[item.index] = { ...next[item.index], text: item.text };
                }
              }
            });
            return next;
          });
          setTranslatedChunks((prev) => {
            const next = new Set(prev);
            for (let i = startIndex; i <= endIndex; i++) {
              next.add(i);
            }
            const total = totalSegmentsRef.current || currentEntries.length;
            setTranslationProgress(calculateProgress(next.size, total));
            return next;
          });

          // 调用 chunk 完成回调，用于保存字幕
          if (onChunkComplete) {
            onChunkComplete({
              chunkIndex,
              startIndex,
              endIndex,
              segments: segments.filter((item: any) => item.index !== undefined && item.text !== undefined)
            });
          }
        }
        translatingChunkRangesRef.current.delete(chunkIndex);
        updateTranslatingChunksFromRanges();
        setChunkSummaryInfoMap((prev) => {
          const next = new Map(prev);
          next.delete(chunkIndex);
          return next;
        });
      } else if (event.type === 'completed' || event.type === 'done') {
        translatingChunkRangesRef.current.clear();
        clearTranslationState(true);
        // 翻译完成时也调用回调（如果需要保存最终结果）
        if (onTranslationComplete) {
          onTranslationComplete();
        }
      } else if (event.type === 'error') {
        translatingChunkRangesRef.current.clear();
        clearTranslationState(false);
      }
    },
    [
      subtitleEntriesRef,
      calculateProgress,
      updateTranslatingChunksFromRanges,
      clearTranslationState,
      setTranslatedChunks,
      setTypingTexts,
      setChunkSummaryInfoMap,
      setChunkSummaries,
      onChunkComplete,
      onTranslationComplete
    ]
  );

  // 检查是否有正在进行的翻译任务（恢复状态）
  useEffect(() => {
    let mounted = true;
    const checkActiveTranslation = async (): Promise<void> => {
      if (!resourceId) return;
      try {
        const tasks = await window.YUA.ai.getTranslationTasks();
        if (!mounted) return;

        const activeTask = tasks.find((task: any) => task.metadata?.resourceId === resourceId);

        if (activeTask) {
          console.log('Found active translation task:', activeTask);
          activeTranslationRequestIdRef.current = activeTask.requestId;
          setIsTranslating(true);

          try {
            const segments = await window.YUA.ai.getTranslatedSegments(activeTask.requestId);
            const currentEntries = subtitleEntriesRef.current || [];

            if (mounted && segments && segments.length > 0) {
              const newTranslatedChunks = new Set<number>();
              const newChunkSummaries = new Map<number, string>();
              const newTypingTexts: AimSegments[] = currentEntries.map((seg) => ({ ...seg, text: '' }));

              segments.forEach((item: any) => {
                if (item.index !== undefined) {
                  newTranslatedChunks.add(item.index);
                  if (item.text && newTypingTexts[item.index]) {
                    newTypingTexts[item.index] = { ...newTypingTexts[item.index], text: item.text };
                  }
                }
                if (item.summary && item.startIndex !== undefined && item.endIndex !== undefined) {
                  for (let i = item.startIndex; i <= item.endIndex; i++) {
                    newChunkSummaries.set(i, item.summary);
                  }
                  setChunkSummaryInfoMap((prev) => {
                    const next = new Map(prev);
                    let foundChunkIndex = -1;
                    for (const [chunkIdx, info] of next) {
                      if (info.startIndex === item.startIndex && info.endIndex === item.endIndex) {
                        foundChunkIndex = chunkIdx;
                        break;
                      }
                    }
                    if (foundChunkIndex >= 0) {
                      next.set(foundChunkIndex, { ...next.get(foundChunkIndex)!, summary: item.summary });
                    } else {
                      const newChunkIndex = next.size;
                      next.set(newChunkIndex, {
                        chunkIndex: newChunkIndex,
                        summary: item.summary,
                        startIndex: item.startIndex,
                        endIndex: item.endIndex
                      });
                    }
                    return next;
                  });
                }
              });

              setTranslatedChunks(() => newTranslatedChunks);
              setChunkSummaries(() => newChunkSummaries);
              setTypingTexts(() => newTypingTexts);
            }
          } catch (err) {
            console.error('Failed to restore translated segments:', err);
          }
        }
      } catch (error) {
        console.error('Failed to check active translation tasks:', error);
      }
    };

    checkActiveTranslation();

    return () => {
      mounted = false;
    };
  }, [resourceId, subtitleEntriesRef, setTranslatedChunks, setChunkSummaries, setTypingTexts, setChunkSummaryInfoMap]);

  // 监听翻译事件
  useEffect(() => {
    const handleRendererMessage = (_event: any, message: { type: string; data?: any }): void => {
      if (message.type !== 'subtitle:translate') return;

      const event = message.data;
      if (!event) return;

      if (!activeTranslationRequestIdRef.current || event.requestId !== activeTranslationRequestIdRef.current) {
        return;
      }

      handleTranslationEvent(event);
    };

    window.ipcRenderer.on('renderer-message', handleRendererMessage);

    return () => {
      window.ipcRenderer.off('renderer-message', handleRendererMessage);
    };
  }, [handleTranslationEvent]);

  // 清空临时翻译轨道（在新轨道加载成功后调用）
  const clearTypingTexts = useCallback(() => {
    setTypingTexts(() => []);
  }, [setTypingTexts]);

  return {
    translatingChunks,
    translatedChunks,
    typingTexts,
    chunkSummaryInfoMap,
    translationProgress,
    isTranslating,
    isTranslationComplete,
    startTranslation,
    stopTranslation,
    resetTranslation,
    clearTypingTexts,
    activeRequestId: activeTranslationRequestIdRef.current
  };
}
