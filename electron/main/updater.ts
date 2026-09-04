import { Env } from '@packages/common/utils';
// electron-updater 是 CommonJS 模块，ESM 产物下只能用默认导入
import electronUpdater from 'electron-updater';

import { logger } from './logger';

const { autoUpdater } = electronUpdater;

/** 启动后首次检查更新的延迟，避免阻塞窗口创建与首屏网络请求 */
const INITIAL_UPDATE_CHECK_DELAY_MS = 10_000;
/** 周期检查更新的间隔（4 小时） */
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

/** 更新检查的当前状态，供手动检查入口回报 */
export type UpdateCheckStatus = 'disabled' | 'idle' | 'checking' | 'available' | 'not-available' | 'downloaded' | 'error';

export interface UpdateCheckResult {
  ok: boolean;
  status?: UpdateCheckStatus;
  version?: string;
  error?: string;
}

let updateStatus: UpdateCheckStatus = 'idle';
let updateVersion: string | undefined;
let isInitialized = false;

async function runUpdateCheck(): Promise<void> {
  try {
    // 检查过程中的状态推进由下方事件监听完成；
    // checkForUpdates() 在出错时会同时触发 'error' 事件并 reject，错误日志在事件里统一记，这里只兜底状态
    await autoUpdater.checkForUpdates();
  } catch {
    if (updateStatus !== 'error') {
      updateStatus = 'error';
      logger.log.error('[updater] 检查更新失败（未触发 error 事件的异常）');
    }
  }
}

/**
 * 初始化自动更新。仅生产环境生效，开发环境直接跳过。
 * 更新下载完成后保持 autoInstallOnAppQuit 默认行为：用户下次正常退出时自动安装。
 * 渲染端暂无事件消费方，这里只记日志，不向渲染端广播。
 */
export function initAutoUpdater(): void {
  if (!Env.isProd() || isInitialized) return;
  isInitialized = true;

  autoUpdater.logger = logger.log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    updateStatus = 'checking';
    logger.log.info('[updater] 正在检查更新…');
  });

  autoUpdater.on('update-available', (info) => {
    updateStatus = 'available';
    updateVersion = info.version;
    logger.log.info(`[updater] 发现新版本 ${info.version}，开始后台下载`);
  });

  autoUpdater.on('update-not-available', () => {
    updateStatus = 'not-available';
    logger.log.info('[updater] 当前已是最新版本');
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateStatus = 'downloaded';
    updateVersion = info.version;
    logger.log.info(`[updater] 新版本 ${info.version} 下载完成，将在应用退出时自动安装`);
  });

  autoUpdater.on('error', (error) => {
    updateStatus = 'error';
    // 更新失败不打扰用户，只记日志
    logger.log.error('[updater] 自动更新出错', error);
  });

  // 首次检查延迟执行，不阻塞窗口创建；之后按固定间隔周期检查
  setTimeout(() => void runUpdateCheck(), INITIAL_UPDATE_CHECK_DELAY_MS);
  setInterval(() => void runUpdateCheck(), UPDATE_CHECK_INTERVAL_MS);
}

/**
 * 手动检查更新（设置页「检查更新」按钮走这里），返回 { ok } 包络与当前状态。
 */
export async function checkForUpdatesManually(): Promise<UpdateCheckResult> {
  if (!Env.isProd()) {
    return { ok: false, status: 'disabled', error: '开发环境不支持自动更新，仅生产构建可用' };
  }
  await runUpdateCheck();
  return { ok: true, status: updateStatus, version: updateVersion };
}
