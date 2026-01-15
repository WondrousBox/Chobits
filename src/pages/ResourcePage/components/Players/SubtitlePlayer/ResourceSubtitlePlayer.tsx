import { AimSegments, parser, tools } from '@aim-packages/subtitle';
import { debounce } from 'lodash-es';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ResourceItem } from '../../../types';
import { SubtitleTranslator } from '../SubtitleTranslator';
import { type ChunkSummaryInfo, SubtitlePlayer } from './SubtitlePlayer';

/**
 * 防抖状态 Hook - 用于高频更新的状态
 */
function useDebouncedState<T>(initialValue: T, delay: number = 100): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(initialValue);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const setDebouncedState = useCallback(
    (value: T | ((prev: T) => T)) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setState(value);
      }, delay);
    },
    [delay]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return [state, setDebouncedState];
}

/**
 * 批量状态更新 Hook - 合并多次状态更新，减少渲染次数
 */
function useBatchedState<T>(initialValue: T): [T, (updater: (prev: T) => T) => void] {
  const [state, setState] = useState<T>(initialValue);
  const pendingRef = useRef<((prev: T) => T) | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const setBatchedState = useCallback((updater: (prev: T) => T) => {
    pendingRef.current = updater;
    if (!timeoutRef.current) {
      timeoutRef.current = setTimeout(() => {
        if (pendingRef.current) {
          setState(pendingRef.current);
          pendingRef.current = null;
        }
        timeoutRef.current = null;
      }, 16);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return [state, setBatchedState];
}

// 将 AimSegments 转换为 ISegment 格式
// ISegment = [string, string, string, string | undefined]
// 第一个是开始时间，第二个是结束时间，第三个是文本，第四个是可选的
function convertToISegment(segment: AimSegments): [string, string, string, string | undefined] {
  return [segment.st, segment.et, segment.text, undefined];
}

type SubtitleFormat = 'srt' | 'vtt' | 'ass';

interface ResourceSubtitlePlayerProps {
  resource: ResourceItem;
  currentTime?: number; // 当前播放时间（秒）
  onSeek?: (time: number) => void; // 跳转到指定时间的回调
}

/**
 * 带资源读取/保存和翻译能力的字幕播放器容器
 * - 负责与主进程交互、AI 翻译等业务逻辑
 * - 将主轨与第二轨道（翻译）作为数据传给通用的 SubtitlePlayer，仅负责展示
 */
export const ResourceSubtitlePlayer: React.FC<ResourceSubtitlePlayerProps> = ({ resource, currentTime = 0, onSeek }) => {
  const [subtitleEntries, setSubtitleEntries] = useState<AimSegments[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [subtitleFormat, setSubtitleFormat] = useState<SubtitleFormat>('srt');

  // 保持 subtitleEntries 的引用始终是最新的
  useEffect(() => {
    subtitleEntriesRef.current = subtitleEntries;
  }, [subtitleEntries]);

  // 翻译状态管理
  const [translatingChunks, setTranslatingChunks] = useBatchedState<Set<number>>(new Set()); // 正在翻译的片段索引（批量更新）
  const [translatedChunks, setTranslatedChunks] = useBatchedState<Set<number>>(new Set()); // 已翻译完成的片段索引（批量更新）
  const [chunkSummaries, setChunkSummaries] = useDebouncedState<Map<number, string>>(new Map(), 50); // 片段索引 -> summary（防抖）
  const [typingTexts, setTypingTexts] = useDebouncedState<AimSegments[]>([], 50); // 第二轨道字幕（与主轨道 segments 一一对应，防抖）
  const [isTranslationComplete, setIsTranslationComplete] = useState(false);
  // 多 chunk summary 信息：Map<chunkIndex, ChunkSummaryInfo>
  const [chunkSummaryInfoMap, setChunkSummaryInfoMap] = useDebouncedState<Map<number, ChunkSummaryInfo>>(new Map(), 50);
  const [translationProgress, setTranslationProgress] = useState(0); // 翻译进度 0-100
  const [isTranslating, setIsTranslating] = useState(false); // 是否正在翻译
  const [totalSegments, setTotalSegments] = useState(0); // 总片段数（用于计算进度）
  const activeTranslationRequestIdRef = useRef<string | null>(null);
  const subtitleEntriesRef = useRef<AimSegments[]>([]);
  const totalSegmentsRef = useRef(0); // 总片段数 ref（避免闭包问题）
  // 追踪正在翻译的 chunk 范围：Map<chunkIndex, {startIndex, endIndex}>
  const translatingChunkRangesRef = useRef<Map<number, { startIndex: number; endIndex: number }>>(new Map());

  // 防抖保存函数（业务逻辑，负责写回资源）
  const debouncedSave = useMemo(
    () =>
      debounce(async (resourceId: string, segments: AimSegments[], format: SubtitleFormat) => {
        if (!resourceId) return;

        try {
          // 过滤掉已删除的片段
          const validSegments = segments.filter((seg) => !seg.delete);
          // 转换为 ISegment 格式
          const iSegments = validSegments.map(convertToISegment);

          // 根据格式选择不同的输出方法
          let content: string;
          if (format === 'vtt' && 'outputVtt' in tools && typeof tools.outputVtt === 'function') {
            content = tools.outputVtt({ segments1: iSegments });
          } else if (format === 'ass' && 'outputAss' in tools && typeof tools.outputAss === 'function') {
            content = tools.outputAss({ segments1: iSegments });
          } else {
            // 默认使用 SRT 格式输出
            content = tools.outputSrt({ segments1: iSegments });
          }

          // 通过资源更新接口保存，主进程会处理文件写入
          const result = await window.YUA.resource['resource:update']({
            id: resourceId,
            patch: { subtitleContent: content }
          });
          if (result.success) {
            console.log(`[auto-save] 字幕已保存 (${format})`);
          } else {
            console.error('[auto-save] 保存失败');
          }
        } catch (error) {
          console.error('[auto-save] 保存字幕时出错:', error);
        }
      }, 1000),
    []
  );

  // 防抖保存函数包装器（适配 SubtitleTranslator 组件的接口）
  const saveWrapper = useCallback(
    (resourceId: string, segments: AimSegments[]) => {
      debouncedSave(resourceId, segments, subtitleFormat);
    },
    [debouncedSave, subtitleFormat]
  );

  // 切换资源或卸载组件时，确保待保存的更改被立即保存
  useEffect(() => {
    return () => {
      debouncedSave.flush();
    };
  }, [resource.id, debouncedSave]);

  // 加载字幕文件内容（支持 srt、vtt、ass 格式）
  useEffect(() => {
    const data = resource;

    if (!data) {
      setTimeout(() => {
        setIsLoading(false);
        setSubtitleEntries([]);
      }, 0);
      return;
    }

    // 通过主进程读取文件内容
    if (data.filePath) {
      const lower = data.filePath.toLowerCase();
      let format: SubtitleFormat | null = null;

      // 判断文件格式
      if (lower.endsWith('.srt')) {
        format = 'srt';
      } else if (lower.endsWith('.vtt')) {
        format = 'vtt';
      } else if (lower.endsWith('.ass') || lower.endsWith('.ssa')) {
        format = 'ass';
      }

      if (format) {
        setIsLoading(true);
        setSubtitleFormat(format);
        // 取消之前的保存操作
        debouncedSave.cancel();
        window.YUA.file['file:readContent'](data.filePath, 20000)
          .then(async (result: any) => {
            if (result.success) {
              try {
                const res = await parser.parseSubtitle(result.content || '');

                const segments: AimSegments[] = res?.segments || [];
                setSubtitleEntries(segments);
              } catch (error) {
                console.error(`[SubtitlePlayer] 解析${format.toUpperCase()}文件失败:`, error);
                setSubtitleEntries([]);
              }
            } else {
              setSubtitleEntries([]);
            }
          })
          .catch((error) => {
            console.error('[SubtitlePlayer] 读取文件失败:', error);
            setSubtitleEntries([]);
          })
          .finally(() => {
            setIsLoading(false);
          });
        return;
      }
    }

    setIsLoading(false);
    setTimeout(() => {
      setSubtitleEntries([]);
    }, 0);
  }, [resource, debouncedSave]);

  // 通用组件的变更回调：同步到本地 state 并触发保存
  const handleSegmentsChange = useCallback(
    (updated: AimSegments[]): void => {
      setSubtitleEntries(updated);
      if (resource.id && !isLoading) {
        debouncedSave(resource.id, updated, subtitleFormat);
      }
    },
    [resource.id, debouncedSave, isLoading, subtitleFormat]
  );

  // 保持 subtitleEntries 的引用始终是最新的
  useEffect(() => {
    subtitleEntriesRef.current = subtitleEntries;
  }, [subtitleEntries]);

  // 检查是否有正在进行的翻译任务
  useEffect(() => {
    let mounted = true;
    const checkActiveTranslation = async () => {
      if (!resource.id) return;
      try {
        const tasks = await window.YUA.ai.getTranslationTasks();
        if (!mounted) return;

        const activeTask = tasks.find((task: any) => task.metadata?.resourceId === resource.id);

        if (activeTask) {
          console.log('Found active translation task:', activeTask);
          activeTranslationRequestIdRef.current = activeTask.requestId;
          setIsTranslating(true);

          // 获取已翻译的片段并恢复状态
          try {
            const segments = await window.YUA.ai.getTranslatedSegments(activeTask.requestId);

            console.log(segments, mounted);

            if (mounted && segments && segments.length > 0) {
              const newTranslatedChunks = new Set<number>();
              const newChunkSummaries = new Map<number, string>();
              // 初始化数组，长度与 subtitleEntries 一致
              const currentEntries = subtitleEntriesRef.current;
              const newTypingTexts: AimSegments[] = currentEntries.map((seg) => ({ ...seg, text: '' }));

              segments.forEach((item: any) => {
                if (item.index !== undefined) {
                  newTranslatedChunks.add(item.index);
                  if (item.text && newTypingTexts[item.index]) {
                    // 保持原有的时间信息，只更新文本
                    newTypingTexts[item.index] = { ...newTypingTexts[item.index], text: item.text };
                  }
                }
                if (item.summary && item.startIndex !== undefined && item.endIndex !== undefined) {
                  for (let i = item.startIndex; i <= item.endIndex; i++) {
                    newChunkSummaries.set(i, item.summary);
                  }
                  // 恢复 chunk summary info（假设 chunkIndex 未知，使用 startIndex 作为 key）
                  setChunkSummaryInfoMap((prev) => {
                    const next = new Map(prev);
                    // 查找是否已有该范围的 chunk
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
                      // 创建新的 chunk info
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
  }, [resource.id]);

  // 监听翻译事件
  useEffect(() => {
    // 清理翻译状态的辅助函数
    const clearTranslationState = (markComplete: boolean = false) => {
      if (markComplete) {
        setIsTranslationComplete(true);
      }
      setTranslatingChunks(() => new Set());
      // 保留打字效果，不清除
      setChunkSummaryInfoMap(() => new Map());
      setIsTranslating(false);
      setTranslationProgress(0);
      activeTranslationRequestIdRef.current = null;
    };

    // 辅助函数：根据已翻译完成的条数计算进度
    const calculateProgress = (completedCount: number, total: number): number => {
      if (total <= 0) return 0;
      return Math.min(100, Math.round((completedCount / total) * 100));
    };

    // 辅助函数：合并所有正在翻译的 chunk 范围到 translatingChunks
    const updateTranslatingChunksFromRanges = () => {
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
    };

    const handleTranslationEvent = (event: { type: string; data?: any }) => {
      if (event.type === 'connected') {
        setIsTranslating(true);
        setTranslationProgress(0);
        // 初始化总片段数
        const total = subtitleEntriesRef.current.length;
        setTotalSegments(total);
        totalSegmentsRef.current = total;
        // 清空 chunk 范围追踪
        translatingChunkRangesRef.current.clear();
      } else if (event.type === 'progress' && event.data) {
        // 不再从 percentage 更新进度，改为基于已完成条数
        // 如果有上一段的总结，更新对应 chunk 的 prevSummary
        // 注意：progress 事件通常在 chunk-start 之后，此时 chunk 已注册
      } else if (event.type === 'chunk-start' && event.data) {
        // 分块开始时，记录 chunk 范围并创建 chunk summary info
        const { chunkIndex, startIndex, endIndex, prevSummary } = event.data;
        if (startIndex !== undefined && endIndex !== undefined) {
          translatingChunkRangesRef.current.set(chunkIndex, { startIndex, endIndex });
          updateTranslatingChunksFromRanges();
          // 创建新的 chunk summary info（初始时 summary 为空，等待 summary 事件更新）
          setChunkSummaryInfoMap((prev) => {
            const next = new Map(prev);
            next.set(chunkIndex, {
              chunkIndex,
              summary: '', // 初始为空，等待 summary 事件
              startIndex,
              endIndex,
              prevSummary: prevSummary || undefined
            });
            return next;
          });
        }
      } else if (event.type === 'summary' && event.data) {
        // 保存总结信息，更新对应 chunk 的 summary
        const { chunkIndex, summary, startIndex, endIndex } = event.data;
        if (summary && startIndex !== undefined && endIndex !== undefined) {
          // 更新 chunkSummaryInfoMap 中对应 chunk 的 summary
          setChunkSummaryInfoMap((prev) => {
            const next = new Map(prev);
            // 根据 chunkIndex 或 startIndex/endIndex 查找对应的 chunk
            if (chunkIndex !== undefined && next.has(chunkIndex)) {
              const existing = next.get(chunkIndex)!;
              next.set(chunkIndex, { ...existing, summary });
            } else {
              // 根据 startIndex/endIndex 查找
              for (const [idx, info] of next) {
                if (info.startIndex === startIndex && info.endIndex === endIndex) {
                  next.set(idx, { ...info, summary });
                  break;
                }
              }
            }
            return next;
          });
          // 同时更新 chunkSummaries（用于其他地方可能的引用）
          setChunkSummaries((prev) => {
            const next = new Map(prev);
            for (let i = startIndex; i <= endIndex; i++) {
              next.set(i, summary);
            }
            return next;
          });
        }
      } else if (event.type === 'parsed' && event.data) {
        // 解析完成的数据，更新翻译状态（不修改原始字幕片段）
        const data = Array.isArray(event.data) ? event.data : [event.data];
        // 追踪每个 chunk 的完成情况
        const completedSegmentsByChunk = new Map<number, Set<number>>();
        data.forEach((item: any) => {
          if (item.index !== undefined && item.text !== undefined) {
            const segmentIndex = item.index;
            // 查找该 segment 属于哪个 chunk
            for (const [chunkIndex, range] of translatingChunkRangesRef.current.entries()) {
              if (segmentIndex >= range.startIndex && segmentIndex <= range.endIndex) {
                if (!completedSegmentsByChunk.has(chunkIndex)) {
                  completedSegmentsByChunk.set(chunkIndex, new Set());
                }
                completedSegmentsByChunk.get(chunkIndex)!.add(segmentIndex);
                break;
              }
            }
            // 标记为已翻译
            setTranslatedChunks((prev) => {
              const next = new Set(prev);
              next.add(segmentIndex);
              // 基于已完成条数更新进度
              const total = totalSegmentsRef.current || subtitleEntriesRef.current.length;
              setTranslationProgress(calculateProgress(next.size, total));
              return next;
            });
            // 更新打字效果
            setTypingTexts((prev) => {
              const currentEntries = subtitleEntriesRef.current;
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
            // 如果提供了 startIndex 和 endIndex，更新 summary
            if (item.summary && item.startIndex !== undefined && item.endIndex !== undefined) {
              // 更新 chunkSummaryInfoMap
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
        // 检查是否有 chunk 完成（该 chunk 范围内所有 segment 都已翻译）
        // 注意：这里不能仅依赖当前批次的数据，需要检查 translatedChunks 状态
        // 由于状态更新是异步的，我们延迟检查
        setTimeout(() => {
          const completedChunkIndices: number[] = [];
          for (const [chunkIndex, range] of translatingChunkRangesRef.current.entries()) {
            // 检查该 chunk 范围内所有 segment 是否都在 data 中出现过
            let allCompleted = true;
            for (let i = range.startIndex; i <= range.endIndex; i++) {
              const found = data.some((item: any) => item.index === i);
              if (!found) {
                // 该 segment 可能在之前的事件中已完成，但我们无法精确判断
                // 保守起见，不删除
                allCompleted = false;
                break;
              }
            }
            if (allCompleted) {
              translatingChunkRangesRef.current.delete(chunkIndex);
              completedChunkIndices.push(chunkIndex);
            }
          }
          // 更新 translatingChunks
          updateTranslatingChunksFromRanges();
          // 从 chunkSummaryInfoMap 中移除已完成的 chunk
          if (completedChunkIndices.length > 0) {
            setChunkSummaryInfoMap((prev) => {
              const next = new Map(prev);
              for (const idx of completedChunkIndices) {
                next.delete(idx);
              }
              return next;
            });
          }
        }, 0);
      } else if (event.type === 'parseProgress' && event.data) {
        // 实时翻译进度，显示打字效果（不更新 translatingChunks，因为已在 chunk-start 中处理）
        const data = Array.isArray(event.data) ? event.data : [event.data];
        data.forEach((item: any) => {
          if (item.index !== undefined && item.text !== undefined) {
            const segmentIndex = item.index;
            // 更新打字效果
            setTypingTexts((prev) => {
              // 确保数组长度与 subtitleEntries 一致
              const currentEntries = subtitleEntriesRef.current;
              const next = [...prev];
              while (next.length <= segmentIndex) {
                // 如果索引超出范围，用对应的 subtitleEntry 初始化
                const baseSegment = currentEntries[next.length] || currentEntries[currentEntries.length - 1];
                if (baseSegment) {
                  next.push({ ...baseSegment, text: '' });
                } else {
                  next.push({ st: '00:00:00,000', et: '00:00:00,000', text: '' });
                }
              }
              // 更新指定索引的文本，保持原有的时间信息
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
            // 更新 summary（如果有）
            if (item.summary && item.startIndex !== undefined && item.endIndex !== undefined) {
              // 更新 chunkSummaryInfoMap
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
      } else if (event.type === 'completed' && event.data?.translations) {
        // 翻译完成，清除所有翻译中状态和 chunk 范围追踪
        translatingChunkRangesRef.current.clear();
        clearTranslationState(true);
      } else if (event.type === 'done') {
        // 翻译完成，清除所有翻译中状态和 chunk 范围追踪
        translatingChunkRangesRef.current.clear();
        clearTranslationState(true);
      } else if (event.type === 'error') {
        // 翻译出错，清除翻译中状态和 chunk 范围追踪
        translatingChunkRangesRef.current.clear();
        clearTranslationState(false);
      }
    };

    const handleRendererMessage = (_event: any, message: { type: string; data?: any }): void => {
      // 只处理翻译相关的事件
      if (message.type !== 'subtitle:translate') return;

      const event = message.data;
      if (!event) return;

      // 只处理当前活跃的翻译请求的事件
      if (!activeTranslationRequestIdRef.current || event.requestId !== activeTranslationRequestIdRef.current) {
        return;
      }

      // 处理翻译事件
      handleTranslationEvent(event);
    };

    // 监听 renderer-message 事件
    window.ipcRenderer.on('renderer-message', handleRendererMessage);

    return () => {
      window.ipcRenderer.off('renderer-message', handleRendererMessage);
    };
  }, [resource.id]);

  // 处理翻译完成回调（用于普通翻译模式）
  const handleTranslateComplete = useCallback((updatedSegments: AimSegments[]) => {
    setSubtitleEntries(updatedSegments);
    // 重置翻译状态
    setIsTranslationComplete(false);
    setTranslatedChunks(() => new Set());
    setChunkSummaries(() => new Map());
    setTypingTexts(() => []);
    setTranslatingChunks(() => new Set());
    setChunkSummaryInfoMap(() => new Map());
    setIsTranslating(false);
    setTranslationProgress(0);
    activeTranslationRequestIdRef.current = null;
  }, []);

  // 停止翻译
  const handleStopTranslation = useCallback(async () => {
    if (activeTranslationRequestIdRef.current) {
      try {
        await window.YUA.ai.cancelTranslate(activeTranslationRequestIdRef.current);
      } catch (error) {
        console.error('停止翻译失败:', error);
      }
    }
  }, []);

  // 处理翻译开始
  const handleTranslationStart = useCallback((requestId: string) => {
    activeTranslationRequestIdRef.current = requestId;
    setIsTranslating(true);
    setTranslationProgress(0);
    const total = subtitleEntriesRef.current.length;
    setTotalSegments(total);
    totalSegmentsRef.current = total;
    // 清空 chunk 范围追踪
    translatingChunkRangesRef.current.clear();
  }, []);

  return (
    <div className="flex h-full w-full flex-col text-muted-foreground">
      {/* 翻译按钮和配置（业务组件） */}
      <SubtitleTranslator
        subtitleEntries={subtitleEntries}
        onTranslateComplete={handleTranslateComplete}
        resourceId={resource.id}
        isLoading={isLoading}
        debouncedSave={saveWrapper}
        isTranslating={isTranslating}
        translationProgress={translationProgress}
        onStopTranslation={handleStopTranslation}
        onTranslationStart={handleTranslationStart}
      />

      {/* 通用字幕展示组件：支持多轨道（主轨 + 附加轨道） */}
      <SubtitlePlayer
        tracks={useMemo(() => {
          const tracksArray: AimSegments[][] = [subtitleEntries];
          if (typingTexts.length > 0) {
            tracksArray.push(typingTexts);
          }
          return tracksArray;
        }, [subtitleEntries, typingTexts])}
        currentTime={currentTime}
        onSeek={onSeek}
        onSegmentsChange={handleSegmentsChange}
        disabledIndices={translatingChunks}
        highlightIndices={translatingChunks}
        summaries={chunkSummaryInfoMap}
      />
    </div>
  );
};
