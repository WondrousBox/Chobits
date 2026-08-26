import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import fetch from 'node-fetch';

import { getHttpProxy } from '../../electron/main/handlers/proxy/proxy';
import type { YtDlpAsset, YtDlpDownloadProgress, YtDlpInstallResult, YtDlpReleaseInfo, YtDlpUpdateInfo } from './types';
import { ytdlpService } from './ytdlp-service';

/**
 * 获取最新的 release 信息
 */
export async function fetchLatestRelease(): Promise<YtDlpReleaseInfo> {
  const res = await fetch('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', {
    agent: getHttpProxy() as any,
    headers: { Accept: 'application/vnd.github+json' }
  });
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status}`);
  }

  return (await res.json()) as YtDlpReleaseInfo;
}

/**
 * 获取最近的 N 个 releases
 * @param count 获取的 release 数量，默认 5
 */
export async function fetchRecentReleases(count: number = 5): Promise<YtDlpReleaseInfo[]> {
  const res = await fetch(`https://api.github.com/repos/yt-dlp/yt-dlp/releases?per_page=${count}`, {
    agent: getHttpProxy() as any,
    headers: { Accept: 'application/vnd.github+json' }
  });
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status}`);
  }

  return (await res.json()) as YtDlpReleaseInfo[];
}

/**
 * 比较 yt-dlp 版本
 * @returns 负数表示 a < b，正数表示 a > b，0 表示相等
 */
export function compareYtDlpVersion(a?: string | null, b?: string | null): number {
  // yt-dlp 版本通常为 YYYY.MM.DD[.patch]，按数值分段比较
  const pa = (a || '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = (b || '').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) {
      return da - db;
    }
  }

  return 0;
}

/**
 * 递归查找指定文件名的文件
 * @param dir 要搜索的目录
 * @param fileName 要查找的文件名
 * @returns 找到的文件完整路径，如果未找到则返回 null
 */
function findBinaryFile(dir: string, fileName: string): string | null {
  if (!fs.existsSync(dir)) {
    return null;
  }

  try {
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const itemPath = path.join(dir, item);
      const stat = fs.statSync(itemPath);

      if (stat.isDirectory()) {
        const found = findBinaryFile(itemPath, fileName);
        if (found) {
          return found;
        }
      } else if (stat.isFile() && item === fileName) {
        return itemPath;
      }
    }
  } catch (error) {
    console.error('[yt-dlp] Error searching for binary file:', error);
  }

  return null;
}

/**
 * 下载文件到指定路径
 */
async function downloadToFile(url: string, destPath: string, onProgress?: (p: YtDlpDownloadProgress) => void): Promise<void> {
  const res = await fetch(url, { agent: getHttpProxy() as any });
  if (!res.ok || !res.body) {
    throw new Error(`下载失败: ${res.status}`);
  }

  const body = res.body;
  const total = Number(res.headers.get('content-length') || 0) || undefined;
  let received = 0;

  await new Promise<void>((resolve, reject) => {
    const ws = fs.createWriteStream(destPath);
    body.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (onProgress) {
        const percent = total ? Math.min(1, received / total) : undefined;
        onProgress({ received, total, percent, status: 'downloading' });
      }
    });
    body.on('error', (e: any) => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      reject(e);
    });
    body.pipe(ws);
    ws.on('finish', () => {
      ws.close();
      resolve();
    });
    ws.on('error', (e: any) => reject(e));
  });
}

/**
 * 递归复制文件夹
 */
async function copyFolderRecursive(src: string, dest: string): Promise<void> {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const items = fs.readdirSync(src);
  for (const item of items) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      await copyFolderRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * 使用 7zip 解压文件（简化版本，使用 Node.js 内置解压）
 */
async function unzipFile(zipPath: string, destDir: string): Promise<void> {
  // 使用 adm-zip 或者系统命令解压
  if (os.platform() === 'darwin') {
    // macOS 使用 unzip 命令
    execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: 'pipe' });
  } else if (os.platform() === 'win32') {
    // Windows 使用 PowerShell 解压
    execSync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`, {
      stdio: 'pipe'
    });
  } else {
    // Linux 使用 unzip
    execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: 'pipe' });
  }
}

import os from 'node:os';

/**
 * yt-dlp GitHub release 中按平台发布的资产名
 * （与本地存储文件名不同：linux 官方二进制叫 yt-dlp_linux）
 */
function getYtDlpAssetName(): string {
  switch (os.platform()) {
    case 'darwin':
      return 'yt-dlp_macos';
    case 'win32':
      return 'yt-dlp.exe';
    default:
      return 'yt-dlp_linux';
  }
}

/**
 * 下载并安装指定版本的 yt-dlp
 * @param release 要安装的 release 信息，如果不传则安装最新版本
 * @param onProgress 进度回调
 */
export async function downloadAndInstallVersion(release?: YtDlpReleaseInfo, onProgress?: (p: YtDlpDownloadProgress) => void): Promise<YtDlpInstallResult> {
  // 如果没有指定版本，获取最新版本
  if (!release) {
    release = await fetchLatestRelease();
  }

  const assetName = getYtDlpAssetName();
  const isMacOS = os.platform() === 'darwin';

  // macOS 优先查找 zip 文件，Windows / Linux 优先查找可执行文件
  const zipAssetName = `${assetName}.zip`;
  const asset = isMacOS
    ? release.assets.find((a) => a.name === zipAssetName) || release.assets.find((a) => a.name === assetName)
    : release.assets.find((a) => a.name === assetName) || release.assets.find((a) => a.name === zipAssetName);

  if (!asset) {
    throw new Error('未找到匹配平台的 yt-dlp 资产');
  }

  const destPath = ytdlpService.getUserBinaryPath();

  console.log('[yt-dlp] downloadAndInstallVersion', { version: release.tag_name, asset: asset.name });

  // macOS 优先使用 zip 下载并解压，Windows / Linux 优先直接下载可执行文件
  if (asset.name.endsWith('.zip')) {
    // 下载 zip 并解压
    const tmpZip = destPath + '.zip.downloading';
    console.log('[yt-dlp] downloading from', asset.browser_download_url);
    await downloadToFile(asset.browser_download_url, tmpZip, onProgress);

    onProgress?.({ received: 0, status: 'extracting', message: '正在解压...' });

    // 使用系统命令解压到临时目录
    const tmpExtractDir = path.dirname(destPath) + '.extracting';
    try {
      if (!fs.existsSync(tmpExtractDir)) {
        fs.mkdirSync(tmpExtractDir, { recursive: true });
      }

      await unzipFile(tmpZip, tmpExtractDir);

      onProgress?.({ received: 0, status: 'installing', message: '正在安装...' });

      // 递归查找二进制文件（压缩包内的文件名与 release 资产名一致）
      const foundPath = findBinaryFile(tmpExtractDir, assetName);
      if (!foundPath) {
        throw new Error('压缩包中未找到 yt-dlp 可执行文件');
      }

      const foundDir = path.dirname(foundPath);
      const destDir = path.dirname(destPath);

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      // 清理目标目录中的旧文件
      try {
        if (fs.existsSync(destDir)) {
          const oldFiles = fs.readdirSync(destDir);
          for (const file of oldFiles) {
            const filePath = path.join(destDir, file);
            try {
              const stat = fs.statSync(filePath);
              if (stat.isDirectory()) {
                fs.rmSync(filePath, { recursive: true, force: true });
              } else {
                fs.unlinkSync(filePath);
              }
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* ignore */
      }

      // 复制整个目录结构到目标目录
      await copyFolderRecursive(foundDir, destDir);

      // 资产名与本地存储名可能不同（如 linux 的 yt-dlp_linux → yt-dlp），需要重命名
      const copiedPath = path.join(destDir, path.basename(foundPath));
      if (copiedPath !== destPath && fs.existsSync(copiedPath)) {
        try {
          if (fs.existsSync(destPath)) {
            fs.unlinkSync(destPath);
          }
        } catch {
          /* ignore */
        }
        fs.renameSync(copiedPath, destPath);
      }

      // 清理临时文件和目录
      try {
        fs.unlinkSync(tmpZip);
      } catch {
        /* ignore */
      }
      try {
        fs.rmSync(tmpExtractDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    } catch (error) {
      // 清理临时文件
      try {
        fs.unlinkSync(tmpZip);
      } catch {
        /* ignore */
      }
      try {
        fs.rmSync(tmpExtractDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      throw error;
    }
  } else {
    // 直接下载二进制文件
    const tmpBin = destPath + '.downloading';
    await downloadToFile(asset.browser_download_url, tmpBin, onProgress);

    onProgress?.({ received: 0, status: 'installing', message: '正在安装...' });

    try {
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
    } catch {
      /* ignore */
    }
    fs.renameSync(tmpBin, destPath);
  }

  // 设置可执行权限
  if (os.platform() !== 'win32') {
    try {
      fs.chmodSync(destPath, 0o755);
    } catch {
      void 0;
    }
  }

  // 更新服务中的二进制路径
  ytdlpService.updateBinaryPath(destPath);

  const installedVersion = await ytdlpService.getExecutor().getVersion();

  onProgress?.({ received: 0, status: 'completed', message: '安装完成' });

  return { installedVersion, path: destPath };
}

/**
 * 检查 yt-dlp 更新
 * @param includeRecentReleases 是否包含最近的版本列表
 */
export async function checkYtDlpUpdate(includeRecentReleases: boolean = true): Promise<YtDlpUpdateInfo> {
  const currentPath = ytdlpService.getCurrentBinaryPath();
  const binaryInfo = await ytdlpService.getBinaryInfo();
  const current = binaryInfo.version;

  // 获取最近的版本列表
  const recentReleases = includeRecentReleases ? await fetchRecentReleases(5) : [];

  const latestVersion = recentReleases.length > 0 ? (recentReleases[0].tag_name || '').replace(/^v/, '') : '';

  const hasUpdate = compareYtDlpVersion(current, latestVersion) < 0;

  console.log('[yt-dlp] checkYtDlpUpdate', {
    current: current || null,
    latest: latestVersion,
    hasUpdate,
    path: currentPath
  });

  return {
    current: current || null,
    latest: latestVersion,
    hasUpdate,
    path: currentPath,
    recentReleases
  };
}

/**
 * 确保 yt-dlp 使用正确的二进制路径
 * 应该在 electron 启动后尽早调用
 */
export function ensureYtdlpBinaryPath(): string {
  const currentPath = ytdlpService.getCurrentBinaryPath();
  ytdlpService.updateBinaryPath(currentPath);
  console.log('[yt-dlp] ensureYtdlpBinaryPath:', currentPath);
  return currentPath;
}

// 重新导出类型
export type { YtDlpAsset, YtDlpDownloadProgress, YtDlpInstallResult, YtDlpReleaseInfo, YtDlpUpdateInfo };
