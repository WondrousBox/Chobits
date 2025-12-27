import { utils } from '@aim-packages/subtitle';
import React, { useEffect, useRef } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';

import { RecognizedSegment } from '../types';

interface SegmentListProps {
  segments: RecognizedSegment[];
  progressText: string;
  enableTranslation: boolean;
}

export const SegmentList: React.FC<SegmentListProps> = ({ segments, progressText, enableTranslation }) => {
  const contentRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (contentRef.current) {
      const viewport = contentRef.current.closest('[data-radix-scroll-area-viewport]') as HTMLElement;
      if (viewport) {
        requestAnimationFrame(() => {
          viewport.scrollTop = viewport.scrollHeight;
        });
      }
    }
  }, [segments, progressText]);

  return (
    <div className="flex-1 min-h-0 overflow-hidden">
      <ScrollArea className="h-full w-full">
        <div className="p-3" ref={contentRef}>
          {/* 已识别的完整结果 */}
          {segments.map((segment, index) => (
            <div key={index} className="mb-2 group bg-background/80 p-2 rounded-md last:mb-0">
              <div className="text-base leading-tight break-words select-text" style={{ whiteSpace: 'pre-wrap' }}>
                <span className="text-muted-foreground mr-2 hover:text-primary font-mono select-text">{utils.cleanTimeDisplay(utils.formatTime(segment.start / 1000))}</span>
                {segment.text || '\u200b'}
              </div>
              {enableTranslation && segment.translation && (
                <div className="text-sm text-muted-foreground mt-1 leading-tight break-words select-text" style={{ whiteSpace: 'pre-wrap' }}>
                  {segment.translation}
                </div>
              )}
            </div>
          ))}

          {segments.length === 0 && !progressText && (
            <div className="text-center text-muted-foreground py-12">
              <div className="text-sm">识别结果将显示在这里...</div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
