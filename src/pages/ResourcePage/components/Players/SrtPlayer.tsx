import { AimSegments, parser } from '@aim-packages/subtitle';
import React, { useCallback, useEffect, useState } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';

import type { ResourceItem } from '../../types';
import { SubtitleRow } from './SubtitleRow';

interface SrtPlayerProps {
  resource: ResourceItem;
}

export const SrtPlayer = ({ resource }: SrtPlayerProps): React.ReactNode => {
  const [subtitleEntries, setSubtitleEntries] = useState<AimSegments[]>([]);
  // 加载 SRT 文件内容
  useEffect(() => {
    const data = resource;

    if (!data) {
      setTimeout(() => {
        setSubtitleEntries([]);
      }, 0);
      return;
    }

    // 通过主进程读取文件内容
    if (data.filePath) {
      const lower = data.filePath.toLowerCase();
      if (lower.endsWith('.srt')) {
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
          });
        return;
      }
    }

    setTimeout(() => {
      setSubtitleEntries([]);
    }, 0);
  }, [resource]);

  const handleTextChange = useCallback((index: number, text: string): void => {
    setSubtitleEntries((prev) =>
      prev.map((item, i) => {
        if (i === index) {
          item.text = text;
        }
        return item;
      })
    );
  }, []);

  return (
    <div className="flex h-full w-full flex-col text-muted-foreground">
      <ScrollArea className="h-full w-full">
        <div className="box-border h-full w-full select-text overflow-auto rounded border px-4 py-3 leading-relaxed shadow-inner">
          {subtitleEntries.map((entry, idx) => (
            <SubtitleRow key={idx} index={idx} segment={entry} onTextChange={handleTextChange} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};
