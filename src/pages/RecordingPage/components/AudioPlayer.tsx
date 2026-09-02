import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TbPlayerPause, TbPlayerPlay, TbVolume, TbVolumeOff } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

interface AudioPlayerProps {
  audioFilePath: string;
  isSubtitleMode?: boolean;
  onTimeUpdate?: (currentTime: number) => void;
  className?: string;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioFilePath, isSubtitleMode = false, onTimeUpdate, className = '' }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // 将 PCM 文件路径转换为可播放的 URL
  const audioUrl = useMemo(() => {
    if (!audioFilePath) return null;
    // 使用 resource:// 协议访问本地文件
    return `resource://${audioFilePath.replace(/\\/g, '/')}`;
  }, [audioFilePath]);

  // 初始化音频
  useEffect(() => {
    if (!audioUrl) return;

    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);
    });

    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio.currentTime);
      onTimeUpdate?.(audio.currentTime);
    });

    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      setCurrentTime(0);
    });

    audio.addEventListener('error', (e) => {
      console.error('音频加载失败:', e);
    });

    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [audioUrl, onTimeUpdate]);

  // 播放/暂停
  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  // 跳转
  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const newTime = parseFloat(e.target.value);
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  }, []);

  // 音量
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const newVolume = parseFloat(e.target.value);
    audioRef.current.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  }, []);

  // 静音切换
  const toggleMute = useCallback(() => {
    if (!audioRef.current) return;
    const newMuted = !isMuted;
    audioRef.current.muted = newMuted;
    setIsMuted(newMuted);
  }, [isMuted]);

  // 格式化时间
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!audioUrl) {
    return null;
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-2 ${className}`}>
      {/* 播放/暂停按钮 */}
      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={togglePlay}>
        {isPlaying ? <TbPlayerPause className={`h-4 w-4 ${isSubtitleMode ? 'text-white' : ''}`} /> : <TbPlayerPlay className={`h-4 w-4 ${isSubtitleMode ? 'text-white' : ''}`} />}
      </Button>

      {/* 时间显示 */}
      <span className={`text-xs tabular-nums w-10 ${isSubtitleMode ? 'text-white/70' : 'text-muted-foreground'}`}>{formatTime(currentTime)}</span>

      {/* 进度条 */}
      <input type="range" className="flex-1 h-1 accent-primary cursor-pointer" value={currentTime} max={duration || 100} step={0.1} onChange={handleSeek} />

      {/* 总时长 */}
      <span className={`text-xs tabular-nums w-10 ${isSubtitleMode ? 'text-white/70' : 'text-muted-foreground'}`}>{formatTime(duration)}</span>

      {/* 音量控制 */}
      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={toggleMute}>
        {isMuted || volume === 0 ? <TbVolumeOff className={`h-4 w-4 ${isSubtitleMode ? 'text-white' : ''}`} /> : <TbVolume className={`h-4 w-4 ${isSubtitleMode ? 'text-white' : ''}`} />}
      </Button>

      <input type="range" className="w-16 h-1 accent-primary cursor-pointer" value={isMuted ? 0 : volume} max={1} step={0.01} onChange={handleVolumeChange} />
    </div>
  );
};
