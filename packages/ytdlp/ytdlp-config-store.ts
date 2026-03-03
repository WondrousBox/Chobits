import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import { getResourcePath } from '../../electron/main/utils/resources-path';
import pkg from '../../package.json';
import type { EjsRemoteComponents, QualityMode, YtDlpConfig } from './types';

const STORE_DIR = path.join(app.getPath('userData'), 'data');
export const CONFIG_FILE = path.join(STORE_DIR, 'ytdlp-config.json');
export const YTDLP_CONF_FILE = path.join(STORE_DIR, 'yt-dlp.conf');

type StoreShape = {
  config: YtDlpConfig;
};

const DEFAULT_CONFIG: YtDlpConfig = {
  qualityMode: '1',
  useCookies: false,
  ejsRemoteComponents: 'npm'
};

function ensureStoreDir(): void {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }
}

function read(): StoreShape {
  ensureStoreDir();

  if (!fs.existsSync(CONFIG_FILE)) {
    const initial: StoreShape = { config: DEFAULT_CONFIG };
    write(initial);
    writeYtDlpConf(initial.config);
    return initial;
  }

  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const data = JSON.parse(raw);
    const merged: StoreShape = {
      config: {
        ...DEFAULT_CONFIG,
        ...data.config
      }
    };

    // 如果 yt-dlp.conf 不存在，生成它
    if (!fs.existsSync(YTDLP_CONF_FILE)) {
      writeYtDlpConf(merged.config);
    }

    return merged;
  } catch (error) {
    console.warn('[YtDlpConfigStore] Failed to read config, using defaults:', error);
    return { config: DEFAULT_CONFIG };
  }
}

function write(next: StoreShape): void {
  ensureStoreDir();
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2));
  } catch (error) {
    console.error('[YtDlpConfigStore] Failed to write config:', error);
    throw error;
  }
}

/**
 * 获取 Bun 运行时路径
 */
function getBunPath(): string | undefined {
  return getResourcePath('bun');
}

/**
 * 将设置转换为 yt-dlp 配置文件格式
 * 参考：https://github.com/yt-dlp/yt-dlp?tab=readme-ov-file#configuration
 *
 * 注意：
 * - Cookie 配置不在配置文件中，因为需要动态处理浏览器回退逻辑
 * - JavaScript 运行时使用内置的 Bun
 */
function generateYtDlpConf(config: YtDlpConfig): string {
  const lines: string[] = [];

  // 添加文件头注释
  lines.push('# yt-dlp configuration file');
  lines.push(`# Generated automatically by ${pkg.name}`);
  lines.push('# This file is managed by the application settings');
  lines.push('# Manual edits may be overwritten');
  lines.push('');

  // JavaScript 运行时配置（使用内置 Bun）
  const bunPath = getBunPath();
  if (bunPath) {
    // 将 Windows 路径中的反斜杠转换为正斜杠，避免配置文件解析时转义问题
    const normalizedPath = bunPath.replace(/\\/g, '/');
    lines.push('# JavaScript runtime');
    lines.push(`--js-runtimes bun:${normalizedPath}`);
    lines.push('');
  }

  // EJS 远程组件配置
  if (config.ejsRemoteComponents && config.ejsRemoteComponents !== 'none') {
    lines.push('# EJS remote components');
    lines.push(`--remote-components ejs:${config.ejsRemoteComponents}`);
    lines.push('');
  }

  // 下载质量模式
  const formatSelectors: Record<string, { comment: string; format: string }> = {
    best: {
      comment: 'Download quality: best (default)',
      format: 'bestvideo+bestaudio/best'
    },
    '1080p': {
      comment: 'Download quality: limit to 1080p',
      format: 'bv*[height<=1080]+ba/b[height<=1080]'
    },
    '720p': {
      comment: 'Download quality: limit to 720p',
      format: 'bv*[height<=720]+ba/b[height<=720]'
    },
    '480p': {
      comment: 'Download quality: limit to 480p',
      format: 'bv*[height<=480]+ba/b[height<=480] / wv*+ba/w'
    },
    audio: {
      comment: 'Download quality: audio only',
      format: 'bestaudio/best'
    }
  };

  const qualityMode = config.qualityMode;
  if (qualityMode && qualityMode !== '1' && formatSelectors[qualityMode]) {
    const selector = formatSelectors[qualityMode];
    lines.push(`# ${selector.comment}`);
    lines.push(`-f "${selector.format}"`);
    lines.push('');
  }

  // 其他常用配置
  lines.push('# Prefer free formats');
  lines.push('--prefer-free-formats');
  lines.push('');

  return lines.join('\n');
}

/**
 * 写入 yt-dlp 配置文件
 */
function writeYtDlpConf(config: YtDlpConfig): void {
  ensureStoreDir();
  try {
    const content = generateYtDlpConf(config);
    fs.writeFileSync(YTDLP_CONF_FILE, content, 'utf8');
    console.log('[YtDlpConfigStore] yt-dlp config file written:', YTDLP_CONF_FILE);
  } catch (error) {
    console.warn('[YtDlpConfigStore] Failed to write yt-dlp config:', error);
  }
}

export const YtDlpConfigStore = {
  /**
   * 获取完整配置
   */
  getConfig(): YtDlpConfig {
    return read().config;
  },

  /**
   * 设置完整配置
   */
  setConfig(config: Partial<YtDlpConfig>): YtDlpConfig {
    const current = read();
    const merged: YtDlpConfig = {
      ...current.config,
      ...config
    };
    write({ config: merged });
    writeYtDlpConf(merged);
    return merged;
  },

  /**
   * 获取单个配置项
   */
  get<K extends keyof YtDlpConfig>(key: K): YtDlpConfig[K] {
    return read().config[key];
  },

  /**
   * 设置单个配置项
   */
  set<K extends keyof YtDlpConfig>(key: K, value: YtDlpConfig[K]): void {
    const current = read();
    const updated = { ...current.config, [key]: value };
    write({ config: updated });
    writeYtDlpConf(updated);
  },

  /**
   * 获取配置文件路径
   */
  getConfigFilePath(): string {
    return CONFIG_FILE;
  },

  /**
   * 获取 yt-dlp.conf 文件路径
   */
  getYtDlpConfFilePath(): string {
    return YTDLP_CONF_FILE;
  },

  /**
   * 检查 yt-dlp.conf 是否存在
   */
  hasYtDlpConf(): boolean {
    return fs.existsSync(YTDLP_CONF_FILE);
  },

  /**
   * 获取 EJS 配置参数（仅远程组件）
   * 注意：JavaScript 运行时由 yt-dlp 自动检测
   */
  getEjsArgs(): string[] {
    const config = this.getConfig();
    const args: string[] = [];

    const remoteComponents = config.ejsRemoteComponents || 'npm';
    if (remoteComponents !== 'none') {
      args.push('--remote-components', `ejs:${remoteComponents}`);
    }

    return args;
  }
};
