import React, { useRef, useEffect, useState, useCallback } from 'react'
import { MediaControls } from './MediaControls'

interface MediaPlayerProps {
  src: string
  type: 'video' | 'audio'
  title?: string
  autoPlay?: boolean
  className?: string
}

export const MediaPlayer: React.FC<MediaPlayerProps> = ({
  src,
  type,
  title,
  autoPlay = false,
  className = ''
}) => {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)

  // 更新播放状态
  const updatePlayState = useCallback(() => {
    if (mediaRef.current) {
      setIsPlaying(!mediaRef.current.paused)
    }
  }, [])

  // 更新时间信息
  const updateTime = useCallback(() => {
    if (mediaRef.current) {
      setCurrentTime(mediaRef.current.currentTime)
      setDuration(mediaRef.current.duration || 0)
    }
  }, [])

  // 播放/暂停
  const togglePlay = useCallback(async () => {
    if (!mediaRef.current) return
    
    try {
      if (mediaRef.current.paused) {
        await mediaRef.current.play()
      } else {
        mediaRef.current.pause()
      }
    } catch (error) {
      console.warn('播放控制失败:', error)
    }
  }, [])

  // 跳转到指定时间
  const seekTo = useCallback((time: number) => {
    if (mediaRef.current) {
      mediaRef.current.currentTime = time
    }
  }, [])

  // 设置音量
  const changeVolume = useCallback((vol: number) => {
    if (mediaRef.current) {
      mediaRef.current.volume = vol
      setVolume(vol)
    }
  }, [])

  // 设置播放速度
  const changePlaybackRate = useCallback((rate: number) => {
    if (mediaRef.current) {
      mediaRef.current.playbackRate = rate
      setPlaybackRate(rate)
    }
  }, [])

  // 切换全屏
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return

    try {
      if (!document.fullscreenElement) {
        containerRef.current.requestFullscreen()
        setIsFullscreen(true)
      } else {
        document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch (error) {
      console.warn('全屏切换失败:', error)
    }
  }, [])

  // 键盘快捷键处理
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!mediaRef.current) return

    switch (e.key) {
      case ' ':
      case 'Space':
        e.preventDefault()
        togglePlay()
        break
      case 'ArrowLeft':
        e.preventDefault()
        seekTo(Math.max(0, currentTime - 5))
        break
      case 'ArrowRight':
        e.preventDefault()
        seekTo(Math.min(duration, currentTime + 5))
        break
      case 'f':
      case 'F':
        e.preventDefault()
        toggleFullscreen()
        break
      case 'Escape':
        if (isFullscreen) {
          e.preventDefault()
          toggleFullscreen()
        }
        break
    }
  }, [togglePlay, seekTo, currentTime, duration, type, toggleFullscreen, isFullscreen])

  // 监听媒体事件
  useEffect(() => {
    const media = mediaRef.current
    if (!media) return

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleTimeUpdate = () => updateTime()
    const handleLoadedMetadata = () => updateTime()
    const handleVolumeChange = () => {
      if (media) setVolume(media.volume)
    }
    const handleRateChange = () => {
      if (media) setPlaybackRate(media.playbackRate)
    }
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    media.addEventListener('play', handlePlay)
    media.addEventListener('pause', handlePause)
    media.addEventListener('timeupdate', handleTimeUpdate)
    media.addEventListener('loadedmetadata', handleLoadedMetadata)
    media.addEventListener('volumechange', handleVolumeChange)
    media.addEventListener('ratechange', handleRateChange)
    document.addEventListener('fullscreenchange', handleFullscreenChange)

    return () => {
      media.removeEventListener('play', handlePlay)
      media.removeEventListener('pause', handlePause)
      media.removeEventListener('timeupdate', handleTimeUpdate)
      media.removeEventListener('loadedmetadata', handleLoadedMetadata)
      media.removeEventListener('volumechange', handleVolumeChange)
      media.removeEventListener('ratechange', handleRateChange)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [updateTime])

  // 监听键盘事件
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // 自动播放
  useEffect(() => {
    if (autoPlay && mediaRef.current) {
      mediaRef.current.play().catch(() => {
        // 忽略自动播放失败
      })
    }
  }, [autoPlay])

  // 鼠标移动显示/隐藏控制栏
  const handleMouseMove = useCallback(() => {
    setShowControls(true)
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (isPlaying) {
      setShowControls(false)
    }
  }, [isPlaying])

  // 控制栏鼠标进入/离开处理
  const handleControlsMouseEnter = useCallback(() => {
    setShowControls(true)
  }, [])

  const handleControlsMouseLeave = useCallback(() => {
    if (isPlaying) {
      // 延迟隐藏，给用户时间移动到控制栏
      setTimeout(() => {
        setShowControls(false)
      }, 100)
    }
  }, [isPlaying])

  // 点击视频画面播放/暂停
  const handleVideoClick = useCallback(() => {
    if (type === 'video') {
      togglePlay()
    }
  }, [type, togglePlay])

  if (type === 'video') {
    return (
      <div 
        ref={containerRef}
        className={`relative bg-black ${className}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <video
          ref={mediaRef as React.RefObject<HTMLVideoElement>}
          src={src}
          className="w-full h-full object-contain cursor-pointer"
          playsInline
          onClick={handleVideoClick}
        />
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
    )
  }

  return (
    <div ref={containerRef} className={`flex flex-col items-stretch gap-3 ${className}`}>
      <audio
        ref={mediaRef as React.RefObject<HTMLAudioElement>}
        src={src}
        className="w-full"
      />
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
        onToggleFullscreen={() => {}}
        type="audio"
      />
      {title && (
        <div className="text-[11px] text-muted-foreground px-1">
          音频预览 - {title}
        </div>
      )}
    </div>
  )
}