import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { app } from 'electron';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

import { getResourcePath } from '../../electron/main/utils/resources-path';
import { getHttpProxy } from '../../electron/main/handlers/proxy/proxy';

import { YtDlpConfigStore } from './ytdlp-config-store';
import { YtDlpExecutor, ytdlpExecutor } from './ytdlp-executor';
import type { ICookieManager, YtDlpBinaryInfo, YtDlpConfig, YtDlpServiceOptions } from './types';

/**
 * 获取默认的二进制文件名
 */
function getDefaultBinaryName(): string {
  return os.platform() === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp.exe';
}

/**
 * yt-dlp 核心服务
 * 单例模式，提供统一的 yt-dlp 管理接口
 */
export class YtDlpService {
  private executor: YtDlpExecutor;
  private cookieManager?: ICookieManager;
  private initialized: boolean = false;

  constructor() {
    this.executor = ytdlpExecutor;
  }

  /**
   * 初始化服务
   * 应在 app ready 后调用
   */
  initialize(options?: YtDlpServiceOptions): void {
    if (this.initialized) {
      console.warn('[YtDlpService] Already initialized');
      return;
    }

    this.cookieManager = options?.cookieManager;

    // 设置初始二进制路径
    const currentPath = this.getCurrentBinaryPath();
    this.executor.setBinaryPath(currentPath);

    this.initialized = true;
    console.log('[YtDlpService] Initialized with binary:', currentPath);
  }

  /**
   * 获取内置的二进制路径
   */
  getBuiltinBinaryPath(): string {
    return getResourcePath('yt-dlp')!;
  }

  /**
   * 获取用户数据目录中的二进制路径
   */
  getUserBinaryPath(): string {
    const name = getDefaultBinaryName();
    const destDir = path.resolve(app.getPath('userData'), 'data', 'yt-dlp');
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    return path.resolve(destDir, name);
  }

  /**
   * 获取当前应该使用的二进制路径
   * 优先使用用户下载的版本，否则使用内置版本
   */
  getCurrentBinaryPath(): string {
    const userPath = this.getUserBinaryPath();
    if (fs.existsSync(userPath)) {
      return userPath;
    }
    return this.getBuiltinBinaryPath();
  }

  /**
   * 更新二进制路径
   * 更新后同步到 executor
   */
  updateBinaryPath(newPath: string): void {
    this.executor.setBinaryPath(newPath);
    console.log('[YtDlpService] Binary path updated to:', newPath);
  }

  /**
   * 获取执行器实例
   */
  getExecutor(): YtDlpExecutor {
    return this.executor;
  }

  // ========== 配置管理 ==========

  /**
   * 获取完整配置
   */
  getConfig(): YtDlpConfig {
    return YtDlpConfigStore.getConfig();
  }

  /**
   * 设置完整配置
   */
  setConfig(config: Partial<YtDlpConfig>): YtDlpConfig {
    return YtDlpConfigStore.setConfig(config);
  }

  /**
   * 获取单个配置项
   */
  getConfigValue<K extends keyof YtDlpConfig>(key: K): YtDlpConfig[K] {
    return YtDlpConfigStore.get(key);
  }

  /**
   * 设置单个配置项
   */
  setConfigValue<K extends keyof YtDlpConfig>(key: K, value: YtDlpConfig[K]): void {
    YtDlpConfigStore.set(key, value);
  }

  /**
   * 获取配置文件路径
   */
  getConfigFilePath(): string {
    return YtDlpConfigStore.getConfigFilePath();
  }

  /**
   * 获取 yt-dlp.conf 文件路径
   */
  getYtDlpConfFilePath(): string {
    return YtDlpConfigStore.getYtDlpConfFilePath();
  }

  // ========== 命令参数构建 ==========

  /**
   * 构建命令参数（同步版本，不含 cookie）
   */
  buildArgs(baseArgs: string[]): string[] {
    const args = [...baseArgs];

    // 添加配置文件
    if (YtDlpConfigStore.hasYtDlpConf()) {
      args.push('--config-location', YtDlpConfigStore.getYtDlpConfFilePath());
    }

    // 添加代理配置
    this.applyProxyArgs(args);

    return args;
  }

  /**
   * 构建命令参数（异步版本，含 cookie）
   */
  async buildArgsAsync(baseArgs: string[]): Promise<string[]> {
    const args = this.buildArgs(baseArgs);
    await this.applyCookieArgs(args);
    return args;
  }

  /**
   * 应用代理配置到参数
   */
  private applyProxyArgs(args: string[]): void {
    try {
      const agent = getHttpProxy();
      if (agent instanceof HttpsProxyAgent) {
        const proxyUrl = (agent as any).proxy?.href || (agent as any).proxy?.toString();
        if (proxyUrl) {
          args.push('--proxy', proxyUrl, '--socket-timeout', '60');
        }
      } else if (agent instanceof SocksProxyAgent) {
        const proxyInfo = (agent as any).proxy;
        if (proxyInfo?.host && proxyInfo?.port) {
          args.push('--proxy', `socks://${proxyInfo.host}:${proxyInfo.port}`, '--socket-timeout', '60');
        }
      }
    } catch (error) {
      console.warn('[YtDlpService] Failed to apply proxy config:', error);
    }
  }

  /**
   * 应用 Cookie 配置到参数
   * 仅使用内置的 Cookie Manager（用户登录方式）
   */
  private async applyCookieArgs(args: string[]): Promise<void> {
    try {
      const config = this.getConfig();

      if (!config.useCookies) {
        return;
      }

      // 使用内置的 Cookie Manager
      if (this.cookieManager?.isLoggedIn()) {
        try {
          const cookieFile = await this.cookieManager.exportNetscapeCookies();
          args.push('--cookies', cookieFile);
          console.log('[YtDlpService] Using cookies from built-in Cookie Manager');
        } catch (error) {
          console.warn('[YtDlpService] Failed to use Cookie Manager cookies:', error);
        }
      } else if (this.cookieManager) {
        console.log('[YtDlpService] Cookie Manager: Not logged in, skipping cookies');
      }
    } catch (error) {
      console.warn('[YtDlpService] Failed to apply cookies:', error);
    }
  }

  // ========== 高级操作 ==========

  /**
   * 获取二进制信息
   */
  async getBinaryInfo(): Promise<YtDlpBinaryInfo> {
    const currentPath = this.getCurrentBinaryPath();
    let version: string | null = null;

    try {
      if (fs.existsSync(currentPath)) {
        const stat = fs.statSync(currentPath);
        if (stat.isFile()) {
          // 检查执行权限
          if (os.platform() !== 'win32') {
            try {
              fs.accessSync(currentPath, fs.constants.X_OK);
            } catch {
              try {
                fs.chmodSync(currentPath, 0o755);
              } catch {
                /* ignore */
              }
            }
          }

          // 临时设置路径获取版本
          const originalPath = this.executor.getBinaryPath();
          this.executor.setBinaryPath(currentPath);
          version = await this.executor.getVersion();
          this.executor.setBinaryPath(originalPath);
        }
      }
    } catch (error) {
      console.warn('[YtDlpService] Failed to get version:', error);
    }

    return {
      path: currentPath,
      version,
      isBuiltin: currentPath === this.getBuiltinBinaryPath()
    };
  }

  /**
   * 获取视频信息
   */
  async getVideoInfo(url: string, signal?: AbortSignal): Promise<any> {
    const baseArgs = [url, '--prefer-free-formats'];
    const args = await this.buildArgsAsync(baseArgs);
    return this.executor.getVideoInfo(url, args.filter((a) => a !== url), signal);
  }

  /**
   * 获取播放列表信息
   */
  async getPlaylistInfo(url: string, options?: { limit?: number }, signal?: AbortSignal): Promise<any> {
    const baseArgs = [url];
    if (options?.limit) {
      baseArgs.push('--playlist-end', String(options.limit));
    }
    const args = await this.buildArgsAsync(baseArgs);
    return this.executor.getPlaylistInfo(url, args.filter((a) => a !== url), signal);
  }
}

// 单例实例
export const ytdlpService = new YtDlpService();
