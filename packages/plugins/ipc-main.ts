import { BrowserWindow, ipcMain, net, screen } from 'electron';

import { createBestDownloader } from '../downloader/create';
import { windowManager } from '../window-manager';
import { PluginConfigStore } from './plugin-config-store';
import { getPluginForCurrentPlatform, loadPluginDefinitions } from './plugin-loader';
import { DownloadProgress, PluginResource, pluginResourceManager } from './plugin-resource-manager';
import { PluginResourceStore } from './plugin-resource-store';

export function init(win: BrowserWindow): void {
  // 初始化下载器（优先 electron-dl-manager，不可用则回退 HTTP）
  try {
    pluginResourceManager.setDownloader(createBestDownloader(win));
  } catch {
    // ignore, pluginResourceManager has HTTP fallback by default
  }

  // 监听下载进度事件
  pluginResourceManager.on('progress', (info: DownloadProgress) => {
    try {
      // 发送到主窗口
      win.webContents.send('plugin-resource:progress', info);
    } catch {
      // 窗口可能已关闭
    }
    // 同时发送到插件下载窗口
    try {
      const downloadWindow = windowManager.get('pluginDownload');
      if (downloadWindow && !downloadWindow.isDestroyed()) {
        downloadWindow.webContents.send('plugin-resource:progress', info);
      }
    } catch {
      // 窗口可能不存在或已关闭
    }
  });

  // 列出支持的插件定义
  ipcMain.handle('plugin-resource:listSupported', async () => {
    return loadPluginDefinitions();
  });

  // 列出“已安装的引擎”资源
  ipcMain.handle('plugin-resource:listInstalledEngines', async () => {
    const all = PluginResourceStore.list();
    return all.filter((r) => r.type === 'engine' && r.status === 'installed' && pluginResourceManager.isInstalled(r));
  });

  // 列出“支持的模型”，仅针对已安装的引擎
  ipcMain.handle('plugin-resource:listSupportedModels', async () => {
    const definitions = await loadPluginDefinitions();
    const installedEngines = PluginResourceStore.list().filter((r) => r.type === 'engine' && r.status === 'installed' && pluginResourceManager.isInstalled(r));
    const installedPluginIds = new Set(installedEngines.map((e) => e.pluginId));
    return definitions.filter((d) => d.type === 'model' && installedPluginIds.has(d.pluginId));
  });

  // 列出所有资源
  ipcMain.handle('plugin-resource:list', async (_e, payload?: { pluginId?: string; type?: 'engine' | 'model' }) => {
    if (payload?.pluginId) {
      if (payload.type) {
        return PluginResourceStore.listByType(payload.pluginId, payload.type);
      }
      return PluginResourceStore.listByPlugin(payload.pluginId);
    }
    return PluginResourceStore.list();
  });

  // 获取单个资源
  ipcMain.handle('plugin-resource:get', async (_e, payload: { id: string }) => {
    return PluginResourceStore.get(payload.id);
  });

  // 安装资源（Engine或模型）
  ipcMain.handle('plugin-resource:install', async (event, payload: { pluginId: string; resourceId: string; deleteAfterInstall?: boolean }) => {
    console.log('plugin-resource:install', payload);

    const definitions = await loadPluginDefinitions();
    const pluginDef = definitions.find((p) => p.id === payload.resourceId && p.pluginId === payload.pluginId);
    console.log(pluginDef);

    if (!pluginDef) {
      return { ok: false, error: 'PLUGIN_NOT_FOUND' };
    }

    const platformInfo = getPluginForCurrentPlatform(pluginDef);
    console.log('platformInfo', platformInfo);

    if (!platformInfo) {
      return { ok: false, error: 'PLATFORM_NOT_SUPPORTED' };
    }

    // 构建确定性资源ID：pluginId_version[_sha256]
    // 清理 pluginId 中的冒号，使用下划线替代，避免 Windows 文件名不兼容问题
    const sanitizedPluginId = pluginDef.pluginId.replace(/:/g, '_');
    const deterministicId = `${sanitizedPluginId}_${pluginDef.version}${platformInfo.sha256 ? `_${platformInfo.sha256}` : ''}`;
    console.log('deterministicId', deterministicId);

    // 如果已存在同ID资源，避免重复安装
    const existing = PluginResourceStore.get(deterministicId);
    console.log('existing', existing);
    if (existing) {
      // 已安装则直接返回
      if (existing.status === 'installed' && pluginResourceManager.isInstalled(existing)) {
        return { ok: true, data: existing, message: 'Resource already installed' };
      }
      // 正在处理中则直接返回
      if (['queued', 'downloading', 'extracting', 'verifying'].includes(existing.status || '')) {
        return { ok: true, data: existing, message: 'Resource already in progress' };
      }
    }

    // 构建资源对象
    const resource: PluginResource = {
      id: deterministicId,
      pluginId: pluginDef.pluginId,
      type: pluginDef.type,
      name: pluginDef.name,
      displayName: pluginDef.displayName,
      version: pluginDef.version,
      binaryName: pluginDef.binaryName,
      archiveType: pluginDef.archiveType || 'zip',
      sourceUrl: platformInfo.sourceUrl,
      sizeBytes: platformInfo.sizeBytes,
      sha256: platformInfo.sha256,
      status: 'queued'
    };

    // 检查是否已安装（基于文件存在）
    if (pluginResourceManager.isInstalled(resource)) {
      // 同ID不存在但文件已存在时，也直接返回已安装
      return { ok: true, data: resource, message: 'Resource already installed' };
    }

    console.log('resource', resource);
    console.log('payload', payload);

    // 加入下载队列，支持deleteAfterInstall参数（默认为false，不删除下载文件）
    pluginResourceManager.enqueue(resource, payload.deleteAfterInstall ?? false);

    // 自动打开插件下载窗口
    try {
      const requester = BrowserWindow.fromWebContents(event.sender);
      const display = requester ? screen.getDisplayMatching(requester.getBounds()) : null;
      if (display) {
        await windowManager.createOrShowOnDisplay('pluginDownload', display);
      } else {
        await windowManager.createOrShow('pluginDownload');
      }
    } catch (error) {
      console.warn('[pluginResource] open download window failed', error);
    }

    return { ok: true, data: resource };
  });

  // 取消下载
  ipcMain.handle('plugin-resource:cancel', async (_e, payload: { id: string }) => {
    pluginResourceManager.cancel(payload.id);
    return { ok: true };
  });

  // 检查资源是否已安装
  ipcMain.handle('plugin-resource:isInstalled', async (_e, payload: { id: string }) => {
    const resource = PluginResourceStore.get(payload.id);
    if (!resource) {
      return { ok: false, error: 'Resource not found' };
    }
    const installed = pluginResourceManager.isInstalled(resource);
    return { ok: true, installed };
  });

  // 获取Engine路径
  ipcMain.handle('plugin-resource:getEnginePath', async (_e, payload: { pluginId: string; binaryName: string }) => {
    const enginePath = pluginResourceManager.getEnginePath(payload.pluginId, payload.binaryName);
    return { ok: true, path: enginePath };
  });

  // 获取模型路径
  ipcMain.handle('plugin-resource:getModelPath', async (_e, payload: { pluginId: string; modelName: string }) => {
    const modelPath = pluginResourceManager.getModelPath(payload.pluginId, payload.modelName);
    return { ok: true, path: modelPath };
  });

  // 删除资源（从store中移除，不删除文件）
  ipcMain.handle('plugin-resource:remove', async (_e, payload: { id: string }) => {
    const removed = PluginResourceStore.remove(payload.id);
    return { ok: removed };
  });

  // 获取下载目录
  ipcMain.handle('plugin-resource:getDownloadDir', async () => {
    const downloadDir = pluginResourceManager.getDownloadDir();
    return { ok: true, path: downloadDir };
  });

  // 设置下载目录
  ipcMain.handle('plugin-resource:setDownloadDir', async (_e, payload: { dir: string }) => {
    pluginResourceManager.setDownloadDir(payload.dir);
    return { ok: true };
  });

  // 获取插件目录
  ipcMain.handle('plugin-resource:getPluginsDir', async () => {
    const pluginsDir = pluginResourceManager.getPluginsDir();
    return { ok: true, path: pluginsDir };
  });

  // 设置插件目录
  ipcMain.handle('plugin-resource:setPluginsDir', async (_e, payload: { dir: string }) => {
    pluginResourceManager.setPluginsDir(payload.dir);
    return { ok: true };
  });

  // 获取并发数
  ipcMain.handle('plugin-resource:getConcurrency', async () => {
    const config = PluginConfigStore.getConfig();
    return { ok: true, concurrency: config.concurrency ?? 2 };
  });

  // 设置并发数
  ipcMain.handle('plugin-resource:setConcurrency', async (_e, payload: { concurrency: number }) => {
    pluginResourceManager.setConcurrency(payload.concurrency);
    return { ok: true };
  });

  // 检测网络连通性（使用系统代理设置，类似 electron-dl）
  ipcMain.handle('plugin-resource:checkNetwork', async () => {
    const sites = [
      { name: 'Hugging Face', url: 'https://huggingface.co' },
      { name: 'GitHub', url: 'https://github.com' }
    ];

    const results = await Promise.all(
      sites.map(async (site) => {
        try {
          // 使用 Electron 的 net 模块，它会自动使用系统的代理设置
          // 这与 electron-dl 使用 BrowserWindow 的方式类似，都会使用系统的代理配置
          const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
            const timeout = setTimeout(() => {
              resolve({ success: false, error: '请求超时' });
            }, 10000); // 10秒超时

            try {
              const request = net.request({
                method: 'HEAD',
                url: site.url
              });

              let resolved = false;

              const resolveOnce = (result: { success: boolean; error?: string }): void => {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timeout);
                  resolve(result);
                }
              };

              // 设置请求超时（8秒）
              const requestTimeout = setTimeout(() => {
                if (!resolved) {
                  request.abort();
                  resolveOnce({ success: false, error: '请求超时' });
                }
              }, 8000);

              request.on('response', (response) => {
                const statusCode = response.statusCode || 0;
                resolveOnce({ success: statusCode >= 200 && statusCode < 400 });
                clearTimeout(requestTimeout);
              });

              request.on('error', (error) => {
                resolveOnce({ success: false, error: error.message || '网络错误' });
                clearTimeout(requestTimeout);
              });

              request.on('abort', () => {
                if (!resolved) {
                  resolveOnce({ success: false, error: '请求被中止' });
                }
                clearTimeout(requestTimeout);
              });

              request.end();
            } catch (error: any) {
              clearTimeout(timeout);
              resolve({ success: false, error: error.message || '请求失败' });
            }
          });

          return {
            name: site.name,
            url: site.url,
            success: result.success,
            error: result.error
          };
        } catch (error: any) {
          return {
            name: site.name,
            url: site.url,
            success: false,
            error: error.message || '未知错误'
          };
        }
      })
    );

    return { ok: true, results };
  });
}
