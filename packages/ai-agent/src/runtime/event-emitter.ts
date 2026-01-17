/**
 * 事件发射器
 *
 * 轻量级的事件发射实现
 * 用于 Agent 内部的事件通信
 */

import type { AgentError, TokenUsage, ToolCall, ToolResult } from '../types';

type EventHandler<T = unknown> = (event: T) => void;

/**
 * 类型化的事件发射器
 *
 * @description
 * 支持类型安全的事件订阅和发射。
 * 每个事件类型可以有多个监听器。
 *
 * @example
 * ```typescript
 * const emitter = new TypedEventEmitter<{ data: string; done: boolean }>();
 *
 * emitter.on('data', (text) => console.log(text));
 * emitter.emit('data', 'Hello');
 * ```
 */
export class TypedEventEmitter<T extends Record<string, unknown>> {
  private handlers: Map<keyof T, Set<EventHandler<unknown>>> = new Map();

  /**
   * 订阅事件
   *
   * @param event - 事件名称
   * @param handler - 事件处理器
   * @returns 取消订阅函数
   */
  on<K extends keyof T>(event: K, handler: EventHandler<T[K]>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as EventHandler<unknown>);

    return () => {
      this.handlers.get(event)?.delete(handler as EventHandler<unknown>);
    };
  }

  /**
   * 订阅一次性事件
   *
   * @param event - 事件名称
   * @param handler - 事件处理器
   * @returns 取消订阅函数
   */
  once<K extends keyof T>(event: K, handler: EventHandler<T[K]>): () => void {
    const wrappedHandler: EventHandler<T[K]> = (data) => {
      this.off(event, wrappedHandler);
      handler(data);
    };
    return this.on(event, wrappedHandler);
  }

  /**
   * 取消订阅
   *
   * @param event - 事件名称
   * @param handler - 事件处理器
   */
  off<K extends keyof T>(event: K, handler: EventHandler<T[K]>): void {
    this.handlers.get(event)?.delete(handler as EventHandler<unknown>);
  }

  /**
   * 发射事件
   *
   * @param event - 事件名称
   * @param data - 事件数据
   */
  emit<K extends keyof T>(event: K, data: T[K]): void {
    this.handlers.get(event)?.forEach((handler) => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in event handler for "${String(event)}":`, error);
      }
    });
  }

  /**
   * 移除所有监听器
   *
   * @param event - 事件名称（可选，不传则移除所有）
   */
  removeAllListeners(event?: keyof T): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }

  /**
   * 获取监听器数量
   *
   * @param event - 事件名称
   * @returns 监听器数量
   */
  listenerCount(event: keyof T): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}

/**
 * Agent 事件映射
 */
export type AgentEventMap = Record<string, unknown> & {
  metadata: Record<string, unknown>;
  delta: string;
  tool_call: ToolCall;
  tool_result: { result: ToolResult; callId?: string };
  error: AgentError;
  done: { success: boolean; usage?: TokenUsage };
};

/**
 * 创建 Agent 事件发射器
 */
export function createAgentEventEmitter(): TypedEventEmitter<AgentEventMap> {
  return new TypedEventEmitter<AgentEventMap>();
}
