import { useEffect, useRef } from 'react'

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

    // Jump back to start before the last second to avoid hitting the natural end
    const remaining = d - v.currentTime
    // If the video is very short (< 1s), use a small cutoff to still loop early
    const cutoff = d > 1 ? 1 : Math.max(0.05, Math.min(0.2, d * 0.2))
    if (remaining <= cutoff + 1e-3) {
      v.currentTime = 0
      // Keep playing seamlessly
      v.play().catch(() => {})
    }
  }

  return (
    <video
      ref={videoRef}
      style={{ width: 180, height: 220, userSelect: 'none' }}
      autoPlay
      muted
      playsInline
      // custom early-loop, so no native loop
      onTimeUpdate={handleTimeUpdate}
    >
      <source src="/idle.webm" type="video/webm" />
    </video>
  )
}