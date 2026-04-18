import type { RssDownloadErrorCode } from './types';

/**
 * RSS 统一错误码定义
 *
 * 用于持久化和 UI 展示的错误分类。
 */

/** 所有 RSS 相关错误码 */
export type RssErrorCode =
    | RssDownloadErrorCode
    | 'feed_network_error'
    | 'feed_parse_error'
    | 'feed_timeout'
    | 'feed_http_error'
    | 'source_unsupported';

/**
 * RSS 错误基类
 */
export class RssError extends Error {
    constructor(
        message: string,
        public readonly code: RssErrorCode
    ) {
        super(message);
        this.name = 'RssError';
    }
}

export class RssFeedNetworkError extends RssError {
    constructor(message: string) {
        super(message, 'feed_network_error');
        this.name = 'RssFeedNetworkError';
    }
}

export class RssFeedParseError extends RssError {
    constructor(message: string) {
        super(message, 'feed_parse_error');
        this.name = 'RssFeedParseError';
    }
}

export class RssFeedTimeoutError extends RssError {
    constructor(message = 'RSS feed 请求超时') {
        super(message, 'feed_timeout');
        this.name = 'RssFeedTimeoutError';
    }
}

export class RssFeedHttpError extends RssError {
    constructor(
        public readonly statusCode: number,
        statusMessage?: string
    ) {
        super(`HTTP ${statusCode}: ${statusMessage || '请求失败'}`, 'feed_http_error');
        this.name = 'RssFeedHttpError';
    }
}

/**
 * 从任意 error 提取可读错误信息
 */
export function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error) {
        return error.message || fallback;
    }
    if (typeof error === 'string' && error.trim()) {
        return error.trim();
    }
    return fallback;
}

/**
 * 从任意 error 中提取错误码（如果是 RssError 则返回 code）
 */
export function getErrorCode(error: unknown): RssErrorCode | undefined {
    if (error instanceof RssError) {
        return error.code;
    }
    return undefined;
}
