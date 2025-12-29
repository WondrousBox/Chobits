import { AimSegments, parser, tools, utils } from '@aim-packages/subtitle';
import { debounce } from 'lodash-es';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';

import type { ResourceItem } from '../../types';
import { SubtitleRow } from './SubtitleRow';
import { SubtitleTranslator } from './SubtitleTranslator';

interface SrtPlayerProps {
  resource: ResourceItem;
  currentTime?: number; // 当前播放时间（秒）
  onSeek?: (time: number) => void; // 跳转到指定时间的回调
}

// 将 SRT 时间字符串转换为秒数
// 支持格式: "00:00:10,500" 或 "00:00:10.500"
function timeStringToSeconds(timeStr: string): number {
  if (!timeStr) return 0;

  // 替换逗号为点，统一格式
  const normalized = timeStr.replace(',', '.');

  // 匹配格式: HH:MM:SS.mmm
  const match = normalized.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
  if (!match) return 0;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const milliseconds = parseInt(match[4], 10);

  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

// 将 AimSegments 转换为 ISegment 格式
// ISegment = [string, string, string, string | undefined]
// 第一个是开始时间，第二个是结束时间，第三个是文本，第四个是可选的
function convertToISegment(segment: AimSegments): [string, string, string, string | undefined] {
  return [segment.st, segment.et, segment.text, undefined];
}

export const SrtPlayer = ({ resource, currentTime = 0, onSeek }: SrtPlayerProps): React.ReactNode => {
  const [subtitleEntries, setSubtitleEntries] = useState<AimSegments[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const activeRowRef = useRef<HTMLDivElement>(null);

  // 防抖保存函数
  const debouncedSave = useMemo(
    () =>
      debounce(async (resourceId: string, segments: AimSegments[]) => {
        if (!resourceId) return;

        try {
          // 过滤掉已删除的片段
          const validSegments = segments.filter((seg) => !seg.delete);
          // 转换为 ISegment 格式
          const iSegments = validSegments.map(convertToISegment);
          // 调用 tools.outputSrt 生成 SRT 内容
          const srtContent = tools.outputSrt({ segments1: iSegments });
          // 通过资源更新接口保存，主进程会处理文件写入
          const result = await window.YUA.resource['resource:update']({
            id: resourceId,
            patch: { srtContent }
          });
          if (result.success) {
            console.log('[auto-save] 字幕已保存');
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

  // 加载 SRT 文件内容
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
      if (lower.endsWith('.srt')) {
        setIsLoading(true);
        // 取消之前的保存操作
        debouncedSave.cancel();
        window.YUA.file['file:readContent'](data.filePath, 20000)
          .then(async (result: any) => {
            if (result.success) {
              try {
                const segments = await parser.srtToAimSegments(result.content || '');
                setSubtitleEntries(segments);
              } catch {
                setSubtitleEntries([]);
              }
            } else {
              setSubtitleEntries([]);
            }
          })
          .catch(() => {
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
          debouncedSave(resource.id, updated);
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
            debouncedSave(resource.id, merged);
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
            debouncedSave(resource.id, merged);
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

      const startTime = timeStringToSeconds(segment.st);
      const endTime = timeStringToSeconds(segment.et);

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

  // 处理翻译完成回调
  const handleTranslateComplete = useCallback((updatedSegments: AimSegments[]) => {
    setSubtitleEntries(updatedSegments);
  }, []);

  return (
    <div className="flex h-full w-full flex-col text-muted-foreground">
      {/* 翻译按钮和配置 */}
      <SubtitleTranslator subtitleEntries={subtitleEntries} onTranslateComplete={handleTranslateComplete} resourceId={resource.id} isLoading={isLoading} debouncedSave={debouncedSave} />

      <ScrollArea className="h-full w-full">
        <div className="box-border h-full w-full select-text overflow-auto rounded border px-4 py-3 leading-relaxed shadow-inner">
          {subtitleEntries.map((entry, idx) => (
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
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};
