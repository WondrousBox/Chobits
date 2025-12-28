import { AimSegments, parser, tools, utils } from '@aim-packages/subtitle';
import { debounce } from 'lodash-es';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';

import type { ResourceItem } from '../../types';
import { SubtitleRow } from './SubtitleRow';

interface SrtPlayerProps {
  resource: ResourceItem;
}

// 将 AimSegments 转换为 ISegment 格式
// ISegment = [string, string, string, string | undefined]
// 第一个是开始时间，第二个是结束时间，第三个是文本，第四个是可选的
function convertToISegment(segment: AimSegments): [string, string, string, string | undefined] {
  return [segment.st, segment.et, segment.text, undefined];
}

export const SrtPlayer = ({ resource }: SrtPlayerProps): React.ReactNode => {
  const [subtitleEntries, setSubtitleEntries] = useState<AimSegments[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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
      setIsLoading(false);
      setTimeout(() => {
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

  return (
    <div className="flex h-full w-full flex-col text-muted-foreground">
      <ScrollArea className="h-full w-full">
        <div className="box-border h-full w-full select-text overflow-auto rounded border px-4 py-3 leading-relaxed shadow-inner">
          {subtitleEntries.map((entry, idx) => (
            <SubtitleRow key={idx} index={idx} segment={entry} onTextChange={handleTextChange} onMergePrev={handleMergePrev} onMergeNext={handleMergeNext} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};
