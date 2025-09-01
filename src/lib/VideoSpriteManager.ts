/*
 * VideoSpriteManager
 * 统一视频精灵管理：
 * - 加载/缓存带透明通道的 WebM (VP8/VP9 Alpha)
 * - 多 Sprite 排序绘制到单一 Canvas (Canvas2D)
 * - 按需自动启动 / 停止渲染循环（节能）
 * - 支持精灵的播放控制、淡入淡出、缩放、旋转、透明度
 * - 后续可替换为 WebGL renderer 保持接口稳定
 */

export interface VideoSourceOptions {
  id: string
  url: string
  preload?: boolean
  muted?: boolean
  loop?: boolean // 仅影响源级 <video> loop（Sprite 也可单独设 loop）
  playbackRate?: number
  crossOrigin?: '' | 'anonymous' | 'use-credentials'
}

export interface VideoSpriteConfig {
  sourceId: string
  id?: string
  x?: number
  y?: number
  width?: number
  height?: number
  scale?: number
  rotation?: number // 弧度
  opacity?: number
  autoplay?: boolean
  loop?: boolean
  playbackRate?: number
  anchorX?: number // 0~1 相对锚点（默认 0.5）
  anchorY?: number // 0~1
  zIndex?: number
  visible?: boolean
  fadeInMs?: number
}

export interface VideoSprite extends Required<Pick<VideoSpriteConfig,
  'sourceId' | 'x' | 'y' | 'width' | 'height' | 'scale' | 'rotation' | 'opacity' | 'loop' | 'playbackRate' | 'anchorX' | 'anchorY' | 'zIndex' | 'visible'>> {
  id: string
  autoplay: boolean
  fadeInMs: number
  _createdAt: number
  _fadeStart?: number
  play(): void
  pause(): void
  stop(): void
  isPlaying(): boolean
  setOpacity(v: number): void
  setPosition(x: number, y: number): void
  setSize(w: number, h: number): void
  setZIndex(z: number): void
  remove(): void
}

interface InternalSprite extends VideoSprite {
  _video: HTMLVideoElement
  _playing: boolean
}

class VideoSpriteManagerImpl {
  private static _instance: VideoSpriteManagerImpl
  static get(): VideoSpriteManagerImpl { return this._instance || (this._instance = new VideoSpriteManagerImpl()) }

  private sources = new Map<string, HTMLVideoElement>()
  private sourcePromises = new Map<string, Promise<HTMLVideoElement>>()
  private sprites: InternalSprite[] = []
  private canvas?: HTMLCanvasElement
  private ctx?: CanvasRenderingContext2D
  private running = false
  private rafId = 0
  private dpr = 1
  private lastFrameTime = 0
  private targetFPS = 60
  private frameInterval = 1000 / this.targetFPS

  attachCanvas(canvas: HTMLCanvasElement, logicalWidth?: number, logicalHeight?: number) {
    this.canvas = canvas
    this.dpr = window.devicePixelRatio || 1
    const w = logicalWidth ?? canvas.clientWidth
    const h = logicalHeight ?? canvas.clientHeight
    canvas.width = Math.round(w * this.dpr)
    canvas.height = Math.round(h * this.dpr)
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
    this.ctx = canvas.getContext('2d') || undefined
  }

  resize(width: number, height: number) {
    if (!this.canvas) return
    this.dpr = window.devicePixelRatio || 1
    this.canvas.width = Math.round(width * this.dpr)
    this.canvas.height = Math.round(height * this.dpr)
    this.canvas.style.width = width + 'px'
    this.canvas.style.height = height + 'px'
  }

  setFPS(fps: number) {
    this.targetFPS = Math.max(15, Math.min(120, fps))
    this.frameInterval = 1000 / this.targetFPS
  }

  loadSource(opts: VideoSourceOptions): Promise<HTMLVideoElement> {
    if (this.sources.has(opts.id)) return Promise.resolve(this.sources.get(opts.id)!)
    if (this.sourcePromises.has(opts.id)) return this.sourcePromises.get(opts.id)!

    const p = new Promise<HTMLVideoElement>((resolve, reject) => {
      const v = document.createElement('video')
      v.src = opts.url
      v.playsInline = true
      v.muted = opts.muted ?? true
      v.loop = opts.loop ?? true
      if (opts.crossOrigin) v.crossOrigin = opts.crossOrigin
      if (opts.playbackRate) v.playbackRate = opts.playbackRate
      v.preload = opts.preload === false ? 'metadata' : 'auto'
      const onCanPlay = () => { cleanup(); resolve(v) }
      const onError = () => { cleanup(); reject(new Error(`Failed to load video ${opts.id}`)) }
      const cleanup = () => { v.removeEventListener('canplay', onCanPlay); v.removeEventListener('error', onError) }
      v.addEventListener('canplay', onCanPlay)
      v.addEventListener('error', onError)
      // 立即开始加载
      v.load()
    }).then(v => {
      this.sources.set(opts.id, v)
      return v
    })

    this.sourcePromises.set(opts.id, p)
    return p
  }

  createSprite(cfg: VideoSpriteConfig): VideoSprite {
    const src = this.sources.get(cfg.sourceId)
    if (!src) throw new Error(`Source ${cfg.sourceId} not loaded. Call loadSource first.`)

    const id = cfg.id || `${cfg.sourceId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const sprite: InternalSprite = {
      id,
      sourceId: cfg.sourceId,
      x: cfg.x ?? 0,
      y: cfg.y ?? 0,
      width: (cfg.width ?? (src.videoWidth || 100)),
      height: (cfg.height ?? (src.videoHeight || 100)),
      scale: cfg.scale ?? 1,
      rotation: cfg.rotation ?? 0,
      opacity: cfg.opacity ?? 1,
      autoplay: cfg.autoplay ?? true,
      loop: cfg.loop ?? true,
      playbackRate: cfg.playbackRate ?? 1,
      anchorX: cfg.anchorX ?? 0.5,
      anchorY: cfg.anchorY ?? 0.5,
      zIndex: cfg.zIndex ?? 0,
      visible: cfg.visible ?? true,
      fadeInMs: cfg.fadeInMs ?? 0,
      _createdAt: performance.now(),
      _video: src,
      _playing: false,
      play: () => { sprite._playing = true; if (src.paused) { void src.play().catch(()=>{}) } this.ensureRunning() },
      pause: () => { sprite._playing = false; this.checkStop() },
      stop: () => { sprite._playing = false; sprite._video.currentTime = 0; this.checkStop() },
      isPlaying: () => sprite._playing,
      setOpacity: (v: number) => { sprite.opacity = v },
      setPosition: (x: number, y: number) => { sprite.x = x; sprite.y = y },
      setSize: (w: number, h: number) => { sprite.width = w; sprite.height = h },
      setZIndex: (z: number) => { sprite.zIndex = z; this.sortSprites() },
      remove: () => this.removeSprite(sprite)
    }

    // 克隆一个独立 <video> 以便不同精灵有不同播放控制（否则会共用播放头）
    sprite._video = src.cloneNode(true) as HTMLVideoElement
    sprite._video.loop = sprite.loop
    sprite._video.playbackRate = sprite.playbackRate
    sprite._video.muted = true
    sprite._video.playsInline = true
    if (sprite.autoplay) { void sprite._video.play().catch(()=>{}) ; sprite._playing = true }

    this.sprites.push(sprite)
    this.sortSprites()
    this.ensureRunning()
    return sprite
  }

  removeSprite(sprite: InternalSprite | VideoSprite) {
    const idx = this.sprites.findIndex(s => s.id === sprite.id)
    if (idx >= 0) {
      const [sp] = this.sprites.splice(idx, 1)
      sp._video.pause()
    }
    this.checkStop()
  }

  private sortSprites() {
    this.sprites.sort((a, b) => a.zIndex - b.zIndex || a._createdAt - b._createdAt)
  }

  private ensureRunning() {
    if (this.running) return
    if (!this.canvas || !this.ctx) return
    this.running = true
    this.lastFrameTime = performance.now()
    const loop = (now: number) => {
      this.rafId = requestAnimationFrame(loop)
      const dt = now - this.lastFrameTime
      if (dt < this.frameInterval) return
      this.lastFrameTime = now - (dt % this.frameInterval)
      this.render()
    }
    this.rafId = requestAnimationFrame(loop)
  }

  private checkStop() {
    if (this.sprites.some(s => s._playing && s.visible)) return
    // 无播放中的精灵时仍然保持低频渲染一次清屏
    if (this.running) {
      cancelAnimationFrame(this.rafId)
      this.running = false
      this.render(true)
    }
  }

  private clear() {
    if (!this.ctx || !this.canvas) return
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  private render(force = false) {
    if (!this.ctx || !this.canvas) return
    const ctx = this.ctx
    const w = this.canvas.width
    const h = this.canvas.height
    ctx.save()
    ctx.scale(this.dpr, this.dpr) // 逻辑尺寸变换回 1:1
    ctx.clearRect(0, 0, w, h)

    const now = performance.now()

    for (const s of this.sprites) {
      if (!s.visible) continue
      const v = s._video
      if (s._playing && v.paused) { void v.play().catch(()=>{}) }
      if (v.readyState < 2) continue

      // 计算淡入
      let alpha = s.opacity
      if (s.fadeInMs > 0) {
        const t = (now - s._createdAt) / s.fadeInMs
        alpha *= Math.min(1, Math.max(0, t))
      }
      if (alpha <= 0) continue

      const drawW = s.width * s.scale
      const drawH = s.height * s.scale
      const ox = drawW * s.anchorX
      const oy = drawH * s.anchorY
      const dx = s.x
      const dy = s.y

      ctx.save()
      ctx.globalAlpha = alpha
      ctx.translate(dx, dy)
      if (s.rotation) ctx.rotate(s.rotation)
      ctx.translate(-ox, -oy)
      ctx.drawImage(v, 0, 0, drawW, drawH)
      ctx.restore()
    }

    ctx.restore()
    if (force) return
  }
}

export const VideoSpriteManager = VideoSpriteManagerImpl

// React Hook 便捷封装
import { useEffect, useRef } from 'react'
export function useVideoSprite(sourceId: string, cfg?: Omit<VideoSpriteConfig, 'sourceId'>) {
  const spriteRef = useRef<VideoSprite | null>(null)
  useEffect(() => {
    const mgr = VideoSpriteManager.get()
    if (!mgr) return
    if (spriteRef.current) return
    try {
      spriteRef.current = mgr.createSprite({ sourceId, ...(cfg || {}) })
    } catch (e) {
      console.warn(e)
    }
    return () => { spriteRef.current?.remove(); spriteRef.current = null }
  }, [sourceId])
  return spriteRef
}
