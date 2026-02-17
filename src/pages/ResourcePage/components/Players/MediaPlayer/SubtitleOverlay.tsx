import React, { useEffect, useState } from 'react';

import { SUBTITLE_DISPLAY_EVENT, type SubtitleDisplayEventDetail, type SubtitleDisplayLine, type WordTimestamp } from './subtitleDisplayEvent';

interface SubtitleOverlayProps {
  className?: string;
}

/**
 * 渲染卡拉OK式字级别高亮的字幕文本
 */
const KaraokeText: React.FC<{ words: WordTimestamp[]; currentTime: number }> = ({ words, currentTime }) => {
  return (
    <>
      {words.map((word, i) => {
        const isActive = currentTime >= word.st && currentTime < word.et;
        const isPast = currentTime >= word.et;
        return (
          <span
            key={i}
            className={isActive ? 'text-yellow-300 font-bold transition-colors duration-100' : isPast ? 'text-white/90 transition-colors duration-100' : 'text-white/50 transition-colors duration-100'}
          >
            {word.text}
          </span>
        );
      })}
    </>
  );
};

/**
 * 字幕叠加层组件
 * 监听 custom:subtitle-display 事件，在视频播放器上方渲染多轨道字幕文本。
 * 每个轨道根据各自的 st/et 独立显示对应时间点的文本。
 */
export const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({ className = '' }) => {
  const [lines, setLines] = useState<SubtitleDisplayLine[]>([]);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const handler = (e: Event): void => {
      const ce = e as CustomEvent<SubtitleDisplayEventDetail>;
      setLines(ce.detail.lines);
      setCurrentTime(ce.detail.currentTime);
    };
    window.addEventListener(SUBTITLE_DISPLAY_EVENT, handler);
    return () => {
      window.removeEventListener(SUBTITLE_DISPLAY_EVENT, handler);
    };
  }, []);

  if (lines.length === 0) return null;

  return (
    <div className={`absolute bottom-10 left-0 right-0 flex flex-col items-center gap-1 pointer-events-none z-10 px-4 ${className}`}>
      {lines.map((line, idx) => (
        <div
          key={`${line.trackId}-${idx}`}
          className={`inline-block max-w-[90%] px-3 py-1 rounded text-center leading-snug whitespace-pre-wrap break-words pointer-events-auto select-text ${line.isTranslation ? 'bg-black/60 text-yellow-200 text-sm' : 'bg-black/70 text-white text-base font-medium'}`}
        >
          {line.words && line.words.length > 0 && !line.isTranslation ? <KaraokeText words={line.words} currentTime={currentTime} /> : line.text}
        </div>
      ))}
    </div>
  );
};
