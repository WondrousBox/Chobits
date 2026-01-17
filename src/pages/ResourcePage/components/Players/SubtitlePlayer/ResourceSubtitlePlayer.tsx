/* eslint-disable react-hooks/set-state-in-effect */
import { AimSegments, parser, tools } from '@aim-packages/subtitle';
import { debounce } from 'lodash-es';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ResourceItem } from '../../../types';
import { SubtitleTranslator } from '../SubtitleTranslator';
import { SubtitlePlayer } from './SubtitlePlayer';
import { useSubtitleTranslation } from './useSubtitleTranslation';

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
 * 带资源读取和翻译能力的字幕播放器容器
 * - 翻译结果由主进程自动保存，渲染进程只负责展示
 * - 用户手动编辑字幕时，通过渲染进程保存
 */
export const ResourceSubtitlePlayer: React.FC<ResourceSubtitlePlayerProps> = ({ resource, currentTime = 0, onSeek }) => {
  const [subtitleEntries, setSubtitleEntries] = useState<AimSegments[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [subtitleFormat, setSubtitleFormat] = useState<SubtitleFormat>('srt');

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

  // 使用翻译 Hook（翻译结果由主进程自动保存）
  const { translatingChunks, typingTexts, chunkSummaryInfoMap, translationProgress, isTranslating, startTranslation, stopTranslation } = useSubtitleTranslation({
    resourceId: resource.id,
    subtitleEntriesRef
  });

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

    setIsLoading(false);
    setSubtitleEntries([]);
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
    if (typingTexts.length > 0) {
      tracksArray.push(typingTexts);
    }
    return tracksArray;
  }, [subtitleEntries, typingTexts]);

  return (
    <div className="flex h-full w-full flex-col text-muted-foreground">
      <div className="flex items-center justify-end gap-2 border-b border-border/50 pb-2">
        {/* 翻译按钮和配置（业务组件） */}
        <SubtitleTranslator
          subtitleEntries={subtitleEntries}
          resourceId={resource.id}
          isTranslating={isTranslating}
          translationProgress={translationProgress}
          onStopTranslation={stopTranslation}
          onTranslationStart={handleTranslationStart}
        />
      </div>

      {/* 通用字幕展示组件：支持多轨道（主轨 + 附加轨道） */}
      <SubtitlePlayer
        tracks={tracks}
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
