import { utils } from '@aim-packages/subtitle';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { makeResSrc } from '@/lib/resource-protocol';

import type { SubtitleStyleConfig } from './types';

interface VideoPreviewProps {
  /** 视频文件路径 */
  videoPath?: string;
  /** 字幕条目 */
  subtitleSegments: Array<{ st: string; et: string; text: string }>;
  /** 字幕样式配置 */
  subtitleStyle: SubtitleStyleConfig;
  /** 当前播放时间（秒） */
  currentTime?: number;
  /** 播放时间变化回调 */
  onTimeUpdate?: (time: number) => void;
  /** 总时长变化回调 */
  onDurationChange?: (duration: number) => void;
}

/**
 * 视频预览组件
 * 用于在导出对话框中预览视频和字幕效果
 */
export const VideoPreview: React.FC<VideoPreviewProps> = ({ videoPath, subtitleSegments, subtitleStyle, currentTime: externalCurrentTime, onTimeUpdate, onDurationChange }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showHoverControls, setShowHoverControls] = useState(false);
  const [hoverTimer, setHoverTimer] = useState<NodeJS.Timeout | null>(null);

  // 使用外部时间或内部时间
  const effectiveCurrentTime = externalCurrentTime ?? currentTime;

  // 将 ASS 颜色格式转换为 CSS 颜色
  const assColorToCss = useCallback((assColor: string): string => {
    // ASS &HBBGGRR (6 hex) 或 &HAABBGGRR (8 hex)
    const hex = assColor.replace('&H', '').replace('&', '');
    if (hex.length === 6) {
      // &HBBGGRR → #RRGGBB
      return `#${hex.slice(4, 6)}${hex.slice(2, 4)}${hex.slice(0, 2)}`;
    }
    if (hex.length === 8) {
      // &HAABBGGRR → #RRGGBB (ignore alpha)
      return `#${hex.slice(6, 8)}${hex.slice(4, 6)}${hex.slice(2, 4)}`;
    }
    return assColor;
  }, []);

  // 获取当前应该显示的字幕
  const currentSubtitle = useMemo(() => {
    const time = effectiveCurrentTime;
    return subtitleSegments.find((seg) => {
      const start = utils.convertToSeconds(seg.st);
      const end = utils.convertToSeconds(seg.et);
      return time >= start && time <= end;
    });
  }, [subtitleSegments, effectiveCurrentTime]);

  // 生成字幕样式
  const subtitleStyleCss = useMemo(() => {
    const primaryColor = assColorToCss(subtitleStyle.primaryColor);
    const outlineColor = assColorToCss(subtitleStyle.outlineColor);

    let textShadow = '';
    if (subtitleStyle.borderStyle === '1') {
      // BorderStyle 1: Outline + Drop Shadow
      textShadow = `
        ${-subtitleStyle.outlineWidth}px ${-subtitleStyle.outlineWidth}px 0 ${outlineColor},
        ${subtitleStyle.outlineWidth}px ${-subtitleStyle.outlineWidth}px 0 ${outlineColor},
        ${-subtitleStyle.outlineWidth}px ${subtitleStyle.outlineWidth}px 0 ${outlineColor},
        ${subtitleStyle.outlineWidth}px ${subtitleStyle.outlineWidth}px 0 ${outlineColor},
        0 ${subtitleStyle.shadowDepth * 2}px ${subtitleStyle.shadowDepth * 2}px rgba(0,0,0,0.5)
      `;
    } else if (subtitleStyle.borderStyle === '3') {
      // BorderStyle 3: Opaque box (simulate with background)
      textShadow = 'none';
    }

    // ASS Alignment numpad bottom row: 1=left, 2=center, 3=right
    const textAlign = subtitleStyle.alignment === '1' ? 'left' : subtitleStyle.alignment === '3' ? 'right' : 'center';

    let backgroundColor = '';
    if (subtitleStyle.backColor) {
      const backHex = subtitleStyle.backColor.replace('&H', '').replace('&', '');
      if (backHex.length >= 8) {
        const assAlpha = parseInt(backHex.slice(0, 2), 16);
        // ASS alpha: 00=opaque, FF=transparent → CSS alpha: FF=opaque, 00=transparent
        const cssAlpha = 255 - assAlpha;
        if (cssAlpha > 0) {
          const rr = backHex.slice(6, 8);
          const gg = backHex.slice(4, 6);
          const bb = backHex.slice(2, 4);
          backgroundColor = `#${rr}${gg}${bb}${cssAlpha.toString(16).padStart(2, '0')}`;
        }
      }
    }

    return {
      fontFamily: subtitleStyle.fontName.includes(' ') ? `"${subtitleStyle.fontName}"` : subtitleStyle.fontName,
      fontSize: `${subtitleStyle.fontSize}px`,
      color: primaryColor,
      fontWeight: subtitleStyle.bold ? 'bold' : 'normal',
      fontStyle: subtitleStyle.italic ? 'italic' : 'normal',
      textAlign: textAlign as React.CSSProperties['textAlign'],
      textShadow,
      backgroundColor,
      padding: backgroundColor ? '4px 12px' : '0',
      borderRadius: backgroundColor ? '4px' : '0',
      bottom: `${subtitleStyle.marginV}px`,
      left: subtitleStyle.alignment === '2' ? '50%' : subtitleStyle.alignment === '1' ? '10%' : undefined,
      right: subtitleStyle.alignment === '3' ? '10%' : undefined,
      transform: subtitleStyle.alignment === '2' ? 'translateX(-50%)' : undefined
    };
  }, [subtitleStyle, assColorToCss]);

  // 更新时间
  const updateTime = useCallback(() => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      setCurrentTime(time);
      const dur = videoRef.current.duration || 0;
      if (dur > 0 && dur !== duration) {
        setDuration(dur);
        onDurationChange?.(dur);
      }
      if (onTimeUpdate) {
        onTimeUpdate(time);
      }
    }
  }, [duration, onTimeUpdate, onDurationChange]);

  // 监听视频事件
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = (): void => setIsPlaying(true);
    const handlePause = (): void => setIsPlaying(false);
    const handleEnded = (): void => setIsPlaying(false);
    const handleTimeUpdate = (): void => updateTime();
    const handleLoadedMetadata = (): void => updateTime();

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [updateTime]);

  // 播放/暂停
  const togglePlay = useCallback(async () => {
    if (!videoRef.current) return;
    try {
      if (videoRef.current.paused) {
        await videoRef.current.play();
      } else {
        videoRef.current.pause();
      }
    } catch (error) {
      console.warn('播放控制失败:', error);
    }
  }, []);

  // 跳转
  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = x / rect.width;
      if (videoRef.current && duration > 0) {
        videoRef.current.currentTime = percent * duration;
      }
    },
    [duration]
  );

  // 鼠标悬停显示控制栏
  const handleMouseEnter = useCallback(() => {
    if (hoverTimer) clearTimeout(hoverTimer);
    setShowHoverControls(true);
  }, [hoverTimer]);

  const handleMouseLeave = useCallback(() => {
    const timer = setTimeout(() => {
      if (!isPlaying) {
        setShowHoverControls(false);
      }
    }, 2000);
    setHoverTimer(timer);
  }, [isPlaying]);

  const handleMouseMove = useCallback(() => {
    setShowHoverControls(true);
    if (hoverTimer) clearTimeout(hoverTimer);
    const timer = setTimeout(() => {
      if (isPlaying) {
        setShowHoverControls(false);
      }
    }, 2000);
    setHoverTimer(timer);
  }, [isPlaying, hoverTimer]);

  // 格式化时间
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 视频源
  const videoSrc = videoPath ? makeResSrc(videoPath) : '';

  return (
    <div
      ref={containerRef}
      className="relative bg-black rounded-md overflow-hidden group"
      style={{ aspectRatio: '16/9' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
    >
      {videoSrc ? (
        <video ref={videoRef} src={videoSrc} className="w-full h-full object-contain" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">无视频预览</div>
      )}

      {/* 字幕叠加层 */}
      {currentSubtitle && (
        <div className="absolute left-0 right-0 px-8 pointer-events-none" style={subtitleStyleCss}>
          {currentSubtitle.text}
        </div>
      )}

      {/* 悬浮控制栏 */}
      {(showHoverControls || !isPlaying) && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
          {/* 进度条 */}
          <div className="h-1 bg-white/30 rounded-full cursor-pointer mb-2 hover:h-1.5 transition-all" onClick={handleSeek}>
            <div className="h-full bg-white rounded-full" style={{ width: duration > 0 ? `${(effectiveCurrentTime / duration) * 100}%` : '0%' }} />
          </div>

          {/* 控制按钮 */}
          <div className="flex items-center justify-between text-white text-xs">
            <div className="flex items-center gap-2">
              <button onClick={togglePlay} className="p-1 hover:bg-white/20 rounded transition-colors" title={isPlaying ? '暂停' : '播放'}>
                {isPlaying ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
              <span className="tabular-nums">
                {formatTime(effectiveCurrentTime)} / {formatTime(duration)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 播放中隐藏控制栏时显示小进度点 */}
      {isPlaying && !showHoverControls && duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/30">
          <div className="h-full bg-white" style={{ width: `${(effectiveCurrentTime / duration) * 100}%` }} />
        </div>
      )}
    </div>
  );
};
