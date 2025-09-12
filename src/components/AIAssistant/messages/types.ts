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
  | 'reminder'        // 提醒相关
  | 'event'           // 事件相关
  | 'task'            // 任务相关
  | 'drag'            // 拖拽提示/状态
  | 'drop'            // 文件放下
  | 'task'            // 执行任务中的反馈
  | 'recommend'       // 推荐/建议
  | 'tip'             // 提示
  | 'reminder'        // 温馨提醒
  | 'system'          // 系统/错误
  | 'welcome'         // 初始欢迎
  | 'custom'          // 自定义文本

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
