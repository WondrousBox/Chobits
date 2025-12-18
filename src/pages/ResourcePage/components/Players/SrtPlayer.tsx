import React, { useEffect, useState } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';

import type { ResourceItem } from '../../types';
import { makeResSrc } from '../../utils/resourceProtocol';

interface SrtPlayerProps {
  resource: ResourceItem;
}

interface SubtitleEntry {
  index: number;
  startTime: string;
  endTime: string;
  text: string;
}

export const SrtPlayer: React.FC<SrtPlayerProps> = ({ resource }) => {
  const [subtitleEntries, setSubtitleEntries] = useState<SubtitleEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 解析 SRT 文件内容
  const parseSrtContent = (content: string): SubtitleEntry[] => {
    const entries: SubtitleEntry[] = [];
    const blocks = content.trim().split(/\n\s*\n/);

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 3) continue;

      // 第一行是序号
      const index = parseInt(lines[0].trim(), 10);
      if (isNaN(index)) continue;

      // 第二行是时间码
      const timeLine = lines[1].trim();
      const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
      if (!timeMatch) continue;

      const startTime = timeMatch[1].replace(',', '.');
      const endTime = timeMatch[2].replace(',', '.');

      // 剩余行是字幕文本
      const text = lines.slice(2).join('\n').trim();

      if (text) {
        entries.push({
          index,
          startTime,
          endTime,
          text
        });
      }
    }

    return entries;
  };

  // 格式化时间显示
  const formatTime = (timeStr: string): string => {
    return timeStr.replace('.', ':');
  };

  // 加载 SRT 文件内容
  useEffect(() => {
    const data = resource;

    if (!data) {
      setSubtitleEntries([]);
      return;
    }

    // 优先使用 contentText
    if (data.contentText) {
      try {
        const entries = parseSrtContent(data.contentText);
        setSubtitleEntries(entries);
        setError(null);
      } catch (err) {
        setError('解析字幕内容失败');
        setSubtitleEntries([]);
      }
      return;
    }

    // 通过主进程读取文件内容
    if (data.filePath) {
      const lower = data.filePath.toLowerCase();
      if (lower.endsWith('.srt')) {
        setLoading(true);
        setError(null);
        window.YUA.file['file:readContent'](data.filePath, 20000)
          .then((result: any) => {
            if (result.success) {
              let content = result.content || '';
              if (result.truncated) {
                content += `\n\n...（文件已截取，原始大小: ${Math.round(result.originalSize / 1024)}KB）`;
              }
              try {
                const entries = parseSrtContent(content);
                setSubtitleEntries(entries);
                setError(null);
              } catch (err) {
                setError('解析字幕内容失败');
                setSubtitleEntries([]);
              }
            } else {
              setError('无法加载字幕文件');
              setSubtitleEntries([]);
            }
          })
          .catch(() => {
            setError('无法加载字幕文件');
            setSubtitleEntries([]);
          })
          .finally(() => setLoading(false));
        return;
      }
    }

    setSubtitleEntries([]);
  }, [resource]);

  const fileSrc = resource.filePath ? makeResSrc(resource.filePath) : resource.url;

  return (
    <div className="flex h-full w-full flex-col text-xs text-muted-foreground">
      {loading ? (
        <div className="flex h-full w-full items-center justify-center">加载中…</div>
      ) : error ? (
        <div className="flex h-full w-full items-center justify-center text-destructive">{error}</div>
      ) : subtitleEntries.length > 0 ? (
        <ScrollArea className="h-full w-full">
          <div className="box-border h-full w-full select-text overflow-auto rounded border px-4 py-3 text-left text-xs leading-relaxed shadow-inner">
            {subtitleEntries.map((entry, idx) => (
              <div key={idx} className="mb-4 last:mb-0">
                <div className="mb-1 flex items-center gap-2 text-[10px] text-muted-foreground/70">
                  <span className="font-mono font-medium">#{entry.index}</span>
                  <span className="font-mono">
                    {formatTime(entry.startTime)} → {formatTime(entry.endTime)}
                  </span>
                </div>
                <div className="text-foreground whitespace-pre-wrap">{entry.text}</div>
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="flex h-full w-full items-center justify-center">（无字幕内容）</div>
      )}

      {!loading && !error && subtitleEntries.length === 0 && fileSrc && <div className="text-[11px] break-all">来源: {fileSrc}</div>}
    </div>
  );
};
