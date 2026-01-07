import { AimSegments, parser, tools } from '@aim-packages/subtitle';
import { debounce } from 'lodash-es';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ResourceItem } from '../../../types';
import { SubtitleTranslator } from '../SubtitleTranslator';
import { SubtitlePlayer } from './SubtitlePlayer';

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

  // 翻译状态管理
  const [translatingChunks, setTranslatingChunks] = useState<Set<number>>(new Set()); // 正在翻译的片段索引
  const [translatedChunks, setTranslatedChunks] = useState<Set<number>>(new Set()); // 已翻译完成的片段索引（目前未在 UI 中使用，预留）
  const [chunkSummaries, setChunkSummaries] = useState<Map<number, string>>(new Map()); // 片段索引 -> summary
  const [typingTexts, setTypingTexts] = useState<Map<number, string>>(new Map()); // 片段索引 -> 正在打字的文本（第二轨道实时内容）
  const [isTranslationComplete, setIsTranslationComplete] = useState(false);
  const [summaries, setSummaries] = useState<{ prev?: string; current?: string }>({}); // 总结信息：上一段 & 当前段
  const [translationProgress, setTranslationProgress] = useState(0); // 翻译进度 0-100
  const [isTranslating, setIsTranslating] = useState(false); // 是否正在翻译
  const activeTranslationRequestIdRef = useRef<string | null>(null);

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
                  // 设置当前正在翻译的总结为最后一个找到的总结
                  setSummaries((prev) => ({ ...prev, current: item.summary }));
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
      setSummaries({});
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

        // 如果有上一段的总结，单独记录为 summaries.prev，供 UI 展示
        if (event.data.prevSummary) {
          setSummaries((prev) => ({ ...prev, prev: event.data.prevSummary }));
        }

        // 检测是否开始翻译某个片段
        const message = event.data.message || '';
        if (message.includes('正在翻译片段')) {
          // 如果提供了 startIndex 和 endIndex，标记为正在翻译
          if (event.data.startIndex !== undefined && event.data.endIndex !== undefined) {
            // 只高亮当前正在翻译的片段范围，清除旧的高亮
            setTranslatingChunks(() => {
              const next = new Set<number>();
              for (let i = event.data.startIndex; i <= event.data.endIndex; i++) {
                next.add(i);
              }
              return next;
            });
          }
        }
      } else if (event.type === 'chunk-start' && event.data) {
        // 分块开始时，如果有上一段总结，也同步记录
        if (event.data.prevSummary) {
          setSummaries((prev) => ({ ...prev, prev: event.data.prevSummary }));
        }
      } else if (event.type === 'summary' && event.data) {
        // 保存总结信息，根据 startIndex 和 endIndex 将 summary 应用到所有相关片段
        const { summary, startIndex, endIndex } = event.data;
        if (summary && startIndex !== undefined && endIndex !== undefined) {
          // 更新当前总结（显示最新的总结）
          setSummaries((prev) => ({ ...prev, current: summary }));
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
              setSummaries((prev) => ({ ...prev, current: item.summary }));
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
              // 同样这里也只保留当前 chunk 的翻译范围
              setTranslatingChunks(() => {
                const next = new Set<number>();
                for (let i = item.startIndex; i <= item.endIndex; i++) {
                  next.add(i);
                }
                return next;
              });
              // 更新 summary
              if (item.summary) {
                // 更新当前总结（显示最新的总结）
                setSummaries((prev) => ({ ...prev, current: item.summary }));
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
  }, [resource.id]);

  // 处理翻译完成回调（用于普通翻译模式）
  const handleTranslateComplete = useCallback((updatedSegments: AimSegments[]) => {
    setSubtitleEntries(updatedSegments);
    // 重置翻译状态
    setIsTranslationComplete(false);
    setTranslatedChunks(new Set());
    setChunkSummaries(new Map());
    setTypingTexts(new Map());
    setTranslatingChunks(new Set());
    setSummaries({});
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
  }, []);

  return (
    <div className="flex h-full w-full flex-col text-muted-foreground">
      {/* 翻译按钮和配置（业务组件） */}
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

      {/* 通用字幕展示组件：主轨 + 第二轨道（翻译） */}
      <SubtitlePlayer
        segments={subtitleEntries}
        currentTime={currentTime}
        onSeek={onSeek}
        onSegmentsChange={handleSegmentsChange}
        disabledIndices={translatingChunks}
        highlightIndices={translatingChunks}
        track2Texts={typingTexts}
        summaries={summaries}
        autoScrollToSummary={true}
      />
    </div>
  );
};
