/**
 * 错误恢复策略
 *
 * 定义和实现错误恢复逻辑
 */

import { ErrorCategory, RECOVERY_STRATEGIES, RecoveryStrategy, ToolResult } from '../types';
import { AgentError } from './agent-error';

/**
 * 重试选项
 */
export interface RetryOptions {
  /** 最大重试次数 */
  maxRetries?: number;
  /** 退避策略 */
  backoff?: 'linear' | 'exponential';
  /** 初始延迟（毫秒） */
  initialDelayMs?: number;
  /** 最大延迟（毫秒） */
  maxDelayMs?: number;
  /** 重试条件 */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** 重试前回调 */
  onRetry?: (error: unknown, attempt: number) => void;
}

const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'shouldRetry' | 'onRetry'>> = {
  maxRetries: 3,
  backoff: 'exponential',
  initialDelayMs: 1000,
  maxDelayMs: 30000
};

/**
 * 带重试的执行
 *
 * @description
 * 执行函数，如果失败则根据配置重试。
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => fetch('/api/data'),
 *   { maxRetries: 3, backoff: 'exponential' }
 * );
 * ```
 */
export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };

  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // 检查是否应该重试
      if (attempt >= opts.maxRetries) {
        break;
      }

      if (options?.shouldRetry && !options.shouldRetry(error, attempt)) {
        break;
      }

      // 通知重试
      options?.onRetry?.(error, attempt);

      // 计算延迟
      const delay = calculateDelay(attempt, opts);
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * 计算退避延迟
 */
function calculateDelay(attempt: number, options: Required<Omit<RetryOptions, 'shouldRetry' | 'onRetry'>>): number {
  let delay: number;

  if (options.backoff === 'exponential') {
    delay = options.initialDelayMs * Math.pow(2, attempt);
  } else {
    delay = options.initialDelayMs * (attempt + 1);
  }

  // 添加抖动（±10%）
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);
  delay += jitter;

  return Math.min(delay, options.maxDelayMs);
}

/**
 * 休眠
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 根据错误类别获取恢复策略
 */
export function getRecoveryStrategy(category: ErrorCategory): RecoveryStrategy {
  return RECOVERY_STRATEGIES[category];
}

/**
 * 检查错误是否可重试
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof AgentError) {
    return error.recoverable;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // 网络错误通常可重试
    if (message.includes('network') || message.includes('timeout') || message.includes('econnrefused') || message.includes('enotfound')) {
      return true;
    }

    // 速率限制可重试
    if (message.includes('rate limit') || message.includes('429')) {
      return true;
    }

    // 服务端错误可重试
    if (message.includes('500') || message.includes('502') || message.includes('503')) {
      return true;
    }
  }

  return false;
}

/**
 * 创建重试条件函数
 */
export function createRetryCondition(options?: {
  /** 允许重试的错误类别 */
  allowedCategories?: ErrorCategory[];
  /** 禁止重试的错误类别 */
  deniedCategories?: ErrorCategory[];
  /** 自定义条件 */
  custom?: (error: unknown) => boolean;
}): (error: unknown, attempt: number) => boolean {
  return (error: unknown, attempt: number) => {
    // 自定义条件优先
    if (options?.custom) {
      return options.custom(error);
    }

    // 检查 AgentError
    if (error instanceof AgentError) {
      // 检查禁止列表
      if (options?.deniedCategories?.includes(error.category)) {
        return false;
      }

      // 检查允许列表
      if (options?.allowedCategories) {
        return options.allowedCategories.includes(error.category);
      }

      // 使用内置的可恢复性
      return error.recoverable;
    }

    // 默认检查
    return isRetryable(error);
  };
}

/**
 * 错误恢复上下文
 */
export interface RecoveryContext {
  /** 错误 */
  error: AgentError;
  /** 重试次数 */
  retryCount: number;
  /** 是否已尝试降级 */
  fallbackAttempted: boolean;
}

/**
 * 错误恢复器
 *
 * @description
 * 管理错误恢复流程的类。
 * 支持重试、降级等恢复策略。
 */
export class ErrorRecovery {
  private contexts: Map<string, RecoveryContext> = new Map();

  /**
   * 尝试恢复
   *
   * @param key - 恢复上下文键
   * @param error - 错误
   * @returns 是否应该重试
   */
  shouldRetry(key: string, error: unknown): boolean {
    const agentError = AgentError.from(error);
    const strategy = agentError.getRecoveryStrategy();

    // 获取或创建上下文
    let context = this.contexts.get(key);
    if (!context) {
      context = {
        error: agentError,
        retryCount: 0,
        fallbackAttempted: false
      };
      this.contexts.set(key, context);
    }

    // 检查是否可重试
    if (!strategy.retryable) {
      return false;
    }

    // 检查重试次数
    if (context.retryCount >= (strategy.maxRetries ?? 0)) {
      return false;
    }

    // 增加重试计数
    context.retryCount++;

    return true;
  }

  /**
   * 获取降级方案
   */
  getFallback(key: string): RecoveryStrategy['fallback'] | undefined {
    const context = this.contexts.get(key);
    if (!context || context.fallbackAttempted) {
      return undefined;
    }

    const strategy = context.error.getRecoveryStrategy();
    context.fallbackAttempted = true;

    return strategy.fallback;
  }

  /**
   * 清除上下文
   */
  clear(key: string): void {
    this.contexts.delete(key);
  }

  /**
   * 清除所有上下文
   */
  clearAll(): void {
    this.contexts.clear();
  }
}
