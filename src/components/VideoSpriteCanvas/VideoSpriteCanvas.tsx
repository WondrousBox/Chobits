import React, { useEffect, useRef } from 'react'
import { VideoSpriteManager, type VideoSpriteConfig, type VideoSprite } from '../../lib/VideoSpriteManager'

// 描述一个需要加载的源及其对应要创建的精灵参数（可选）
export interface SpriteSource {
  id: string
  url: string
  preload?: boolean
  muted?: boolean
  loop?: boolean
  playbackRate?: number
  // 单独的精灵配置（不含 sourceId）
  sprite?: Omit<VideoSpriteConfig, 'sourceId'>
}

export interface VideoSpriteCanvasProps {
  width: number
  height: number
  fps?: number
  sources: SpriteSource[]
  className?: string
  style?: React.CSSProperties
  autoAttach?: boolean // 默认 true; 允许外层自行调用 manager.attachCanvas
  onReady?: (manager: ReturnType<typeof VideoSpriteManager.get>) => void
}

/**
 * 通用视频精灵渲染层：
 * - 管理 Canvas 与 DPR 尺寸
 * - 批量加载视频源并创建精灵
 * - 卸载时移除精灵，避免内存泄漏
 */
export const VideoSpriteCanvas: React.FC<VideoSpriteCanvasProps> = ({
  width,
  height,
  fps = 30,
  sources,
  className,
  style,
  autoAttach = true,
  onReady
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const createdSpritesRef = useRef<VideoSprite[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const mgr = VideoSpriteManager.get()
    if (autoAttach) mgr.attachCanvas(canvas, width, height)
    mgr.setFPS(fps)

    let cancelled = false
    // 加载全部源
    Promise.all(sources.map(s => mgr.loadSource({
      id: s.id,
      url: s.url,
      preload: s.preload ?? true,
      muted: s.muted ?? true,
      loop: s.loop ?? true,
      playbackRate: s.playbackRate
    }))).then(() => {
      if (cancelled) return
      // 逐个创建 sprite
      sources.forEach(s => {
        try {
          const cfg: VideoSpriteConfig = {
            sourceId: s.id,
            x: (s.sprite?.x ?? width / 2),
            y: (s.sprite?.y ?? height / 2),
            anchorX: s.sprite?.anchorX ?? 0.5,
            anchorY: s.sprite?.anchorY ?? 0.5,
            width: s.sprite?.width ?? width,
            height: s.sprite?.height ?? height,
            autoplay: s.sprite?.autoplay ?? true,
            fadeInMs: s.sprite?.fadeInMs ?? 600,
            opacity: s.sprite?.opacity ?? 1,
            loop: s.sprite?.loop ?? true,
            playbackRate: s.sprite?.playbackRate ?? 1,
            rotation: s.sprite?.rotation ?? 0,
            scale: s.sprite?.scale ?? 1,
            visible: s.sprite?.visible ?? true,
            zIndex: s.sprite?.zIndex ?? 0
          }
          const sprite = mgr.createSprite(cfg)
            ; (createdSpritesRef.current).push(sprite)
        } catch (e) {
          console.warn('[VideoSpriteCanvas] create sprite failed:', e)
        }
      })
      onReady?.(mgr)
    })

    return () => {
      cancelled = true
      createdSpritesRef.current.forEach(sp => { try { sp.remove() } catch { } })
      createdSpritesRef.current = []
    }
  }, [width, height, fps, sources, autoAttach, onReady])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width, height, ...style }}
    />
  )
}

export default VideoSpriteCanvas
