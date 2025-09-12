// Types for AI Assistant message catalog
// Extendable category types for clarity and autocompletion
export type MessageCategory =
  | 'idle'            // 闲置状态
  | 'click'           // 点击交互
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
