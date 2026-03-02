import { EventEmitter } from 'events';

import ytdlpStatic, { YTDlpWrap } from '../common/libs/ytdlp-static';
import type { YtDlpExecOptions, YtDlpProgress } from './types';

/**
 * 检测是否为不支持的选项错误
 */
export function isUnsupportedOptionError(error: Error): { isUnsupported: boolean; option?: string } {
  const message = error.message || '';
  const match = message.match(/no such option:\s*(--[\w-]+)/);
  if (match) {
    return { isUnsupported: true, option: match[1] };
  }
  return { isUnsupported: false };
}

/**
 * 不支持的选项错误类
 */
export class UnsupportedOptionError extends Error {
  public readonly option: string;

  constructor(option: string, message: string) {
    super(message);
    this.name = 'UnsupportedOptionError';
    this.option = option;
  }

  /**
   * 获取用户友好的错误提示
   */
  getUserFriendlyMessage(): string {
    if (this.option === '--js-runtimes') {
      return '当前 yt-dlp 版本不支持 JavaScript 运行时配置，请升级到最新版本。可在"设置 → 下载器"中更新 yt-dlp。';
    }
    return `当前 yt-dlp 版本不支持 ${this.option} 选项，请升级到最新版本。`;
  }
}

/**
 * yt-dlp 执行器
 * 封装 YTDlpWrap，提供统一的命令执行接口
 *
 * 注意：同时更新内部 wrap 和全局 ytdlpStatic 单例的 binary path
 */
export class YtDlpExecutor {
  private wrap: YTDlpWrap;
  private currentBinaryPath: string;

  constructor() {
    this.wrap = new YTDlpWrap();
    this.currentBinaryPath = this.wrap.getBinaryPath();
  }

  /**
   * 设置二进制路径
   * 同时更新内部 wrap 和全局 ytdlpStatic 单例
   */
  setBinaryPath(path: string): void {
    this.currentBinaryPath = path;
    this.wrap.setBinaryPath(path);
    // 同步更新全局单例，确保 video-downloader.ts 使用的 ytdlpStatic 也能获取正确的路径
    ytdlpStatic.setBinaryPath(path);
    console.log('[YtDlpExecutor] Binary path set to:', path);
  }

  /**
   * 获取当前二进制路径
   */
  getBinaryPath(): string {
    return this.currentBinaryPath;
  }

  /**
   * 执行 yt-dlp 命令，返回 EventEmitter
   */
  exec(options: YtDlpExecOptions): EventEmitter {
    const { args, signal } = options;
    return this.wrap.exec(args, undefined, signal || null);
  }

  /**
   * 执行 yt-dlp 命令，返回 Promise
   */
  execPromise(args: string[], signal?: AbortSignal): Promise<string> {
    return this.wrap.execPromise(args, undefined, signal || null);
  }

  /**
   * 获取视频信息
   */
  async getVideoInfo(url: string, args: string[] = [], signal?: AbortSignal): Promise<any> {
    const fullArgs = [url, ...args, '--dump-json', '--no-playlist'];
    const result = await this.wrap.getVideoInfo(fullArgs, signal || null);
    if (result instanceof Error) {
      throw result;
    }
    return result;
  }

  /**
   * 获取播放列表信息
   */
  async getPlaylistInfo(url: string, args: string[] = [], signal?: AbortSignal): Promise<any> {
    const fullArgs = [url, ...args];
    const result = await this.wrap.getPlaylistInfo(fullArgs, signal || null);
    if (result instanceof Error) {
      throw result;
    }
    return result;
  }

  /**
   * 获取缩略图 URL
   */
  async getThumbnail(url: string, args: string[] = []): Promise<string> {
    const fullArgs = [url, ...args];
    return this.wrap.getThumbnail(fullArgs);
  }

  /**
   * 获取版本号
   */
  async getVersion(): Promise<string> {
    const output = await this.wrap.execPromise(['--version']);
    return (output || '').trim();
  }

  /**
   * 获取底层的 YTDlpWrap 实例
   * 用于需要直接访问的场景
   */
  getWrap(): YTDlpWrap {
    return this.wrap;
  }
}

// 单例实例
export const ytdlpExecutor = new YtDlpExecutor();

// 默认导出 ytdlpStatic 以保持向后兼容
export default ytdlpStatic;
