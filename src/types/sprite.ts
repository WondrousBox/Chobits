export type LoopStrategy = 'native' | 'early'

export interface SpriteSource {
  // 直接可用的 URL（优先级高）
  src?: string
  // 本地绝对路径（将通过 res://local/ 访问）
  localPath?: string
  // 媒体类型，例如 video/webm、video/mp4
  type?: string
}

export interface SpriteAnimationMeta {
  id: string
  title: string
  description?: string
  tags?: string[]
  // 可选的封面图
  coverSrc?: string
}

export interface SpritePlaybackOptions {
  width?: number
  height?: number
  autoplay?: boolean
  muted?: boolean
  playsInline?: boolean
  loopStrategy?: LoopStrategy
  cutoffSeconds?: number
  // 可选的时长（毫秒），未提供时以 <video> 元数据为准
  durationMs?: number
}

export interface SpriteAnimation extends SpritePlaybackOptions {
  meta: SpriteAnimationMeta
  source: SpriteSource
}


