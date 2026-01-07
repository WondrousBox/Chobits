import { AimSegments, parser, tools, utils } from '@aim-packages/subtitle';
import { debounce } from 'lodash-es';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';

import type { ResourceItem } from '../../../types';
import { SubtitleTranslator } from '../SubtitleTranslator';
import { SubtitleRow } from './SubtitleRow';

interface SubtitlePlayerProps {
  resource: ResourceItem;
  currentTime?: number; // 当前播放时间（秒）
  onSeek?: (time: number) => void; // 跳转到指定时间的回调
}

// 将 AimSegments 转换为 ISegment 格式
// ISegment = [string, string, string, string | undefined]
// 第一个是开始时间，第二个是结束时间，第三个是文本，第四个是可选的
function convertToISegment(segment: AimSegments): [string, string, string, string | undefined] {
  return [segment.st, segment.et, segment.text, undefined];
}

type SubtitleFormat = 'srt' | 'vtt' | 'ass';

export const SubtitlePlayer = ({ resource, currentTime = 0, onSeek }: SubtitlePlayerProps): React.ReactNode => {
  const [subtitleEntries, setSubtitleEntries] = useState<AimSegments[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [subtitleFormat, setSubtitleFormat] = useState<SubtitleFormat>('srt');
  const activeRowRef = useRef<HTMLDivElement>(null);

  // 翻译状态管理
  const [translatingChunks, setTranslatingChunks] = useState<Set<number>>(new Set()); // 正在翻译的片段索引
  const [translatedChunks, setTranslatedChunks] = useState<Set<number>>(new Set()); // 已翻译完成的片段索引
  const [chunkSummaries, setChunkSummaries] = useState<Map<number, string>>(new Map()); // 片段索引 -> summary
  const [typingTexts, setTypingTexts] = useState<Map<number, string>>(new Map()); // 片段索引 -> 正在打字的文本
  const [isTranslationComplete, setIsTranslationComplete] = useState(false);
  const [currentSummary, setCurrentSummary] = useState<string>(''); // 当前翻译的总结
  const [translationProgress, setTranslationProgress] = useState(0); // 翻译进度 0-100
  const [isTranslating, setIsTranslating] = useState(false); // 是否正在翻译
  const activeTranslationRequestIdRef = useRef<string | null>(null);

  // 防抖保存函数
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

  const handleTextChange = useCallback(
    (index: number, text: string): void => {
      setSubtitleEntries((prev) => {
        const updated = prev.map((item, i) => {
          if (i === index) {
            item.text = text;
          }
          return item;
        });
        // 触发防抖保存（仅在非加载状态下）
        if (resource.id && !isLoading) {
          debouncedSave(resource.id, updated, subtitleFormat);
        }
        return updated;
      });
    },
    [resource.id, debouncedSave, isLoading]
  );

  const handleMergePrev = useCallback(
    (index: number): void => {
      // 向前合并：将当前字幕与前一个字幕合并
      if (index > 0) {
        setSubtitleEntries((prev) => {
          // 使用 utils.mergeAimSegmentRange 合并字幕片段
          const merged = utils.mergeAimSegmentRange(prev, index - 1, index);
          // 触发防抖保存（仅在非加载状态下）
          if (resource.id && !isLoading) {
            debouncedSave(resource.id, merged, subtitleFormat);
          }
          return merged;
        });
      }
    },
    [resource.id, debouncedSave, isLoading]
  );

  const handleMergeNext = useCallback(
    (index: number): void => {
      // 向后合并：将当前字幕与后一个字幕合并
      setSubtitleEntries((prev) => {
        if (index < prev.length - 1) {
          // 使用 utils.mergeAimSegmentRange 合并字幕片段
          const merged = utils.mergeAimSegmentRange(prev, index, index + 1);
          // 触发防抖保存（仅在非加载状态下）
          if (resource.id && !isLoading) {
            debouncedSave(resource.id, merged, subtitleFormat);
          }
          return merged;
        }
        return prev;
      });
    },
    [resource.id, debouncedSave, isLoading]
  );

  // 根据当前时间找到对应的字幕索引
  const activeIndex = useMemo(() => {
    if (!currentTime || subtitleEntries.length === 0) return -1;

    for (let i = 0; i < subtitleEntries.length; i++) {
      const segment = subtitleEntries[i];
      if (segment.delete) continue;

      const startTime = utils.convertToSeconds(segment.st);
      const endTime = utils.convertToSeconds(segment.et);

      if (currentTime >= startTime && currentTime < endTime) {
        return i;
      }
    }

    return -1;
  }, [currentTime, subtitleEntries]);

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
              const newTypingTexts = new Map<number, string>();

              segments.forEach((item: any) => {
                if (item.index !== undefined) {
                  newTranslatedChunks.add(item.index);
                  if (item.text) {
                    newTypingTexts.set(item.index, item.text);
                  }
                }
                if (item.summary && item.startIndex !== undefined && item.endIndex !== undefined) {
                  for (let i = item.startIndex; i <= item.endIndex; i++) {
                    newChunkSummaries.set(i, item.summary);
                  }
                  // 设置当前总结为最后一个找到的总结
                  setCurrentSummary(item.summary);
                }
              });

              setTranslatedChunks(newTranslatedChunks);
              setChunkSummaries(newChunkSummaries);
              setTypingTexts(newTypingTexts);
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
      setTranslatingChunks(new Set());
      // 保留打字效果，不清除
      setCurrentSummary('');
      setIsTranslating(false);
      setTranslationProgress(0);
      activeTranslationRequestIdRef.current = null;
    };

    const handleTranslationEvent = (event: { type: string; data?: any }) => {
      if (event.type === 'connected') {
        setIsTranslating(true);
        setTranslationProgress(0);
      } else if (event.type === 'progress' && event.data) {
        // 更新进度
        if (event.data.percentage !== undefined) {
          setTranslationProgress(event.data.percentage);
        }

        // 检测是否开始翻译某个片段
        const message = event.data.message || '';
        if (message.includes('正在翻译片段')) {
          // 如果提供了 startIndex 和 endIndex，标记为正在翻译
          if (event.data.startIndex !== undefined && event.data.endIndex !== undefined) {
            setTranslatingChunks((prev) => {
              const next = new Set(prev);
              for (let i = event.data.startIndex; i <= event.data.endIndex; i++) {
                next.add(i);
              }
              return next;
            });
          }
        }
      } else if (event.type === 'chunk-start' && event.data) {
        console.log(event.data);
      } else if (event.type === 'summary' && event.data) {
        // 保存总结信息，根据 startIndex 和 endIndex 将 summary 应用到所有相关片段
        const { chunkIndex, summary, startIndex, endIndex } = event.data;
        if (summary && startIndex !== undefined && endIndex !== undefined) {
          // 更新当前总结（显示最新的总结）
          setCurrentSummary(summary);
          setChunkSummaries((prev) => {
            const next = new Map(prev);
            // 将 summary 应用到该 chunk 范围内的所有片段
            for (let i = startIndex; i <= endIndex; i++) {
              next.set(i, summary);
            }
            return next;
          });
        }
      } else if (event.type === 'parsed' && event.data) {
        // 解析完成的数据，更新翻译状态（不修改原始字幕片段）
        const data = Array.isArray(event.data) ? event.data : [event.data];
        data.forEach((item: any) => {
          if (item.index !== undefined && item.text !== undefined) {
            const segmentIndex = item.index;
            // 标记为已翻译
            setTranslatedChunks((prev) => {
              const next = new Set(prev);
              next.add(segmentIndex);
              return next;
            });
            // 保留打字效果，不清除
            // 如果提供了 startIndex 和 endIndex，更新 summary
            if (item.summary && item.startIndex !== undefined && item.endIndex !== undefined) {
              // 更新当前总结（显示最新的总结）
              setCurrentSummary(item.summary);
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
        // 实时翻译进度，显示打字效果
        const data = Array.isArray(event.data) ? event.data : [event.data];
        data.forEach((item: any) => {
          if (item.index !== undefined && item.text !== undefined) {
            const segmentIndex = item.index;
            // 更新打字效果
            setTypingTexts((prev) => {
              const next = new Map(prev);
              next.set(segmentIndex, item.text);
              return next;
            });
            // 如果这是新 chunk 的开始，标记为正在翻译
            if (item.startIndex !== undefined && item.endIndex !== undefined) {
              setTranslatingChunks((prev) => {
                const next = new Set(prev);
                // 标记整个范围
                for (let i = item.startIndex; i <= item.endIndex; i++) {
                  next.add(i);
                }
                return next;
              });
              // 更新 summary
              if (item.summary) {
                // 更新当前总结（显示最新的总结）
                setCurrentSummary(item.summary);
                setChunkSummaries((prev) => {
                  const next = new Map(prev);
                  for (let i = item.startIndex; i <= item.endIndex; i++) {
                    next.set(i, item.summary);
                  }
                  return next;
                });
              }
            }
          }
        });
      } else if (event.type === 'completed' && event.data?.translations) {
        // 翻译完成，清除所有翻译中状态
        clearTranslationState(true);
      } else if (event.type === 'done') {
        // 翻译完成，清除所有翻译中状态
        clearTranslationState(true);
      } else if (event.type === 'error') {
        // 翻译出错，清除翻译中状态
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
  }, [subtitleEntries, resource.id, isLoading, debouncedSave]);

  // 处理翻译完成回调（用于普通翻译模式）
  const handleTranslateComplete = useCallback((updatedSegments: AimSegments[]) => {
    setSubtitleEntries(updatedSegments);
    // 重置翻译状态
    setIsTranslationComplete(false);
    setTranslatedChunks(new Set());
    setChunkSummaries(new Map());
    setTypingTexts(new Map());
    setTranslatingChunks(new Set());
    setCurrentSummary('');
    setIsTranslating(false);
    setTranslationProgress(0);
    activeTranslationRequestIdRef.current = null;
  }, []);

  // 停止翻译
  const handleStopTranslation = useCallback(async () => {
    console.log(activeTranslationRequestIdRef.current);

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
  }, []);

  return (
    <div className="flex h-full w-full flex-col text-muted-foreground">
      {/* 翻译按钮和配置 */}
      <SubtitleTranslator
        subtitleEntries={subtitleEntries}
        onTranslateComplete={handleTranslateComplete}
        resourceId={resource.id}
        isLoading={isLoading}
        debouncedSave={debouncedSave}
        isTranslating={isTranslating}
        translationProgress={translationProgress}
        onStopTranslation={handleStopTranslation}
        onTranslationStart={handleTranslationStart}
      />

      {currentSummary && (
        <div className="px-4 py-2 border-b bg-blue-50/50 dark:bg-blue-950/20">
          <div className="text-xs text-muted-foreground italic border-l-2 border-blue-300 dark:border-blue-700 pl-2 py-1">
            <span className="ml-1">{currentSummary}</span>
          </div>
        </div>
      )}

      <ScrollArea className="h-full w-full">
        <div className="box-border h-full w-full select-text overflow-auto rounded border px-4 py-3 leading-relaxed shadow-inner">
          {subtitleEntries.map((entry, idx) => {
            const isTranslatingChunk = translatingChunks.has(idx);
            const disabled = isTranslatingChunk;
            // 只高亮当前正在翻译的片段
            const highlight = isTranslatingChunk;
            const appendText = typingTexts.get(idx);

            return (
              <SubtitleRow
                key={idx}
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
                appendText={appendText}
              />
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};
