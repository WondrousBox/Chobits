import { AimSegments, parser, tools, utils } from '@aim-packages/subtitle';
import { debounce } from 'lodash-es';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TbCrosshair, TbList, TbTimeline } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import type { ResourceItem } from '../../../types';
import { SubtitlePlayer } from './SubtitleListPlayer/SubtitlePlayer';
import { aimTracksToTimelineTracks, indicesToIds, parseSegmentId, SubtitleTimeline, TimelineSegment } from './SubtitleTimeline';
import { SubtitleTranslator } from './SubtitleTranslator';
import { TTSSynthesizer } from './TTSSynthesizer';
import { useSubtitleTranslation } from './useSubtitleTranslation';
import { TTSSynthesisItem, useTTSSynthesis } from './useTTSSynthesis';

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
  followCurrentTime?: boolean; // 是否跟随时间自动滚动
  audioPath?: string; // 音频文件路径（用于波形显示）
}

/**
 * 带资源读取和翻译能力的字幕播放器容器
 * - 翻译结果由主进程自动保存，渲染进程只负责展示
 * - 用户手动编辑字幕时，通过渲染进程保存
 */
export const ResourceSubtitlePlayer: React.FC<ResourceSubtitlePlayerProps> = ({ resource, currentTime = 0, onSeek, followCurrentTime = false, audioPath }) => {
  const [subtitleEntries, setSubtitleEntries] = useState<AimSegments[]>([]);
  const [translationTracks, setTranslationTracks] = useState<AimSegments[][]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [subtitleFormat, setSubtitleFormat] = useState<SubtitleFormat>('srt');
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list'); // 视图模式：列表或时间轴
  const [followTime, setFollowTime] = useState<boolean>(followCurrentTime);

  // 外部值变化时同步本地开关
  useEffect(() => {
    setFollowTime(followCurrentTime);
  }, [followCurrentTime]);

  // 保持 subtitleEntries 的引用始终是最新的
  const subtitleEntriesRef = useRef<AimSegments[]>([]);
  useEffect(() => {
    subtitleEntriesRef.current = subtitleEntries;
  }, [subtitleEntries]);

  // 防抖保存函数（用于用户手动编辑字幕时保存）
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

  // 用于清空临时翻译轨道的 ref（因为 clearTypingTexts 在 hook 调用后才可用）
  const clearTypingTextsRef = useRef<(() => void) | null>(null);

  // 用于递归调用的 ref
  const loadTranslationTracksRef = useRef<((retryCount?: number, expectedMinTracks?: number) => Promise<void>) | null>(null);

  // 加载翻译轨道的函数（可在翻译完成后重新调用）
  // 添加重试机制，因为主进程保存翻译数据是异步的，可能在 completed 事件发送后才完成
  const loadTranslationTracks = useCallback(
    async (retryCount = 0, expectedMinTracks?: number) => {
      if (!resource.id) return;
      const maxRetries = 5;
      const retryDelay = 500; // 500ms 重试间隔

      try {
        const translations = await window.YUA.ai.getResourceTranslations(resource.id);
        const translationTracksData: AimSegments[][] = [];
        const currentEntries = subtitleEntriesRef.current || [];

        for (const trans of translations) {
          if (trans.segments && trans.segments.length > 0) {
            // 将翻译片段转换为 AimSegments 格式
            const translationSegments: AimSegments[] = currentEntries.map((seg, index) => {
              const translatedText = trans.segments?.find((t) => t.index === index);
              return {
                ...seg,
                text: translatedText?.text || ''
              };
            });
            translationTracksData.push(translationSegments);
          }
        }

        // 如果有期望的最小轨道数，检查是否满足
        // 这用于处理翻译刚完成但数据库还没保存完的情况
        if (expectedMinTracks !== undefined && translationTracksData.length < expectedMinTracks && retryCount < maxRetries) {
          console.log(`[SubtitlePlayer] 翻译轨道数量不足 (${translationTracksData.length} < ${expectedMinTracks})，${retryDelay}ms 后重试 (${retryCount + 1}/${maxRetries})`);
          setTimeout(() => {
            loadTranslationTracksRef.current?.(retryCount + 1, expectedMinTracks);
          }, retryDelay);
          return;
        }

        setTranslationTracks(translationTracksData);
        console.log(`[SubtitlePlayer] 翻译轨道加载完成，共 ${translationTracksData.length} 个轨道`);

        // 新轨道加载成功后，清空临时翻译轨道（typingTexts）
        // 这样可以避免重复显示已保存的翻译
        if (expectedMinTracks !== undefined && translationTracksData.length >= expectedMinTracks) {
          clearTypingTextsRef.current?.();
        }
      } catch (error) {
        console.error('[SubtitlePlayer] 加载翻译资源失败:', error);
        // 出错时也尝试重试
        if (retryCount < maxRetries) {
          setTimeout(() => {
            loadTranslationTracksRef.current?.(retryCount + 1, expectedMinTracks);
          }, retryDelay);
        }
      }
    },
    [resource.id, subtitleEntriesRef]
  );

  // 更新递归调用的 ref
  useEffect(() => {
    loadTranslationTracksRef.current = loadTranslationTracks;
  }, [loadTranslationTracks]);

  // 翻译完成后的回调：期望轨道数比当前多 1
  const handleTranslationComplete = useCallback(() => {
    const expectedTracks = translationTracks.length + 1;
    // 延迟一小段时间再开始加载，给主进程保存数据的时间
    setTimeout(() => {
      loadTranslationTracks(0, expectedTracks);
    }, 300);
  }, [loadTranslationTracks, translationTracks.length]);

  // 使用翻译 Hook（翻译结果由主进程自动保存）
  const { translatingChunks, typingTexts, chunkSummaryInfoMap, translationProgress, isTranslating, startTranslation, stopTranslation, clearTypingTexts } = useSubtitleTranslation({
    resourceId: resource.id,
    subtitleEntriesRef,
    // 翻译完成后重新加载翻译轨道
    onTranslationComplete: handleTranslationComplete
  });

  // 使用TTS合成 Hook
  const { synthesizingIndices, synthesizedItems, synthesisProgress, isSynthesizing, startSynthesis, stopSynthesis, formatDuration } = useTTSSynthesis({
    resourceId: resource.id,
    subtitleEntriesRef
  });

  // 处理TTS合成开始
  const handleTTSSynthesisStart = useCallback((taskId: string) => {
    console.log('[SubtitlePlayer] TTS合成开始, taskId:', taskId);
  }, []);

  // 播放TTS音频
  const handlePlayTTS = useCallback((index: number, audioPath: string) => {
    console.log('[SubtitlePlayer] 播放TTS音频, index:', index, 'path:', audioPath);
    // TODO: 实现音频播放功能
    // 可以通过创建Audio对象播放，或者调用主进程的音频播放服务
    const audio = new Audio(`resource://${audioPath}`);
    audio.play().catch((error) => {
      console.error('[SubtitlePlayer] 播放TTS音频失败:', error);
    });
  }, []);

  // 将synthesizedItems转换为SubtitlePlayer需要的格式
  const ttsItemsMap = useMemo(() => {
    const map = new Map<number, { audioPath?: string; duration?: number; trimmedDuration?: number; status: 'pending' | 'synthesizing' | 'completed' | 'error'; error?: string }>();
    synthesizedItems.forEach((item, index) => {
      map.set(index, {
        audioPath: item.audioPath,
        duration: item.duration,
        trimmedDuration: item.trimmedDuration,
        status: item.status,
        error: item.error
      });
    });
    return map;
  }, [synthesizedItems]);

  // 更新 clearTypingTexts ref
  useEffect(() => {
    clearTypingTextsRef.current = clearTypingTexts;
  }, [clearTypingTexts]);

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
        setTranslationTracks([]);
      }, 0);
      return;
    }

    // 通过主进程读取文件内容
    if (data.filePath) {
      setIsLoading(true);
      // 取消之前的保存操作
      debouncedSave.cancel();
      window.YUA.file['file:readContent'](data.filePath)
        .then(async (result: any) => {
          if (result.success) {
            const format = parser.detectSubtitleType(result.content || '').replace('.', '') as SubtitleFormat;
            setSubtitleFormat(format);
            try {
              const res = await parser.parseSubtitle(result.content || '');

              const segments: AimSegments[] = res?.segments || [];
              setSubtitleEntries(segments);

              // 加载关联的翻译资源
              if (data.id) {
                try {
                  const translations = await window.YUA.ai.getResourceTranslations(data.id);
                  const translationTracksData: AimSegments[][] = [];

                  for (const trans of translations) {
                    if (trans.segments && trans.segments.length > 0) {
                      // 将翻译片段转换为 AimSegments 格式
                      const translationSegments: AimSegments[] = segments.map((seg, index) => {
                        const translatedText = trans.segments?.find((t) => t.index === index);
                        return {
                          ...seg,
                          text: translatedText?.text || ''
                        };
                      });
                      translationTracksData.push(translationSegments);
                    }
                  }

                  setTranslationTracks(translationTracksData);
                } catch (error) {
                  console.error('[SubtitlePlayer] 加载翻译资源失败:', error);
                  setTranslationTracks([]);
                }
              }
            } catch (error) {
              console.error(`[SubtitlePlayer] 解析${format.toUpperCase()}文件失败:`, error);
              setSubtitleEntries([]);
              setTranslationTracks([]);
            }
          } else {
            setSubtitleEntries([]);
            setTranslationTracks([]);
          }
        })
        .catch((error) => {
          console.error('[SubtitlePlayer] 读取文件失败:', error);
          setSubtitleEntries([]);
          setTranslationTracks([]);
        })
        .finally(() => {
          setIsLoading(false);
        });
      return;
    }

    setIsLoading(false);
    setSubtitleEntries([]);
    setTranslationTracks([]);
  }, [resource, debouncedSave]);

  // 用户手动编辑字幕时的回调：同步到本地 state 并触发保存
  const handleSegmentsChange = useCallback(
    (updated: AimSegments[]): void => {
      setSubtitleEntries(updated);
      if (resource.id && !isLoading) {
        debouncedSave(resource.id, updated, subtitleFormat);
      }
    },
    [resource.id, debouncedSave, isLoading, subtitleFormat]
  );

  // 处理翻译开始
  const handleTranslationStart = useCallback(
    (requestId: string) => {
      startTranslation(requestId);
    },
    [startTranslation]
  );

  // 构建轨道数据
  const tracks = useMemo(() => {
    const tracksArray: AimSegments[][] = [subtitleEntries];

    // 添加已保存的翻译轨道
    if (translationTracks.length > 0) {
      tracksArray.push(...translationTracks);
    }

    // 添加正在翻译的临时文本轨道
    if (typingTexts.length > 0) {
      tracksArray.push(typingTexts);
    }

    return tracksArray;
  }, [subtitleEntries, translationTracks, typingTexts]);

  // 时间轴视图数据
  const timelineTracks = useMemo(() => {
    const labels = ['原文'];
    if (translationTracks.length > 0) {
      labels.push(...translationTracks.map((_, idx) => `译文 ${idx + 1}`));
    }
    if (typingTexts.length > 0) {
      labels.push('翻译中');
    }
    // 类型适配：时间轴工具内部定义的 AimSegments 结构与外部包的类型略有差异，运行时兼容，这里进行类型断言
    return aimTracksToTimelineTracks(tracks as any, labels);
  }, [tracks, translationTracks, typingTexts]);

  // 时间轴高亮的片段 ID
  const timelineHighlightIds = useMemo(() => {
    return indicesToIds(translatingChunks, 0); // 主轨道的翻译中片段
  }, [translatingChunks]);

  // 处理时间轴文本编辑
  const handleTimelineTextChange = useCallback(
    (segment: TimelineSegment, trackId: string, newText: string) => {
      // 只处理主轨道（track-0）的编辑
      if (trackId !== 'track-0') return;

      const parsed = parseSegmentId(segment.id);
      if (!parsed) return;

      const { segmentIndex } = parsed;
      const updated = subtitleEntries.map((item, i) => {
        if (i === segmentIndex) {
          return { ...item, text: newText };
        }
        return item;
      });

      setSubtitleEntries(updated);
      if (resource.id && !isLoading) {
        debouncedSave(resource.id, updated, subtitleFormat);
      }
    },
    [subtitleEntries, resource.id, isLoading, debouncedSave, subtitleFormat]
  );

  // 处理时间轴时间变更（拖拽移动或调整边缘）
  const handleTimelineTimeChange = useCallback(
    (segment: TimelineSegment, trackId: string, newStartTime: number, newEndTime: number) => {
      // 只处理主轨道（track-0）的编辑
      if (trackId !== 'track-0') return;

      const parsed = parseSegmentId(segment.id);
      if (!parsed) return;

      const { segmentIndex } = parsed;

      // 格式化时间为字幕格式 (HH:MM:SS,mmm)
      const formatTime = (seconds: number): string => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.round((seconds % 1) * 1000);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
      };

      const updated = subtitleEntries.map((item, i) => {
        if (i === segmentIndex) {
          return {
            ...item,
            st: formatTime(newStartTime),
            et: formatTime(newEndTime)
          };
        }
        return item;
      });

      setSubtitleEntries(updated);
      if (resource.id && !isLoading) {
        debouncedSave(resource.id, updated, subtitleFormat);
      }
    },
    [subtitleEntries, resource.id, isLoading, debouncedSave, subtitleFormat]
  );

  // 统一：往前合并（仅主轨道 track-0）
  const handleMergePrev = useCallback(
    ({ trackId, segmentIndex }: { trackId: string; segmentIndex: number }) => {
      if (trackId !== 'track-0' || segmentIndex <= 0) return;
      const merged = utils.mergeAimSegmentRange(subtitleEntries, segmentIndex - 1, segmentIndex);
      setSubtitleEntries(merged);
      if (resource.id && !isLoading) {
        debouncedSave(resource.id, merged, subtitleFormat);
      }
    },
    [subtitleEntries, resource.id, isLoading, debouncedSave, subtitleFormat]
  );

  // 统一：往后合并（仅主轨道 track-0）
  const handleMergeNext = useCallback(
    ({ trackId, segmentIndex }: { trackId: string; segmentIndex: number }) => {
      if (trackId !== 'track-0') return;
      if (segmentIndex < 0 || segmentIndex >= subtitleEntries.length - 1) return;

      const merged = utils.mergeAimSegmentRange(subtitleEntries, segmentIndex, segmentIndex + 1);
      setSubtitleEntries(merged);
      if (resource.id && !isLoading) {
        debouncedSave(resource.id, merged, subtitleFormat);
      }
    },
    [subtitleEntries, resource.id, isLoading, debouncedSave, subtitleFormat]
  );

  return (
    <div className="flex h-full w-full flex-col text-muted-foreground">
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-2">
        {/* 左侧：视图切换按钮 */}
        <div className="flex items-center gap-1">
          <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('list')} title="列表视图">
            <TbList />
            <span className="text-xs">列表</span>
          </Button>
          <Button variant={viewMode === 'timeline' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('timeline')} title="时间轴视图">
            <TbTimeline />
            <span className="text-xs">时间轴</span>
          </Button>
        </div>
        {/* 右侧：翻译按钮和配置 */}
        <div className="flex items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button className="h-8 w-8 p-0" variant={followTime ? 'default' : 'ghost'} size="sm" onClick={() => setFollowTime((prev) => !prev)}>
                <TbCrosshair />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">跟随滚动</TooltipContent>
          </Tooltip>
          <SubtitleTranslator
            subtitleEntries={subtitleEntries}
            resourceId={resource.id}
            isTranslating={isTranslating}
            translationProgress={translationProgress}
            onStopTranslation={stopTranslation}
            onTranslationStart={handleTranslationStart}
          />
          <TTSSynthesizer
            subtitleEntries={subtitleEntries}
            resourceId={resource.id}
            isSynthesizing={isSynthesizing}
            synthesisProgress={synthesisProgress}
            onStopSynthesis={stopSynthesis}
            onSynthesisStart={handleTTSSynthesisStart}
          />
        </div>
      </div>

      {/* 内容区域：根据视图模式切换 */}
      {viewMode === 'list' ? (
        // 列表视图
        <SubtitlePlayer
          tracks={tracks}
          currentTime={currentTime}
          followCurrentTime={followTime}
          onMergePrev={handleMergePrev}
          onMergeNext={handleMergeNext}
          onSeek={onSeek}
          onSegmentsChange={handleSegmentsChange}
          disabledIndices={translatingChunks}
          highlightIndices={translatingChunks}
          summaries={chunkSummaryInfoMap}
          ttsItems={ttsItemsMap}
          ttsSynthesizingIndices={synthesizingIndices}
          onPlayTTS={handlePlayTTS}
        />
      ) : (
        // 时间轴视图
        <SubtitleTimeline
          tracks={timelineTracks}
          currentTime={currentTime}
          followCurrentTime={followTime}
          onSeek={onSeek}
          onSegmentTextChange={handleTimelineTextChange}
          onSegmentTimeChange={handleTimelineTimeChange}
          onMergePrev={handleMergePrev}
          highlightIds={timelineHighlightIds}
          disabled={isTranslating}
          showRuler
          showTrackLabels
          audioPath={audioPath}
          showWaveform={!!audioPath}
        />
      )}
    </div>
  );
};
