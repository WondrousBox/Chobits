import { utils } from '@aim-packages/subtitle';
import { motion } from 'framer-motion';
import React, { useEffect, useRef } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';

import { PendingSegment, RecognizedSegment } from '../types';

interface SegmentListProps {
  segments: RecognizedSegment[];
  pendingSegments: PendingSegment[];
  progressText: string;
  enableTranslation: boolean;
  isTransparent?: boolean;
}

export const SegmentList: React.FC<SegmentListProps> = ({ segments, pendingSegments, progressText, enableTranslation, isTransparent = false }) => {
  const contentRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (contentRef.current) {
      const viewport = contentRef.current.closest('[data-radix-scroll-area-viewport]') as HTMLElement;
      if (viewport) {
        requestAnimationFrame(() => {
          viewport.scrollTo({
            top: viewport.scrollHeight,
            behavior: 'smooth'
          });
        });
      }
    }
  }, [segments, pendingSegments, progressText]);

  return (
    <div className="flex-1 min-h-0 overflow-hidden no-drag">
      <ScrollArea className="h-full w-full">
        <div className="p-3" ref={contentRef}>
          {/* 已识别的完整结果 - 无动画，节省性能 */}
          {segments.map((segment, index) => (
            <div key={`segment-${segment.start}-${index}`} className="mb-1 group p-2 rounded-md last:mb-0">
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

          {/* 临时展示的片段（未到 endpoint，带冒泡动画和流光效果） */}
          {pendingSegments.map((segment, index) => (
            <div key={`pending-${segment.start}-${segment.text.slice(0, 10)}-${index}`} className="mb-1 group p-2 rounded-md last:mb-0 relative overflow-hidden origin-bottom">
              {/* 流光效果背景 */}
              <motion.div className="absolute inset-0 shimmer-bg rounded-md" initial={{ opacity: 0 }} animate={{ opacity: 0.3 }} exit={{ opacity: 0 }} />
              <div
                className={`relative text-base leading-tight break-words select-text ${isTransparent ? 'text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : 'text-amber-600 dark:text-amber-400'}`}
                style={{ whiteSpace: 'pre-wrap' }}
              >
                <span className={`mr-2 font-mono select-text ${isTransparent ? 'text-amber-300/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : 'text-amber-500/80 dark:text-amber-500/80'}`}>
                  {utils.cleanTimeDisplay(utils.formatTime(segment.start / 1000))}
                </span>
                {segment.text || '\u200b'}
              </div>
            </div>
          ))}

          {segments.length === 0 && pendingSegments.length === 0 && !progressText && (
            <div className={`text-center py-12 ${isTransparent ? 'text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : 'text-muted-foreground'}`}>
              <div className="text-sm">识别结果将显示在这里...</div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* 流光效果的样式 */}
      <style>{`
        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
        .shimmer-bg {
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(251, 191, 36, 0.3) 25%,
            rgba(251, 191, 36, 0.5) 50%,
            rgba(251, 191, 36, 0.3) 75%,
            transparent 100%
          );
          background-size: 200% 100%;
          animation: shimmer 2s infinite linear;
        }
        .dark .shimmer-bg {
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(251, 191, 36, 0.2) 25%,
            rgba(251, 191, 36, 0.4) 50%,
            rgba(251, 191, 36, 0.2) 75%,
            transparent 100%
          );
          background-size: 200% 100%;
          animation: shimmer 2s infinite linear;
        }
      `}</style>
    </div>
  );
};
