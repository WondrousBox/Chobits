import { AimSegments, parser, utils } from '@aim-packages/subtitle';
import React, { useEffect, useState } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';

import type { ResourceItem } from '../../types';

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

  return (
    <div className="flex h-full w-full flex-col text-xs text-muted-foreground">
      <ScrollArea className="h-full w-full">
        <div className="box-border h-full w-full select-text overflow-auto rounded border px-4 py-3 text-left text-xs leading-relaxed shadow-inner">
          {subtitleEntries.map((entry, idx) => (
            <div key={idx} className="mb-4 last:mb-0 flex items-start gap-2">
              <div className="mb-1 flex items-center gap-2 text-sm font-mono text-muted-foreground/70">
                <div>#{idx}</div>
                <div className="w-12 text-center">{utils.cleanTimeDisplay(entry.st)}</div>
              </div>
              <div className="text-sm text-foreground whitespace-pre-wrap flex-1">{entry.text}</div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};
