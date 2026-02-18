import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbBookmark, TbCamera, TbHighlight, TbMaximize, TbMinimize, TbNote, TbPlayerPause, TbPlayerPlay, TbSettings, TbVocabulary, TbVolume, TbVolumeOff } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { ANNOTATION_MARKERS_UPDATE_EVENT, type AnnotationMarker } from './annotationMarkersEvent';
import { TrackSettingsPopover } from './TrackSettingsPopover';

// 标注类型图标映射
const ANNOTATION_TYPE_ICONS: Record<string, React.ReactNode> = {
  highlight: <TbHighlight className="w-3 h-3" />,
  note: <TbNote className="w-3 h-3" />,
  vocabulary: <TbVocabulary className="w-3 h-3" />,
  comment: <TbNote className="w-3 h-3" />,
  custom: <TbBookmark className="w-3 h-3" />
};

// 格式化时间
function formatMarkerTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// 播放/暂停按钮组件
interface PlayPauseButtonProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  type: 'video' | 'audio';
}

const PlayPauseButton: React.FC<PlayPauseButtonProps> = ({ isPlaying, onTogglePlay, type }) => {
  return (
    <Button size="sm" variant="ghost" onClick={onTogglePlay} className={`w-8 h-8 p-0 hover:bg-white/20 ${type === 'video' ? 'text-white' : 'text-foreground'}`}>
      {isPlaying ? <TbPlayerPause size={16} /> : <TbPlayerPlay size={16} />}
    </Button>
  );
};

// 音量控制组件
interface VolumeControlProps {
  volume: number;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  type: 'video' | 'audio';
}

const VolumeControl: React.FC<VolumeControlProps> = ({ volume, onVolumeChange, onToggleMute, type }) => {
  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVolume = parseFloat(e.target.value);
      onVolumeChange(newVolume);
    },
    [onVolumeChange]
  );

  return (
    <div className="relative flex items-center group">
      <Button size="sm" variant="ghost" onClick={onToggleMute} className={`w-8 h-8 p-0 hover:bg-white/20 ${type === 'video' ? 'text-white' : 'text-foreground'}`}>
        {volume === 0 ? <TbVolumeOff size={16} /> : <TbVolume size={16} />}
      </Button>

      {/* 音量滑块 - 音频模式时水平展开 */}
      <div className={`flex items-center transition-all duration-300 overflow-hidden w-0 opacity-0 group-hover:w-16 group-hover:opacity-100`}>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={volume}
          onChange={handleVolumeChange}
          className={`w-full h-1 rounded-full appearance-none cursor-pointer slider ${type === 'video' ? 'bg-white/30' : 'bg-muted-foreground/30'}`}
          style={{
            background:
              type === 'video'
                ? `linear-gradient(to right, white 0%, white ${volume * 100}%, rgba(255,255,255,0.3) ${volume * 100}%, rgba(255,255,255,0.3) 100%)`
                : `linear-gradient(to right, hsl(var(--foreground)) 0%, hsl(var(--foreground)) ${volume * 100}%, hsl(var(--muted-foreground) / 0.3) ${volume * 100}%, hsl(var(--muted-foreground) / 0.3) 100%)`
          }}
        />
      </div>
    </div>
  );
};

// 时间显示组件
interface TimeDisplayProps {
  currentTime: number;
  duration: number;
  type: 'video' | 'audio';
}

const TimeDisplay: React.FC<TimeDisplayProps> = ({ currentTime, duration, type }) => {
  const formatTime = useCallback((time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  return (
    <div className={`text-xs px-2 font-mono ${type === 'video' ? 'text-white' : 'text-muted-foreground'}`}>
      {formatTime(currentTime)} / {formatTime(duration)}
    </div>
  );
};

// 播放速度控制组件
interface PlaybackRateControlProps {
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
  type: 'video' | 'audio';
}

const PlaybackRateControl: React.FC<PlaybackRateControlProps> = ({ playbackRate, onPlaybackRateChange, type }) => {
  const [showPlaybackRateMenu, setShowPlaybackRateMenu] = useState(false);
  const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 2];

  return (
    <div className="relative">
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setShowPlaybackRateMenu(!showPlaybackRateMenu)}
        className={`w-8 h-8 p-0 hover:bg-white/20 ${type === 'video' ? 'text-white' : 'text-foreground'}`}
      >
        <TbSettings size={16} />
      </Button>
      {showPlaybackRateMenu && (
        <div className={`absolute bottom-full mb-2 right-0 rounded-md p-1 min-w-[80px] ${type === 'video' ? 'bg-black/80' : 'bg-background border'}`}>
          {playbackRates.map((rate) => (
            <button
              key={rate}
              onClick={() => {
                onPlaybackRateChange(rate);
                setShowPlaybackRateMenu(false);
              }}
              className={`w-full px-2 py-1 text-xs hover:bg-white/20 rounded ${type === 'video' ? `text-white ${playbackRate === rate ? 'bg-white/30' : ''}` : `text-foreground ${playbackRate === rate ? 'bg-muted' : ''}`
                }`}
            >
              {rate}x
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// 进度滑块组件
interface ProgressSliderProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  onSeekStart?: () => void;
  onSeekEnd?: () => void;
  type: 'video' | 'audio';
}

const ProgressSlider: React.FC<ProgressSliderProps> = ({ currentTime, duration, onSeek, onSeekStart, onSeekEnd, type }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);
  const seekTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [annotationMarkers, setAnnotationMarkers] = useState<AnnotationMarker[]>([]);

  // 监听标注标记更新事件
  useEffect(() => {
    const handler = (e: Event) => {
      setAnnotationMarkers((e as CustomEvent<AnnotationMarker[]>).detail);
    };
    window.addEventListener(ANNOTATION_MARKERS_UPDATE_EVENT, handler);
    return () => window.removeEventListener(ANNOTATION_MARKERS_UPDATE_EVENT, handler);
  }, []);

  // 计算进度百分比
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const displayValue = isDragging ? dragValue : progress;

  // 节流的 seek 函数，避免过于频繁的更新
  const throttledSeek = useCallback(
    (time: number) => {
      if (seekTimeoutRef.current) {
        clearTimeout(seekTimeoutRef.current);
      }

      seekTimeoutRef.current = setTimeout(() => {
        onSeek(time);
      }, 16); // 约 60fps 的更新频率
    },
    [onSeek]
  );

  // 滑块变化处理
  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value);
      setDragValue(value);
      const newTime = (value / 100) * duration;
      throttledSeek(newTime);
    },
    [duration, throttledSeek]
  );

  // 开始拖拽
  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
    setDragValue(progress);
    onSeekStart?.();
  }, [progress, onSeekStart]);

  // 结束拖拽
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    // 清除所有待处理的 seek 请求
    if (seekTimeoutRef.current) {
      clearTimeout(seekTimeoutRef.current);
    }
    // 立即执行最后一次 seek，确保最终位置准确
    const finalTime = (dragValue / 100) * duration;
    onSeek(finalTime);
    onSeekEnd?.();
  }, [dragValue, duration, onSeek, onSeekEnd]);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (seekTimeoutRef.current) {
        clearTimeout(seekTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="mb-2 relative h-1">
      <input
        type="range"
        min="0"
        max="100"
        step="0.1"
        value={displayValue}
        onChange={handleSliderChange}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        className={`absolute inset-0 w-full h-full rounded-full appearance-none cursor-pointer progress-slider ${type === 'video' ? 'bg-white/30' : 'bg-muted-foreground/30'}`}
        style={{
          background:
            type === 'video'
              ? `linear-gradient(to right, white 0%, white ${displayValue}%, rgba(255,255,255,0.3) ${displayValue}%, rgba(255,255,255,0.3) 100%)`
              : `linear-gradient(to right, hsl(var(--foreground)) 0%, hsl(var(--foreground)) ${displayValue}%, hsl(var(--muted-foreground) / 0.3) ${displayValue}%, hsl(var(--muted-foreground) / 0.3) 100%)`
        }}
      />
      {/* 标注标记点 */}
      {duration > 0 && annotationMarkers.length > 0 && (
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          {annotationMarkers.map((marker) => {
            const left = (marker.startTime / duration) * 100;
            const width = Math.max(((marker.endTime - marker.startTime) / duration) * 100, 0.3);
            const color = marker.color || 'hsl(48, 95%, 55%)';

            return (
              <Tooltip key={marker.id}>
                <TooltipTrigger asChild>
                  <div
                    className="absolute top-0.5 h-full rounded-full opacity-80 hover:opacity-100 transition-opacity pointer-events-auto cursor-pointer"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      minWidth: 6,
                      backgroundColor: color
                    }}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[250px]">
                  <div className="text-xs space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span style={{ color }}>{ANNOTATION_TYPE_ICONS[marker.type] || ANNOTATION_TYPE_ICONS.custom}</span>
                      <span className="font-medium">{marker.title || marker.type}</span>
                    </div>
                    {marker.text && <div className="text-muted-foreground italic">「{marker.text}」</div>}
                    {marker.description && <div className="text-muted-foreground text-[10px] line-clamp-3">{marker.description}</div>}
                    <div className="text-muted-foreground/60 text-[10px]">
                      {formatMarkerTime(marker.startTime)} → {formatMarkerTime(marker.endTime)}
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      )}
    </div>
  );
};

// 全屏按钮组件
interface FullscreenButtonProps {
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

const FullscreenButton: React.FC<FullscreenButtonProps> = ({ isFullscreen, onToggleFullscreen }) => {
  return (
    <Button size="sm" variant="ghost" onClick={onToggleFullscreen} className="w-8 h-8 p-0 text-white hover:bg-white/20">
      {isFullscreen ? <TbMinimize size={16} /> : <TbMaximize size={16} />}
    </Button>
  );
};

interface MediaControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
  isFullscreen: boolean;
  showControls: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onPlaybackRateChange: (rate: number) => void;
  onToggleFullscreen: () => void;
  onScreenshot?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  type: 'video' | 'audio';
}

export const MediaControls: React.FC<MediaControlsProps> = ({
  isPlaying,
  currentTime,
  duration,
  volume,
  playbackRate,
  isFullscreen,
  showControls,
  onTogglePlay,
  onSeek,
  onVolumeChange,
  onPlaybackRateChange,
  onToggleFullscreen,
  onScreenshot,
  onMouseEnter,
  onMouseLeave,
  type
}) => {
  const [previousVolume, setPreviousVolume] = useState(1); // 记住静音前的音量

  // 音量变化处理（包含记忆逻辑）
  const handleVolumeChange = useCallback(
    (newVolume: number) => {
      onVolumeChange(newVolume);
      // 更新记忆的音量（只有在非静音时更新）
      if (newVolume > 0) {
        setPreviousVolume(newVolume);
      }
    },
    [onVolumeChange]
  );

  // 切换静音状态
  const toggleMute = useCallback(() => {
    if (volume === 0) {
      // 如果当前是静音，恢复到之前的音量
      onVolumeChange(previousVolume);
    } else {
      // 如果当前有音量，先记住当前音量，然后设置为静音
      setPreviousVolume(volume);
      onVolumeChange(0);
    }
  }, [volume, previousVolume, onVolumeChange]);

  // 开始拖拽进度条
  const handleSeekStart = useCallback(() => {
    // 拖拽开始时不需要特殊处理
  }, []);

  // 结束拖拽进度条
  const handleSeekEnd = useCallback(() => {
    // 拖拽结束后总是进入播放状态
    if (!isPlaying) {
      // 如果当前是暂停状态，则开始播放
      setTimeout(() => {
        onTogglePlay();
      }, 100);
    }
    // 如果当前已经是播放状态，则不需要做任何操作
  }, [isPlaying, onTogglePlay]);

  const controlsClass =
    type === 'video'
      ? `absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/80 to-transparent p-3 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`
      : 'flex items-center justify-between gap-3 p-3 bg-background/90 rounded-lg border';

  return (
    <div className={controlsClass} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {/* 进度条 */}
      <ProgressSlider currentTime={currentTime} duration={duration} onSeek={onSeek} onSeekStart={handleSeekStart} onSeekEnd={handleSeekEnd} type={type} />

      {/* 控制按钮 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <PlayPauseButton isPlaying={isPlaying} onTogglePlay={onTogglePlay} type={type} />
          <VolumeControl volume={volume} onVolumeChange={handleVolumeChange} onToggleMute={toggleMute} type={type} />
          <TimeDisplay currentTime={currentTime} duration={duration} type={type} />
        </div>

        <div className="flex items-center gap-2">
          <TrackSettingsPopover type={type} />
          <PlaybackRateControl playbackRate={playbackRate} onPlaybackRateChange={onPlaybackRateChange} type={type} />
          {type === 'video' && onScreenshot && (
            <Button size="sm" variant="ghost" onClick={onScreenshot} className="w-8 h-8 p-0 text-white hover:bg-white/20" title="截图">
              <TbCamera size={16} />
            </Button>
          )}
          {type === 'video' && <FullscreenButton isFullscreen={isFullscreen} onToggleFullscreen={onToggleFullscreen} />}
        </div>
      </div>

      <style>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
        }
        .slider::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          border: none;
        }
        .progress-slider::-webkit-slider-thumb {
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .progress-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .progress-slider:hover::-webkit-slider-thumb {
          transform: scale(1.1);
        }
        .progress-slider:hover::-moz-range-thumb {
          transform: scale(1.1);
        }
      `}</style>
    </div>
  );
};
