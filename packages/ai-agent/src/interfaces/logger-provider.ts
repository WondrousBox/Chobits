/**
 * Logger Provider 接口
 *
 * 定义日志系统的标准接口
 * 支持不同日志级别和元数据
 */

/**
 * 日志提供者接口
 *
 * @description
 * 定义 Agent 日志系统的标准接口。
 * 支持常见的日志级别和结构化元数据。
 *
 * @example
 * ```typescript
 * class ConsoleLogger implements LoggerProvider {
 *   info(message: string, meta?: Record<string, unknown>): void {
 *     console.info(`[INFO] ${message}`, meta);
 *   }
 * }
 * ```
 */
export interface LoggerProvider {
  /**
   * 调试日志
   *
   * @param message - 日志消息
   * @param meta - 元数据（可选）
   */
  debug(message: string, meta?: Record<string, unknown>): void;

  /**
   * 信息日志
   *
   * @param message - 日志消息
   * @param meta - 元数据（可选）
   */
  info(message: string, meta?: Record<string, unknown>): void;

  /**
   * 警告日志
   *
   * @param message - 日志消息
   * @param meta - 元数据（可选）
   */
  warn(message: string, meta?: Record<string, unknown>): void;

  /**
   * 错误日志
   *
   * @param message - 日志消息
   * @param meta - 元数据（可选）
   */
  error(message: string, meta?: Record<string, unknown>): void;

  /**
   * 创建子日志器（可选）
   *
   * @param name - 子日志器名称
   * @returns 新的日志器实例
   *
   * @description
   * 用于创建带有特定前缀或上下文的子日志器。
   */
  child?(name: string): LoggerProvider;
}
