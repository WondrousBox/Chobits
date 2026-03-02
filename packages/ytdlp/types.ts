/**
 * yt-dlp 下载质量模式
 */
export type QualityMode = '1' | 'best' | '1080p' | '720p' | '480p' | 'audio';

/**
 * EJS 远程组件来源
 */
export type EjsRemoteComponents = 'github' | 'npm' | 'none';

/**
 * yt-dlp 配置
 */
export interface YtDlpConfig {
  /** 下载质量模式 */
  qualityMode: QualityMode;
  /** 是否使用 cookies */
  useCookies: boolean;
  /** EJS 远程组件来源 */
  ejsRemoteComponents: EjsRemoteComponents;
}

/**
 * yt-dlp 二进制信息
 */
export interface YtDlpBinaryInfo {
  /** 二进制文件路径 */
  path: string;
  /** 版本号 */
  version: string | null;
  /** 是否为内置版本 */
  isBuiltin: boolean;
}

/**
 * yt-dlp 执行选项
 */
export interface YtDlpExecOptions {
  /** 命令行参数 */
  args: string[];
  /** 中止信号 */
  signal?: AbortSignal;
  /** 进度回调 */
  onProgress?: (progress: YtDlpProgress) => void;
}

/**
 * yt-dlp 下载进度
 */
export interface YtDlpProgress {
  /** 下载百分比 */
  percent?: number;
  /** 总大小 */
  totalSize?: string;
  /** 当前速度 */
  currentSpeed?: string;
  /** 预计剩余时间 */
  eta?: string;
}

/**
 * GitHub Release 资产信息
 */
export interface YtDlpAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

/**
 * GitHub Release 信息
 */
export interface YtDlpReleaseInfo {
  tag_name: string;
  name: string;
  published_at: string;
  assets: YtDlpAsset[];
  body?: string;
}

/**
 * 下载进度信息
 */
export interface YtDlpDownloadProgress {
  received: number;
  total?: number;
  percent?: number;
  status?: 'downloading' | 'extracting' | 'installing' | 'completed' | 'error';
  message?: string;
}

/**
 * 检查更新信息
 */
export interface YtDlpUpdateInfo {
  current: string | null;
  latest: string;
  hasUpdate: boolean;
  path: string;
  recentReleases: YtDlpReleaseInfo[];
}

/**
 * 下载安装结果
 */
export interface YtDlpInstallResult {
  installedVersion: string;
  path: string;
}

/**
 * Cookie 管理器接口
 * 用于注入到 YtDlpService 中
 */
export interface ICookieManager {
  isLoggedIn(): boolean;
  exportNetscapeCookies(outputPath?: string): Promise<string>;
  getCookies(): any[];
}

/**
 * YtDlpService 初始化选项
 */
export interface YtDlpServiceOptions {
  /** Cookie 管理器实例 */
  cookieManager?: ICookieManager;
}
