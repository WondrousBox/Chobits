/* eslint-disable react-hooks/set-state-in-effect */
import { AimSegments, parser, tools } from '@aim-packages/subtitle';
import { debounce } from 'lodash-es';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ResourceItem } from '../../../types';
import { SubtitleTranslator } from '../SubtitleTranslator';
import { SubtitlePlayer } from './SubtitlePlayer';
import { type ChunkCompleteData, useSubtitleTranslation } from './useSubtitleTranslation';

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
  const subtitleEntriesRef = useRef<AimSegments[]>([]);
  useEffect(() => {
    subtitleEntriesRef.current = subtitleEntries;
  }, [subtitleEntries]);

  // 防抖保存函数（业务逻辑，负责写回资源）
  // segments1: 原文（主轨道），segments2: 翻译结果（第二轨道，可选）
  const debouncedSave = useMemo(
    () =>
      debounce(async (resourceId: string, segments1: AimSegments[], format: SubtitleFormat, segments2?: AimSegments[]) => {
        if (!resourceId) return;

        try {
          // 过滤掉已删除的片段
          const validSegments1 = segments1.filter((seg) => !seg.delete);
          // 转换为 ISegment 格式
          const iSegments1 = validSegments1.map(convertToISegment);

          // 如果有翻译结果，也转换为 ISegment 格式
          let iSegments2: Array<[string, string, string, string | undefined]> | undefined;
          if (segments2 && segments2.length > 0) {
            const validSegments2 = segments2.filter((seg) => !seg.delete);
            iSegments2 = validSegments2.map(convertToISegment);
          }

          // 根据格式选择不同的输出方法
          let content: string;
          if (format === 'vtt' && 'outputVtt' in tools && typeof tools.outputVtt === 'function') {
            content = tools.outputVtt({ segments1: iSegments1, segments2: iSegments2 });
          } else if (format === 'ass' && 'outputAss' in tools && typeof tools.outputAss === 'function') {
            content = tools.outputAss({ segments1: iSegments1, segments2: iSegments2 });
          } else {
            // 默认使用 SRT 格式输出
            content = tools.outputSrt({ segments1: iSegments1, segments2: iSegments2 });
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

  // 保持 typingTexts 的引用，用于在回调中访问最新的翻译结果
  const typingTextsRef = useRef<AimSegments[]>([]);

  // 处理 chunk 完成时的保存逻辑
  const handleChunkComplete = useCallback(
    (data: ChunkCompleteData) => {
      if (!resource.id || isLoading) return;

      // 使用 ref 获取最新的原文（主轨道）
      const currentEntries = subtitleEntriesRef.current || [];

      // 获取最新的翻译结果（第二轨道）
      const currentTypingTexts = typingTextsRef.current || [];

      // 更新翻译结果中对应的片段
      const updatedTypingTexts = [...currentTypingTexts];
      // 确保数组长度足够
      while (updatedTypingTexts.length <= data.endIndex) {
        const baseSegment = currentEntries[updatedTypingTexts.length] || currentEntries[currentEntries.length - 1];
        if (baseSegment) {
          updatedTypingTexts.push({ ...baseSegment, text: '' });
        } else {
          updatedTypingTexts.push({ st: '00:00:00,000', et: '00:00:00,000', text: '' });
        }
      }

      // 更新翻译结果
      data.segments.forEach((item) => {
        if (updatedTypingTexts[item.index]) {
          const baseSegment = currentEntries[item.index];
          if (baseSegment) {
            updatedTypingTexts[item.index] = { ...baseSegment, text: item.text };
          } else {
            updatedTypingTexts[item.index] = { ...updatedTypingTexts[item.index], text: item.text };
          }
        }
      });

      // 保存：segments1 是原文，segments2 是翻译结果
      debouncedSave(resource.id, currentEntries, subtitleFormat, updatedTypingTexts);
    },
    [resource.id, isLoading, debouncedSave, subtitleFormat]
  );

  // 处理翻译完成时的保存逻辑（通过监听状态变化）
  // 注意：chunk-complete 时已经保存了，这里主要是作为兜底
  const handleTranslationComplete = useCallback(() => {
    // 翻译完成时，所有 chunk 应该都已经通过 chunk-complete 保存过了
    // 这里可以做一些清理工作，或者最终确认保存
  }, []);

  // 使用翻译 Hook
  const { translatingChunks, typingTexts, chunkSummaryInfoMap, translationProgress, isTranslating, isTranslationComplete, startTranslation, stopTranslation, resetTranslation } =
    useSubtitleTranslation({
      resourceId: resource.id,
      subtitleEntriesRef,
      onChunkComplete: handleChunkComplete,
      onTranslationComplete: handleTranslationComplete
    });

  // 保持 typingTexts 的引用始终是最新的
  useEffect(() => {
    typingTextsRef.current = typingTexts;
  }, [typingTexts]);

  // 监听翻译完成状态，确保最终保存（兜底逻辑）
  // 使用 ref 追踪上一次的状态，避免重复保存
  const prevTranslationCompleteRef = useRef(false);
  useEffect(() => {
    // 只在状态从 false 变为 true 时触发一次
    if (isTranslationComplete && !prevTranslationCompleteRef.current && typingTexts.length > 0 && !isLoading && resource.id) {
      // 获取最新的原文（主轨道）
      const currentEntries = subtitleEntriesRef.current || [];

      // 保存：segments1 是原文，segments2 是翻译结果
      debouncedSave(resource.id, currentEntries, subtitleFormat, typingTexts);
    }
    prevTranslationCompleteRef.current = isTranslationComplete;
  }, [isTranslationComplete, typingTexts.length, isLoading, resource.id, debouncedSave, subtitleFormat]);

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

  // 通用组件的变更回调：同步到本地 state 并触发保存
  // 注意：这里只保存原文，因为这是用户手动编辑主轨道
  const handleSegmentsChange = useCallback(
    (updated: AimSegments[]): void => {
      setSubtitleEntries(updated);
      if (resource.id && !isLoading) {
        // 保存时，如果有翻译结果，也一并保存
        const currentTypingTexts = typingTextsRef.current || [];
        debouncedSave(resource.id, updated, subtitleFormat, currentTypingTexts.length > 0 ? currentTypingTexts : undefined);
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
      {/* 翻译按钮和配置（业务组件） */}
      <SubtitleTranslator
        subtitleEntries={subtitleEntries}
        resourceId={resource.id}
        isTranslating={isTranslating}
        translationProgress={translationProgress}
        onStopTranslation={stopTranslation}
        onTranslationStart={handleTranslationStart}
      />

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
