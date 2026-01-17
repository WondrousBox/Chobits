/**
 * Agent Error
 *
 * 自定义 Agent 错误类
 */

import { AgentError as AgentErrorType, ErrorCategory, RECOVERY_STRATEGIES, RecoveryStrategy } from '../types';

/**
 * Agent 错误类
 *
 * @description
 * 可抛出的 Agent 错误类。
 * 包含错误分类、恢复策略等信息。
 *
 * @example
 * ```typescript
 * throw new AgentError('Tool not found', ErrorCategory.TOOL_ERROR);
 * ```
 */
export class AgentError extends Error implements AgentErrorType {
  readonly category: ErrorCategory;
  readonly recoverable: boolean;
  readonly suggestion?: string;
  readonly details?: unknown;
  readonly cause?: Error;

  constructor(
    message: string,
    category: ErrorCategory = ErrorCategory.UNKNOWN_ERROR,
    options?: {
      recoverable?: boolean;
      suggestion?: string;
      details?: unknown;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'AgentError';
    this.category = category;
    this.recoverable = options?.recoverable ?? RECOVERY_STRATEGIES[category]?.retryable ?? false;
    this.suggestion = options?.suggestion;
    this.details = options?.details;
    this.cause = options?.cause;
  }

  /**
   * 获取恢复策略
   */
  getRecoveryStrategy(): RecoveryStrategy {
    return RECOVERY_STRATEGIES[this.category];
  }

  /**
   * 转换为普通对象
   */
  toJSON(): AgentErrorType {
    return {
      category: this.category,
      message: this.message,
      recoverable: this.recoverable,
      suggestion: this.suggestion,
      details: this.details,
      cause: this.cause
    };
  }

  /**
   * 从任意错误创建 AgentError
   */
  static from(error: unknown, defaultCategory: ErrorCategory = ErrorCategory.UNKNOWN_ERROR): AgentError {
    if (error instanceof AgentError) {
      return error;
    }

    if (error instanceof Error) {
      // 检测特殊错误类型
      const category = detectErrorCategory(error);
      return new AgentError(error.message, category ?? defaultCategory, {
        cause: error
      });
    }

    return new AgentError(String(error), defaultCategory);
  }

  /**
   * 创建 LLM 错误
   */
  static llmError(message: string, cause?: Error): AgentError {
    return new AgentError(message, ErrorCategory.LLM_ERROR, {
      cause,
      suggestion: 'Check your API key and network connection'
    });
  }

  /**
   * 创建工具错误
   */
  static toolError(message: string, toolName?: string, cause?: Error): AgentError {
    return new AgentError(message, ErrorCategory.TOOL_ERROR, {
      cause,
      details: { toolName },
      suggestion: `Check tool "${toolName}" implementation`
    });
  }

  /**
   * 创建验证错误
   */
  static validationError(message: string, details?: unknown): AgentError {
    return new AgentError(message, ErrorCategory.VALIDATION_ERROR, {
      details,
      suggestion: 'Check the input parameters'
    });
  }

  /**
   * 创建超时错误
   */
  static timeoutError(timeoutMs: number): AgentError {
    return new AgentError(`Operation timed out after ${timeoutMs}ms`, ErrorCategory.TIMEOUT_ERROR, {
      recoverable: true,
      details: { timeoutMs },
      suggestion: 'Try again with a longer timeout'
    });
  }

  /**
   * 创建中止错误
   */
  static abortError(): AgentError {
    return new AgentError('Operation was aborted', ErrorCategory.ABORT_ERROR, {
      recoverable: false
    });
  }

  /**
   * 创建配置错误
   */
  static configError(message: string, details?: unknown): AgentError {
    return new AgentError(message, ErrorCategory.CONFIG_ERROR, {
      details,
      suggestion: 'Check your configuration'
    });
  }
}

/**
 * 检测错误类别
 */
function detectErrorCategory(error: Error): ErrorCategory | undefined {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // 中止错误
  if (name === 'aborterror' || message.includes('aborted')) {
    return ErrorCategory.ABORT_ERROR;
  }

  // 超时错误
  if (message.includes('timeout') || message.includes('timed out')) {
    return ErrorCategory.TIMEOUT_ERROR;
  }

  // API 相关错误
  if (
    message.includes('api') ||
    message.includes('rate limit') ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('401') ||
    message.includes('403') ||
    message.includes('429')
  ) {
    return ErrorCategory.LLM_ERROR;
  }

  // 网络错误
  if (message.includes('network') || message.includes('fetch') || message.includes('enotfound') || message.includes('econnrefused')) {
    return ErrorCategory.LLM_ERROR;
  }

  return undefined;
}

/**
 * 类型守卫：检查是否是 AgentError
 */
export function isAgentError(error: unknown): error is AgentError {
  return error instanceof AgentError;
}

/**
 * 安全地提取错误消息
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
