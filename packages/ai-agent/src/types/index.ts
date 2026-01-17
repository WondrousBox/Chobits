/**
 * AI Agent Core - 类型定义
 *
 * 核心类型定义，遵循依赖反转原则
 * 不依赖任何外部实现
 */

// ============================================================================
// 消息类型
// ============================================================================

/** 消息角色 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/** 消息结构 */
export interface Message {
  /** 消息角色 */
  role: MessageRole;
  /** 消息内容 */
  content: string;
  /** 工具调用 ID（工具响应时使用） */
  toolCallId?: string;
  /** 工具调用列表（助手消息可选） */
  toolCalls?: ToolCall[];
  /** 工具/函数名称 */
  name?: string;
}

// ============================================================================
// 工具类型
// ============================================================================

/** JSON Schema 属性定义 */
export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
}

/** JSON Schema 定义 */
export interface JSONSchema {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

/** 工具定义（符合 OpenAI Function Calling 标准） */
export interface ToolDefinition {
  /** 工具名称（唯一标识） */
  name: string;
  /** 工具描述（LLM 用于决策） */
  description: string;
  /** 参数 JSON Schema */
  parameters: JSONSchema;
}

/** 工具调用 */
export interface ToolCall {
  /** 调用 ID */
  id: string;
  /** 工具名称 */
  name: string;
  /** 调用参数 */
  params: unknown;
}

/** 工具执行结果 */
export interface ToolResult {
  /** 是否成功 */
  success: boolean;
  /** 返回数据 */
  data?: unknown;
  /** 错误信息 */
  error?: string;
}

/** 参数验证结果 */
export interface ValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 错误信息 */
  error?: string;
  /** 详细错误列表 */
  errors?: Array<{ path: string; message: string }>;
}

// ============================================================================
// LLM 类型
// ============================================================================

/** LLM 请求 */
export interface LLMRequest {
  /** 对话消息 */
  messages: Message[];
  /** 可用工具 */
  tools?: ToolDefinition[];
  /** 温度参数 */
  temperature?: number;
  /** 最大 token 数 */
  maxTokens?: number;
  /** 系统提示词（可选，将作为第一条系统消息） */
  systemPrompt?: string;
  /** 停止词 */
  stop?: string[];
  /** 扩展参数 */
  extras?: Record<string, unknown>;
}

/** LLM 流式输出块 */
export type LLMChunk = { type: 'text'; text: string } | { type: 'tool_call'; call: ToolCall } | { type: 'done'; usage?: TokenUsage };

/** LLM 响应（非流式） */
export interface LLMResponse {
  /** 响应消息 */
  message: Message;
  /** Token 使用统计 */
  usage?: TokenUsage;
}

/** Token 使用统计 */
export interface TokenUsage {
  /** 输入 token 数 */
  inputTokens?: number;
  /** 输出 token 数 */
  outputTokens?: number;
  /** 总 token 数 */
  totalTokens?: number;
  /** 预估成本 */
  cost?: number;
}

// ============================================================================
// 记忆类型
// ============================================================================

/** 记忆配置选项 */
export interface MemoryOptions {
  /** 是否持久化 */
  persist?: boolean;
  /** 过期时间（秒） */
  ttl?: number;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/** 记忆项 */
export interface MemoryItem {
  /** 键 */
  key: string;
  /** 值 */
  value: unknown;
  /** 相关性得分（用于语义搜索） */
  score?: number;
  /** 元数据 */
  metadata?: Record<string, unknown>;
  /** 创建时间 */
  createdAt?: number;
  /** 过期时间 */
  expiresAt?: number;
}

// ============================================================================
// 事件类型
// ============================================================================

/** Agent 事件 */
export type AgentEvent =
  | { type: 'metadata'; data: Record<string, unknown> }
  | { type: 'delta'; text: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'tool_result'; result: ToolResult; callId?: string }
  | { type: 'error'; error: AgentError }
  | { type: 'done'; success: boolean; usage?: TokenUsage };

// ============================================================================
// 错误类型
// ============================================================================

/** 错误分类 */
export enum ErrorCategory {
  /** LLM API 错误（网络、限额等） */
  LLM_ERROR = 'llm_error',
  /** 工具执行错误 */
  TOOL_ERROR = 'tool_error',
  /** 参数验证错误 */
  VALIDATION_ERROR = 'validation_error',
  /** 超时错误 */
  TIMEOUT_ERROR = 'timeout_error',
  /** 中止错误 */
  ABORT_ERROR = 'abort_error',
  /** 配置错误 */
  CONFIG_ERROR = 'config_error',
  /** 其他错误 */
  UNKNOWN_ERROR = 'unknown_error'
}

/** Agent 错误 */
export interface AgentError {
  /** 错误分类 */
  category: ErrorCategory;
  /** 错误消息 */
  message: string;
  /** 详细信息 */
  details?: unknown;
  /** 是否可恢复 */
  recoverable: boolean;
  /** 恢复建议 */
  suggestion?: string;
  /** 原始错误 */
  cause?: Error;
}

// ============================================================================
// Runtime 类型
// ============================================================================

/** Agent 输入 */
export interface AgentInput {
  /** 对话消息 */
  messages: Message[];
  /** 系统提示词 */
  systemPrompt?: string;
}

/** 运行时配置选项 */
export interface RuntimeOptions {
  /** 最大工具调用轮次 */
  maxIterations?: number;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 是否启用记忆 */
  enableMemory?: boolean;
  /** 是否启用日志 */
  enableLogging?: boolean;
  /** 温度参数 */
  temperature?: number;
  /** 最大 token 数 */
  maxTokens?: number;
  /** 历史消息最大条数（不含系统消息） */
  maxHistoryMessages?: number;
}

/** 默认运行时配置 */
export const DEFAULT_RUNTIME_OPTIONS: Required<RuntimeOptions> = {
  maxIterations: 10,
  timeout: 60000,
  enableMemory: true,
  enableLogging: true,
  temperature: 0.7,
  maxTokens: 4096,
  maxHistoryMessages: 100
};

// ============================================================================
// 恢复策略类型
// ============================================================================

/** 恢复策略 */
export interface RecoveryStrategy {
  /** 是否可重试 */
  retryable: boolean;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 退避策略 */
  backoff?: 'linear' | 'exponential';
  /** 降级方案 */
  fallback?: 'skip_tool' | 'ask_llm_to_fix' | 'return_partial' | 'abort' | 'use_cache';
  /** 是否通知用户 */
  notify?: boolean;
}

/** 错误恢复策略配置 */
export const RECOVERY_STRATEGIES: Record<ErrorCategory, RecoveryStrategy> = {
  [ErrorCategory.LLM_ERROR]: {
    retryable: true,
    maxRetries: 3,
    backoff: 'exponential',
    fallback: 'use_cache'
  },
  [ErrorCategory.TOOL_ERROR]: {
    retryable: false,
    fallback: 'skip_tool',
    notify: true
  },
  [ErrorCategory.VALIDATION_ERROR]: {
    retryable: false,
    fallback: 'ask_llm_to_fix',
    notify: true
  },
  [ErrorCategory.TIMEOUT_ERROR]: {
    retryable: true,
    maxRetries: 1,
    fallback: 'return_partial'
  },
  [ErrorCategory.ABORT_ERROR]: {
    retryable: false,
    fallback: 'abort',
    notify: false
  },
  [ErrorCategory.CONFIG_ERROR]: {
    retryable: false,
    fallback: 'abort',
    notify: true
  },
  [ErrorCategory.UNKNOWN_ERROR]: {
    retryable: false,
    fallback: 'abort',
    notify: true
  }
};
