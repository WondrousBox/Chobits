export interface VideoSpriteConfig {
  // 直接使用的资源 URL（优先级高于 localPath）
  src?: string
  // 本地绝对路径，由资源协议转换为 res://local/... 再渲染
  localPath?: string

  // 渲染尺寸
  width?: number
  height?: number

  // 媒体类型（默认 webm）
  type?: string

  // 播放属性
  autoplay?: boolean
  muted?: boolean
  playsInline?: boolean

  // 循环策略：native 使用原生 loop；early 提前回跳以避免触发自然结束
  loopStrategy?: 'native' | 'early'
  // 自定义提前回跳阈值（秒），仅在 early 策略下可选
  cutoffSeconds?: number
}

const videoSpriteConfig: VideoSpriteConfig = {
  localPath: 'F:\\Develop\\chobits\\public\\idle.webm',
  type: 'video/webm',

  // 默认尺寸
  width: 180,
  height: 220,

  // 默认播放属性
  autoplay: true,
  muted: true,
  playsInline: true,

  // 提前回跳策略，避免某些平台在自然结束时暂停
  loopStrategy: 'early',
}

export default videoSpriteConfig


