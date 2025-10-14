// Types for AI Assistant message catalog
// Extendable category types for clarity and autocompletion
export type MessageCategory =
  | 'idle'            // 闲置状态
  | 'click'           // 点击交互
  | 'hover'           // 悬停交互
  | 'focus'           // 聚焦交互
  | 'input'           // 输入交互
  | 'scroll'          // 滚动交互
  | 'press'           // 长按交互
  | 'release'         // 释放交互
  | 'hold'            // 持续交互
  | 'error'           // 错误反馈
  | 'loading'         // 加载中
  | 'success'         // 成功反馈
  | 'failure'         // 失败反馈
  | 'info'            // 信息反馈
  | 'warning'         // 警告反馈
  | 'celebrate'       // 庆祝/鼓励
  | 'question'        // 提问/疑问
  | 'answer'          // 回答/解答
  | 'search'          // 搜索相关
  | 'navigation'      // 导航相关
  | 'selection'       // 选择相关
  | 'confirmation'    // 确认相关
  | 'cancellation'    // 取消相关
  | 'upload'          // 上传相关
  | 'download'        // 下载相关
  | 'processing'      // 处理中
  | 'waiting'         // 等待中
  | 'timeout'         // 超时
  | 'retry'           // 重试
  | 'connect'         // 连接相关
  | 'disconnect'      // 断开连接
  | 'sync'            // 同步相关
  | 'update'          // 更新相关
  | 'install'         // 安装相关
  | 'remove'          // 移除相关
  | 'configure'       // 配置相关
  | 'settings'        // 设置相关
  | 'profile'         // 用户资料相关
  | 'message'         // 消息通知相关
  | 'alert'           // 警报相关
  | 'reminder'        // 提醒相关 / 温馨提醒
  | 'event'           // 事件相关
  | 'task'            // 任务相关 / 执行任务中的反馈
  | 'drag'            // 拖拽提示/状态
  | 'drop'            // 文件放下
  | 'recommend'       // 推荐/建议
  | 'tip'             // 提示
  | 'system'          // 系统/错误
  | 'welcome'         // 初始欢迎
  | 'custom'          // 自定义文本

// 精灵动画使用的推荐事件分类子集（从 MessageCategory 中筛选），按功能分组
export const SpriteEventGroups = {
  interaction: [
    'idle', 'hover', 'click', 'focus', 'input', 'scroll', 'drag', 'drop', 'selection',
  ],
  feedback: [
    'success', 'failure', 'error', 'warning', 'info', 'celebrate', 'tip', 'recommend',
  ],
  status: [
    'loading', 'processing', 'waiting', 'timeout', 'retry',
  ],
  workflow: [
    'confirmation', 'cancellation', 'task', 'update', 'install', 'remove', 'configure', 'settings',
  ],
  network: [
    'connect', 'disconnect', 'sync', 'upload', 'download',
  ],
  assist: [
    'question', 'answer', 'search', 'navigation', 'message', 'alert', 'reminder',
  ],
  system: [
    'system', 'welcome', 'event', 'profile',
  ],
} as const

// 展平所有推荐事件（保持去重）
export const SPRITE_EVENT_TYPES = Array.from(
  new Set(
    Object.values(SpriteEventGroups).flat()
  )
) as MessageCategory[]

// ===== 扩展：桌面精灵特有的“情绪 / 动作 / 过渡 / 循环表现 / 季节 / 特效” 分类 =====
// 这些不一定对应可见的消息语义，但用于动画挑选与编排
export const SpriteEmotionTypes = [
  'happy', 'joy', 'excited', 'proud', 'shy', 'embarrassed', 'sad', 'bored', 'angry', 'annoyed', 'confused', 'curious', 'surprised', 'panic', 'scared', 'tired', 'sleep', 'wake', 'thinking', 'focusMode',
] as const

export const SpriteActionTypes = [
  'walk', 'run', 'jump', 'sit', 'stand', 'wave', 'nod', 'shakeHead', 'dance', 'spin', 'fall', 'climb', 'slide', 'attack', 'defend', 'point', 'type', 'read', 'write', 'lookLeft', 'lookRight', 'lookUp', 'lookDown',
] as const

export const SpriteTransitionTypes = [
  'appear', 'disappear', 'enter', 'exit', 'fadeIn', 'fadeOut', 'spawn', 'despawn', 'teleport', 'transform', 'powerUp', 'powerDown',
] as const

export const SpriteAmbientLoopTypes = [
  'breath', 'blink', 'float', 'idle2', 'idle3', 'loadingLoop', 'successLoop', 'errorLoop', 'charging', 'saving',
] as const

export const SpriteSeasonalTypes = [
  'holiday', 'newYear', 'spring', 'summer', 'autumn', 'winter', 'halloween', 'christmas', 'birthday',
] as const

export const SpriteSpecialEffectTypes = [
  'glow', 'pulse', 'sparkle', 'burst', 'flare', 'aura', 'shield', 'trail', 'impact', 'hit',
] as const

export const AdditionalSpriteEventGroups = {
  emotion: SpriteEmotionTypes,
  action: SpriteActionTypes,
  transition: SpriteTransitionTypes,
  ambient: SpriteAmbientLoopTypes,
  seasonal: SpriteSeasonalTypes,
  special: SpriteSpecialEffectTypes,
} as const

// 合并全部（消息子集 + 扩展分类）形成统一的精灵事件类型枚举
export const ALL_SPRITE_EVENT_TYPES = Array.from(
  new Set([
    ...SPRITE_EVENT_TYPES,
    ...SpriteEmotionTypes,
    ...SpriteActionTypes,
    ...SpriteTransitionTypes,
    ...SpriteAmbientLoopTypes,
    ...SpriteSeasonalTypes,
    ...SpriteSpecialEffectTypes,
  ])
) as ReadonlyArray<string>

// 精灵事件类型：消息子集 + 扩展 + 可选 'custom'
export type SpriteEventType = (typeof ALL_SPRITE_EVENT_TYPES)[number] | 'custom'

export interface MessageContext {
  // Optional runtime parameters to format messages
  count?: number
  names?: string[]
  singleName?: string
}

export type MessageProducer = (ctx?: MessageContext) => string

export type MessageCatalog = {
  [K in MessageCategory]?: {
    // canonical messages (deterministic)
    default?: MessageProducer | string
    // optional variants to add personality; random pick if requested
    variants?: Array<MessageProducer | string>
  }
}

export interface MessagesProvider {
  t: (category: MessageCategory, ctx?: MessageContext, opts?: { variant?: boolean }) => string
}

export interface SpriteAnimation {
  width?: number
  height?: number
  autoplay?: boolean
  muted?: boolean
  playsInline?: boolean
  loopStrategy?: 'native' | 'early'
  cutoffSeconds?: number
  // 可选的时长（毫秒），未提供时以 <video> 元数据为准
  durationMs?: number
  meta: {
    id: string
    title: string
    description?: string
    tags?: string[]
    // 可选的封面图
    coverSrc?: string
    // 事件触发分类（来自 SpriteEventType）
    eventType?: SpriteEventType
  }
  source: {
    // 直接可用的 URL（优先级高）
    src?: string
    // 本地绝对路径（将通过 res://local/ 访问）
    localPath?: string
    // 媒体类型，例如 video/webm、video/mp4
    type?: string
  }
}
