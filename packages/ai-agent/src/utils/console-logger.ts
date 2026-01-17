/**
 * 控制台日志器
 *
 * 简单的控制台日志实现
 */

import type { LoggerProvider } from '../interfaces/logger-provider';

/**
 * 日志级别
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4
}

/**
 * 控制台日志器配置
 */
export interface ConsoleLoggerConfig {
  /** 最小日志级别 */
  level?: LogLevel;
  /** 前缀 */
  prefix?: string;
  /** 是否显示时间戳 */
  timestamp?: boolean;
  /** 是否使用颜色 */
  colors?: boolean;
}

/**
 * 控制台日志器
 *
 * @description
 * 简单的控制台日志实现。
 * 支持日志级别过滤、前缀、时间戳和颜色。
 *
 * @example
 * ```typescript
 * const logger = new ConsoleLogger({ level: LogLevel.DEBUG });
 * logger.info('Hello', { key: 'value' });
 * // [INFO] Hello { key: 'value' }
 * ```
 */
export class ConsoleLogger implements LoggerProvider {
  private level: LogLevel;
  private prefix: string;
  private timestamp: boolean;
  private colors: boolean;

  constructor(config?: ConsoleLoggerConfig) {
    this.level = config?.level ?? LogLevel.INFO;
    this.prefix = config?.prefix ?? '';
    this.timestamp = config?.timestamp ?? false;
    this.colors = config?.colors ?? true;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.level <= LogLevel.DEBUG) {
      this.log('DEBUG', message, meta, '\x1b[90m'); // 灰色
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (this.level <= LogLevel.INFO) {
      this.log('INFO', message, meta, '\x1b[36m'); // 青色
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (this.level <= LogLevel.WARN) {
      this.log('WARN', message, meta, '\x1b[33m'); // 黄色
    }
  }

  error(message: string, meta?: Record<string, unknown>): void {
    if (this.level <= LogLevel.ERROR) {
      this.log('ERROR', message, meta, '\x1b[31m'); // 红色
    }
  }

  child(name: string): LoggerProvider {
    return new ConsoleLogger({
      level: this.level,
      prefix: this.prefix ? `${this.prefix}:${name}` : name,
      timestamp: this.timestamp,
      colors: this.colors
    });
  }

  private log(level: string, message: string, meta?: Record<string, unknown>, color?: string): void {
    const parts: string[] = [];

    // 时间戳
    if (this.timestamp) {
      parts.push(`[${new Date().toISOString()}]`);
    }

    // 级别
    if (this.colors && color) {
      parts.push(`${color}[${level}]\x1b[0m`);
    } else {
      parts.push(`[${level}]`);
    }

    // 前缀
    if (this.prefix) {
      parts.push(`[${this.prefix}]`);
    }

    // 消息
    parts.push(message);

    // 输出
    const output = parts.join(' ');

    if (meta && Object.keys(meta).length > 0) {
      console.log(output, meta);
    } else {
      console.log(output);
    }
  }

  /**
   * 设置日志级别
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * 获取当前日志级别
   */
  getLevel(): LogLevel {
    return this.level;
  }
}

/**
 * 空日志器
 *
 * @description
 * 什么都不做的日志器，用于禁用日志。
 */
export class NoopLogger implements LoggerProvider {
  debug(): void { }
  info(): void { }
  warn(): void { }
  error(): void { }
  child(): LoggerProvider {
    return this;
  }
}
