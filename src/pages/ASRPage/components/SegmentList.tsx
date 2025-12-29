import { utils } from '@aim-packages/subtitle';
import React, { useEffect, useRef } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';

import { RecognizedSegment } from '../types';

interface SegmentListProps {
  segments: RecognizedSegment[];
  progressText: string;
  enableTranslation: boolean;
  isTransparent?: boolean;
}

export const SegmentList: React.FC<SegmentListProps> = ({ segments, progressText, enableTranslation, isTransparent = false }) => {
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
    <div className="flex-1 min-h-0 overflow-hidden no-drag">
      <ScrollArea className="h-full w-full">
        <div className="p-3" ref={contentRef}>
          {/* 已识别的完整结果 */}
          {segments.map((segment, index) => (
            <div key={index} className={`mb-2 group p-2 rounded-md last:mb-0 ${isTransparent ? 'bg-transparent' : 'bg-background/80'}`}>
              <div className={`text-base leading-tight break-words select-text ${isTransparent ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : ''}`} style={{ whiteSpace: 'pre-wrap' }}>
                <span className={`mr-2 hover:text-primary font-mono select-text ${isTransparent ? 'text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : 'text-muted-foreground'}`}>
                  {utils.cleanTimeDisplay(utils.formatTime(segment.start / 1000))}
                </span>
                {segment.text || '\u200b'}
              </div>
              {enableTranslation && segment.translation && (
                <div
                  className={`text-sm mt-1 leading-tight break-words select-text ${isTransparent ? 'text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : 'text-muted-foreground'}`}
                  style={{ whiteSpace: 'pre-wrap' }}
                >
                  {segment.translation}
                </div>
              )}
            </div>
          ))}

          {segments.length === 0 && !progressText && (
            <div className={`text-center py-12 ${isTransparent ? 'text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : 'text-muted-foreground'}`}>
              <div className="text-sm">识别结果将显示在这里...</div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
