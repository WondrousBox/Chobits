import { useEffect, useMemo, useRef } from 'react'
import videoSpriteConfig from '@/config/videoSprite'
import { makeResSrc } from '@/lib/resourceProtocol'

export default function VideoSprite() {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    // Ensure autoplay resumes after programmatic seeks on some browsers
    const onCanPlay = () => {
      v.play().catch(() => {})
    }
    v.addEventListener('canplay', onCanPlay)
    return () => {
      v.removeEventListener('canplay', onCanPlay)
    }
  }, [])

  const handleTimeUpdate = () => {
    const v = videoRef.current
    if (!v) return
    const d = v.duration
    if (!Number.isFinite(d) || d <= 0) return

    if (videoSpriteConfig.loopStrategy === 'early') {
      const remaining = d - v.currentTime
      const cutoffBase = d > 1 ? 1 : Math.max(0.05, Math.min(0.2, d * 0.2))
      const cutoff = Number.isFinite(videoSpriteConfig.cutoffSeconds || NaN)
        ? Math.max(0.01, Math.min(d * 0.9, videoSpriteConfig.cutoffSeconds as number))
        : cutoffBase
      if (remaining <= cutoff + 1e-3) {
        v.currentTime = 0
        v.play().catch(() => {})
      }
    }
  }

  const source = useMemo(() => {
    if (videoSpriteConfig.src) return videoSpriteConfig.src
    if (videoSpriteConfig.localPath) return makeResSrc(videoSpriteConfig.localPath)
    return '/idle.webm'
  }, [])

  return (
    <video
      ref={videoRef}
      style={{ width: videoSpriteConfig.width ?? 180, height: videoSpriteConfig.height ?? 220, userSelect: 'none' }}
      autoPlay={videoSpriteConfig.autoplay ?? true}
      muted={videoSpriteConfig.muted ?? true}
      playsInline={videoSpriteConfig.playsInline ?? true}
      loop={videoSpriteConfig.loopStrategy === 'native'}
      onTimeUpdate={handleTimeUpdate}
    >
      <source src={source} type={videoSpriteConfig.type || 'video/webm'} />
    </video>
  )
}