/**
 * yt-dlp 统一管理包
 *
 * 注意：此 index.ts 导出所有模块，包括主进程专用模块。
 * 预加载脚本应直接从 './ipc-renderer' 导入，以避免引入主进程代码。
 *
 * 主进程导入: import { ytdlpService, initYtDlpIpcHandlers } from '@packages/ytdlp';
 * 预加载脚本导入: import { ytdlpIpcRenderer } from '@packages/ytdlp/ipc-renderer';
 */

// 核心服务（仅主进程）
export { YtDlpService, ytdlpService } from './ytdlp-service';

// 执行器（仅主进程）
export { isUnsupportedOptionError, UnsupportedOptionError, YtDlpExecutor, ytdlpExecutor } from './ytdlp-executor';

// 配置存储（仅主进程）
export { CONFIG_FILE, YtDlpConfigStore } from './ytdlp-config-store';

// 更新器（仅主进程）
export type { YtDlpAsset, YtDlpDownloadProgress, YtDlpInstallResult, YtDlpReleaseInfo, YtDlpUpdateInfo } from './updater';
export { checkYtDlpUpdate, compareYtDlpVersion, downloadAndInstallVersion, ensureYtdlpBinaryPath, fetchLatestRelease, fetchRecentReleases } from './updater';

// IPC（主进程 handler）
export { initYtDlpIpcHandlers } from './ipc-main';

// IPC（渲染进程 API）- 预加载脚本请直接从 './ipc-renderer' 导入
export type { YtDlpIpcRendererType } from './ipc-renderer';
export { ytdlpIpcRenderer } from './ipc-renderer';

// 类型
export type { EjsRemoteComponents, ICookieManager, QualityMode, YtDlpBinaryInfo, YtDlpConfig, YtDlpExecOptions, YtDlpProgress, YtDlpServiceOptions } from './types';
