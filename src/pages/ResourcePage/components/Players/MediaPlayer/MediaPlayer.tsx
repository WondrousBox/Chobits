import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { CenterPlayButton } from './CenterPlayButton';
import { MediaControls } from './MediaControls';

interface MediaPlayerProps {
  src: string;
  type: 'video' | 'audio';
  title?: string;
  autoPlay?: boolean;
  className?: string;
  onTimeUpdate?: (currentTime: number) => void; // 播放时间更新回调
  onPlay?: () => void; // 开始播放回调
  onPause?: () => void; // 暂停回调
  onStop?: () => void; // 播放结束回调（ended）
}

export interface MediaPlayerRef {
  seekTo: (time: number) => void; // 跳转到指定时间
  pause: () => void; // 暂停播放
  getCurrentTime: () => number; // 获取当前播放时间
  isPlaying: () => boolean; // 是否正在播放
}

export const MediaPlayer = forwardRef<MediaPlayerRef, MediaPlayerProps>(({ src, type, title, autoPlay = false, className = '', onTimeUpdate, onPlay, onPause, onStop }, ref) => {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);

  // 更新时间信息
  const updateTime = useCallback(() => {
    if (mediaRef.current) {
      const time = mediaRef.current.currentTime;
      setCurrentTime(time);
      setDuration(mediaRef.current.duration || 0);
      // 通知父组件播放时间更新
      if (onTimeUpdate) {
        onTimeUpdate(time);
      }
    }
  }, [onTimeUpdate]);

  // 播放/暂停
  const togglePlay = useCallback(async () => {
    if (!mediaRef.current) return;

    try {
      if (mediaRef.current.paused) {
        await mediaRef.current.play();
      } else {
        mediaRef.current.pause();
      }
    } catch (error) {
      console.warn('播放控制失败:', error);
    }
  }, []);

  // 跳转到指定时间
  const seekTo = useCallback((time: number) => {
    if (mediaRef.current) {
      mediaRef.current.currentTime = time;
    }
  }, []);

  // 暂停播放
  const pause = useCallback(() => {
    if (mediaRef.current && !mediaRef.current.paused) {
      mediaRef.current.pause();
    }
  }, []);

  // 获取当前播放时间
  const getCurrentTime = useCallback(() => {
    return mediaRef.current?.currentTime ?? 0;
  }, []);

  // 暴露方法给父组件
  useImperativeHandle(
    ref,
    () => ({
      seekTo,
      pause,
      getCurrentTime,
      isPlaying: () => isPlaying
    }),
    [seekTo, pause, getCurrentTime, isPlaying]
  );

  // 设置音量
  const changeVolume = useCallback((vol: number) => {
    if (mediaRef.current) {
      mediaRef.current.volume = vol;
      setVolume(vol);
    }
  }, []);

  // 设置播放速度
  const changePlaybackRate = useCallback((rate: number) => {
    if (mediaRef.current) {
      mediaRef.current.playbackRate = rate;
      setPlaybackRate(rate);
    }
  }, []);

  // 切换全屏
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (error) {
      console.warn('全屏切换失败:', error);
    }
  }, []);

  // 键盘快捷键处理
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!mediaRef.current) return;

      switch (e.key) {
        case ' ':
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekTo(Math.max(0, currentTime - 5));
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekTo(Math.min(duration, currentTime + 5));
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'Escape':
          if (isFullscreen) {
            e.preventDefault();
            toggleFullscreen();
          }
          break;
      }
    },
    [togglePlay, seekTo, currentTime, duration, toggleFullscreen, isFullscreen]
  );

  // 监听媒体事件
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    const handlePlay = (): void => {
      setIsPlaying(true);
      onPlay?.();
    };
    const handlePause = (): void => {
      setIsPlaying(false);
      onPause?.();
    };
    const handleEnded = (): void => {
      setIsPlaying(false);
      onStop?.();
    };
    const handleTimeUpdate = (): void => updateTime();
    const handleLoadedMetadata = (): void => {
      updateTime();
    };
    const handleVolumeChange = (): void => {
      if (media) setVolume(media.volume);
    };
    const handleRateChange = (): void => {
      if (media) setPlaybackRate(media.playbackRate);
    };
    const handleFullscreenChange = (): void => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    media.addEventListener('play', handlePlay);
    media.addEventListener('pause', handlePause);
    media.addEventListener('ended', handleEnded);
    media.addEventListener('timeupdate', handleTimeUpdate);
    media.addEventListener('loadedmetadata', handleLoadedMetadata);
    media.addEventListener('volumechange', handleVolumeChange);
    media.addEventListener('ratechange', handleRateChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      media.removeEventListener('play', handlePlay);
      media.removeEventListener('pause', handlePause);
      media.removeEventListener('ended', handleEnded);
      media.removeEventListener('timeupdate', handleTimeUpdate);
      media.removeEventListener('loadedmetadata', handleLoadedMetadata);
      media.removeEventListener('volumechange', handleVolumeChange);
      media.removeEventListener('ratechange', handleRateChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [updateTime, onPlay, onPause, onStop]);

  // 监听键盘事件
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // 自动播放
  useEffect(() => {
    if (autoPlay && mediaRef.current) {
      mediaRef.current.play().catch(() => {
        // 忽略自动播放失败
      });
    }
  }, [autoPlay]);

  // 鼠标移动显示/隐藏控制栏
  const handleMouseMove = useCallback(() => {
    setShowControls(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (isPlaying) {
      setShowControls(false);
    }
  }, [isPlaying]);

  // 控制栏鼠标进入/离开处理
  const handleControlsMouseEnter = useCallback(() => {
    setShowControls(true);
  }, []);

  const handleControlsMouseLeave = useCallback(() => {
    if (isPlaying) {
      // 延迟隐藏，给用户时间移动到控制栏
      setTimeout(() => {
        setShowControls(false);
      }, 100);
    }
  }, [isPlaying]);

  // 点击视频画面播放/暂停
  const handleVideoClick = useCallback(() => {
    if (type === 'video') {
      togglePlay();
    }
  }, [type, togglePlay]);

  // 双击视频画面全屏
  const handleVideoDoubleClick = useCallback(() => {
    if (type === 'video') {
      toggleFullscreen();
    }
  }, [type, toggleFullscreen]);

  if (type === 'video') {
    return (
      <div ref={containerRef} className={`relative bg-black ${className}`} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
        <video
          ref={mediaRef as React.RefObject<HTMLVideoElement>}
          src={src}
          className="w-full h-full object-contain cursor-pointer"
          playsInline
          onClick={handleVideoClick}
          onDoubleClick={handleVideoDoubleClick}
        />
        <CenterPlayButton isPlaying={isPlaying} onTogglePlay={togglePlay} />
        <MediaControls
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          volume={volume}
          playbackRate={playbackRate}
          isFullscreen={isFullscreen}
          showControls={showControls}
          onTogglePlay={togglePlay}
          onSeek={seekTo}
          onVolumeChange={changeVolume}
          onPlaybackRateChange={changePlaybackRate}
          onToggleFullscreen={toggleFullscreen}
          onMouseEnter={handleControlsMouseEnter}
          onMouseLeave={handleControlsMouseLeave}
          type="video"
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`flex flex-col items-stretch gap-3 ${className}`}>
      <audio ref={mediaRef as React.RefObject<HTMLAudioElement>} src={src} className="w-full" />
      <MediaControls
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        playbackRate={playbackRate}
        isFullscreen={false}
        showControls={true}
        onTogglePlay={togglePlay}
        onSeek={seekTo}
        onVolumeChange={changeVolume}
        onPlaybackRateChange={changePlaybackRate}
        onToggleFullscreen={() => { }}
        type="audio"
      />
      {title && <div className="text-[11px] text-muted-foreground px-1">音频预览 - {title}</div>}
    </div>
  );
});

MediaPlayer.displayName = 'MediaPlayer';
