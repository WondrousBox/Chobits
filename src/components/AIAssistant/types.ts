// Types for AI Assistant message catalog
// Extendable category types for clarity and autocompletion
export type MessageCategory =
  | 'idle' // 闲置状态
  | 'hover' // 悬停交互
  | 'click' // 点击交互
  | 'focus' // 聚焦交互
  | 'input' // 输入交互
  | 'scroll' // 滚动交互
  | 'press' // 长按交互
  | 'release' // 释放交互
  | 'hold' // 持续交互
  | 'error' // 错误反馈
  | 'loading' // 加载中
  | 'success' // 成功反馈
  | 'failure' // 失败反馈
  | 'info' // 信息反馈
  | 'warning' // 警告反馈
  | 'celebrate' // 庆祝/鼓励
  | 'question' // 提问/疑问
  | 'answer' // 回答/解答
  | 'search' // 搜索相关
  | 'navigation' // 导航相关
  | 'selection' // 选择相关
  | 'confirmation' // 确认相关
  | 'cancellation' // 取消相关
  | 'upload' // 上传相关
  | 'download' // 下载相关
  | 'processing' // 处理中
  | 'waiting' // 等待中
  | 'timeout' // 超时
  | 'retry' // 重试
  | 'connect' // 连接相关
  | 'disconnect' // 断开连接
  | 'sync' // 同步相关
  | 'update' // 更新相关
  | 'install' // 安装相关
  | 'remove' // 移除相关
  | 'configure' // 配置相关
  | 'settings' // 设置相关
  | 'profile' // 用户资料相关
  | 'message' // 消息通知相关
  | 'alert' // 警报相关
  | 'reminder' // 提醒相关 / 温馨提醒
  | 'event' // 事件相关
  | 'task' // 任务相关 / 执行任务中的反馈
  | 'drag' // 拖拽提示/状态
  | 'drop' // 拖拽精灵后松开鼠标（放置精灵）
  | 'fileDragOver' // 文件拖拽悬停在精灵上方
  | 'fileDrop' // 文件放置
  | 'recommend' // 推荐/建议
  | 'tip' // 提示
  | 'system' // 系统/错误
  | 'welcome' // 初始欢迎
  | 'custom'; // 自定义文本

// 精灵动画使用的事件分类，按功能分组（包含消息语义和动画事件）
export const SpriteEventGroups = {
  interaction: ['idle', 'hover', 'click', 'focus', 'input', 'scroll', 'drag', 'drop', 'fileDragOver', 'fileDrop', 'selection'],
  feedback: ['success', 'failure', 'error', 'warning', 'info', 'celebrate', 'tip', 'recommend'],
  status: ['loading', 'processing', 'waiting', 'timeout', 'retry'],
  workflow: ['confirmation', 'cancellation', 'task', 'update', 'install', 'remove', 'configure', 'settings'],
  network: ['connect', 'disconnect', 'sync', 'upload', 'download'],
  assist: ['question', 'answer', 'search', 'navigation', 'message', 'alert', 'reminder'],
  system: ['system', 'welcome', 'event', 'profile'],
  emotion: [
    'happy',
    'joy',
    'excited',
    'proud',
    'shy',
    'embarrassed',
    'sad',
    'bored',
    'angry',
    'annoyed',
    'confused',
    'curious',
    'surprised',
    'panic',
    'scared',
    'tired',
    'sleep',
    'wake',
    'thinking',
    'focusMode'
  ],
  action: [
    'walk',
    'run',
    'jump',
    'sit',
    'stand',
    'wave',
    'nod',
    'shakeHead',
    'dance',
    'spin',
    'fall',
    'climb',
    'slide',
    'attack',
    'defend',
    'point',
    'type',
    'read',
    'write',
    'lookLeft',
    'lookRight',
    'lookUp',
    'lookDown'
  ],
  transition: ['appear', 'disappear', 'enter', 'exit', 'fadeIn', 'fadeOut', 'spawn', 'despawn', 'teleport', 'transform', 'powerUp', 'powerDown'],
  /**
   * 衔接动画 (connector)
   * 用于不同动作/状态之间的平滑过渡，包括：
   * - 方向转换：turnLeft, turnRight, turnBack, turnFront, turnAround
   * - 姿态切换：standToSit, sitToStand, idleToWalk, walkToIdle, walkToRun, runToWalk
   * - 朝向调整：faceLeft, faceRight, faceUp, faceDown, faceCamera
   * - 准备动作：readyStance, windUp, coolDown, recover
   */
  connector: [
    // 方向转换
    'turnLeft',
    'turnRight',
    'turnBack',
    'turnFront',
    'turnAround',
    // 姿态切换
    'standToSit',
    'sitToStand',
    'idleToWalk',
    'walkToIdle',
    'walkToRun',
    'runToWalk',
    // 朝向调整
    'faceLeft',
    'faceRight',
    'faceUp',
    'faceDown',
    'faceCamera',
    // 准备/恢复动作
    'readyStance',
    'windUp',
    'coolDown',
    'recover'
  ],
  ambient: ['breath', 'blink', 'float', 'idle2', 'idle3', 'loadingLoop', 'successLoop', 'errorLoop', 'charging', 'saving'],
  seasonal: ['holiday', 'newYear', 'spring', 'summer', 'autumn', 'winter', 'halloween', 'christmas', 'birthday'],
  special: ['glow', 'pulse', 'sparkle', 'burst', 'flare', 'aura', 'shield', 'trail', 'impact', 'hit']
} as const;

// 展平所有推荐事件（保持去重）
export const SPRITE_EVENT_TYPES = Array.from(new Set(Object.values(SpriteEventGroups).flat())) as ReadonlyArray<string>;

// 精灵事件类型：所有内置事件类型 + 可选 'custom'
export type SpriteEventType = (typeof SPRITE_EVENT_TYPES)[number] | 'custom';

export type MessageProducer = (ctx?: any) => string;

export type MessageCatalog = {
  [K in MessageCategory]?: Array<MessageProducer | string> | MessageProducer | string;
};

export interface MessagesProvider {
  t: (category: MessageCategory, ctx?: any) => string;
}

export interface SpriteAnimation {
  width?: number;
  height?: number;
  padding?: number;
  autoplay?: boolean;
  muted?: boolean;
  playsInline?: boolean;
  /**
   * 是否循环播放。
   * - 如果配置了 loopStartMs 或 loopEndMs：默认循环，除非显式设置为 false
   * - 如果没有配置循环片段：默认 false（不循环），设置为 true 时使用原生 loop 属性全程循环
   */
  loop?: boolean;
  // 可选的时长（毫秒），未提供时以 <video> 元数据为准
  durationMs?: number;
  /**
   * 循环片段开始时间（毫秒）。
   * - 同时指定 loopStartMs 和 loopEndMs：在该区间内循环播放（默认循环，除非设置 loop: false）
   * - 仅指定 loopStartMs：从该时间点循环到视频末尾（默认循环，除非设置 loop: false）
   * - 仅指定 loopEndMs：从视频开头循环到该时间点（默认循环，除非设置 loop: false）
   * - 都不指定且 loop: true：使用原生 loop 属性全程循环
   * - 都不指定且 loop: false 或未设置：只播放一遍，播放完成后恢复为 idle 状态
   *
   * 对于行走动画（三段式）：视频先播放 0 ~ loopStartMs（开始转身），
   * 然后在 loopStartMs ~ loopEndMs 之间循环（行走中），
   * 停止行走时跳转到 loopEndMs 播放结束动画（转回正面）。
   */
  loopStartMs?: number;
  /**
   * 循环片段结束时间（毫秒）。
   */
  loopEndMs?: number;
  meta: {
    id: string;
    title: string;
    description?: string;
    tags?: string[];
    // 可选的封面图
    coverSrc?: string;
    // 事件触发分类（来自 SpriteEventType）
    eventType?: SpriteEventType;
    // 是否允许在“精灵管理”中删除（系统内置为 false，用户导入为 true）
    deletable?: boolean;
  };
  source: {
    // 直接可用的 URL（优先级高）
    src?: string;
    // 本地绝对路径（将通过 res://local/ 访问）
    localPath?: string;
    // 媒体类型，例如 video/webm、video/mp4
    type?: string;
  };
}
