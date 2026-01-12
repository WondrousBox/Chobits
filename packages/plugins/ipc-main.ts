import { windowManager } from '@aim-packages/window-manager';
import { BrowserWindow, ipcMain, net, screen } from 'electron';

import { createDownloader } from '../downloader';
import type { ProxyAgent } from '../downloader/types';
import { DownloadProgress, PluginResource, pluginResourceManager } from '.';
import { PluginConfigStore } from './plugin-config-store';
import { getPluginForCurrentPlatform, loadPluginDefinitions } from './plugin-loader';
import { PluginResourceStore } from './plugin-resource-store';
import { isSystemPresetPlugin } from './types';

// 存储获取 proxy 的方法
let getHttpProxyFn: (() => ProxyAgent | undefined) | null = null;
// 存储获取插件配置文件路径的方法
let getPluginDefinitionsPathFn: (() => string) | null = null;
// 存储进度回调函数
let onProgressFn: ((info: DownloadProgress) => void) | null = null;

export interface InitOptions {
  getHttpProxy?: () => ProxyAgent | undefined;
  getPluginDefinitionsPath?: () => string;
  onProgress?: (info: DownloadProgress) => void;
}

export function initPluginResourceHandlers(win: BrowserWindow, options?: InitOptions): void {
  // 如果提供了 getHttpProxy 方法，则存储它
  if (options?.getHttpProxy) {
    getHttpProxyFn = options.getHttpProxy;
  }
  // 如果提供了 getPluginDefinitionsPath 方法，则存储它
  if (options?.getPluginDefinitionsPath) {
    getPluginDefinitionsPathFn = options.getPluginDefinitionsPath;
  }
  // 如果提供了 onProgress 回调，则存储它
  if (options?.onProgress) {
    onProgressFn = options.onProgress;
  }
  pluginResourceManager.setDownloader(createDownloader());

  // 监听下载进度事件
  pluginResourceManager.on('progress', (info: DownloadProgress) => {
    // 通过回调函数通知外部，由外部处理进度通知
    if (onProgressFn) {
      try {
        onProgressFn(info);
      } catch (error) {
        console.error('[pluginResource] progress callback error', error);
      }
    }
  });

  // 列出支持的插件定义
  ipcMain.handle('plugin-resource:listSupported', async () => {
    if (!getPluginDefinitionsPathFn) {
      throw new Error('Plugin definitions path not configured');
    }
    return loadPluginDefinitions(getPluginDefinitionsPathFn());
  });

  // 列出“已安装的引擎”资源
  ipcMain.handle('plugin-resource:listInstalledEngines', async () => {
    if (!getPluginDefinitionsPathFn) {
      throw new Error('Plugin definitions path not configured');
    }
    const definitions = await loadPluginDefinitions(getPluginDefinitionsPathFn());
    const systemPresetEngines = definitions.filter((d) => d.type === 'engine' && isSystemPresetPlugin(d));

    const all = PluginResourceStore.list();
    const installedEngines = all.filter((r) => r.type === 'engine' && r.status === 'installed' && pluginResourceManager.isInstalled(r));

    // 合并系统预设引擎和已安装的引擎
    return [
      ...systemPresetEngines.map((d) => ({
        id: `${d.pluginId}_${d.type}_${d.id}_${d.version}`,
        pluginId: d.pluginId,
        resourceId: d.id,
        type: d.type,
        name: d.name,
        displayName: d.displayName,
        version: d.version,
        binaryName: d.binaryName,
        archiveType: d.archiveType,
        status: 'installed' as const
      })),
      ...installedEngines
    ];
  });

  // 列出“支持的模型”，仅针对已安装的引擎
  ipcMain.handle('plugin-resource:listSupportedModels', async () => {
    if (!getPluginDefinitionsPathFn) {
      throw new Error('Plugin definitions path not configured');
    }
    const definitions = await loadPluginDefinitions(getPluginDefinitionsPathFn());

    // 获取系统预设引擎
    const systemPresetEngines = definitions.filter((d) => d.type === 'engine' && isSystemPresetPlugin(d));
    const systemPresetPluginIds = new Set(systemPresetEngines.map((e) => e.pluginId));

    // 获取已安装的引擎
    const installedEngines = PluginResourceStore.list().filter((r) => r.type === 'engine' && r.status === 'installed' && pluginResourceManager.isInstalled(r));
    const installedPluginIds = new Set(installedEngines.map((e) => e.pluginId));

    // 合并系统预设和已安装的插件ID
    const allPluginIds = new Set([...systemPresetPluginIds, ...installedPluginIds]);

    return definitions.filter((d) => d.type === 'model' && allPluginIds.has(d.pluginId));
  });

  // 列出所有资源
  ipcMain.handle('plugin-resource:list', async (_e, payload?: { pluginId?: string; type?: 'engine' | 'model' }) => {
    // 获取系统预设插件
    let systemPresetResources: any[] = [];
    if (getPluginDefinitionsPathFn) {
      const definitions = await loadPluginDefinitions(getPluginDefinitionsPathFn());
      const systemPresetPlugins = definitions.filter((d) => isSystemPresetPlugin(d));

      systemPresetResources = systemPresetPlugins
        .filter((d) => {
          if (payload?.pluginId && d.pluginId !== payload.pluginId) return false;
          if (payload?.type && d.type !== payload.type) return false;
          return true;
        })
        .map((d) => ({
          id: `${d.pluginId}_${d.type}_${d.id}_${d.version}`,
          pluginId: d.pluginId,
          resourceId: d.id,
          type: d.type,
          name: d.name,
          displayName: d.displayName,
          version: d.version,
          binaryName: d.binaryName,
          archiveType: d.archiveType,
          status: 'installed' as const
        }));
    }

    // 获取已安装的资源
    let installedResources: any[] = [];
    if (payload?.pluginId) {
      if (payload.type) {
        installedResources = PluginResourceStore.listByType(payload.pluginId, payload.type);
      } else {
        installedResources = PluginResourceStore.listByPlugin(payload.pluginId);
      }
    } else {
      installedResources = PluginResourceStore.list();
    }

    // 合并系统预设和已安装的资源，去重（以 id 为准）
    const resourceMap = new Map<string, any>();
    [...systemPresetResources, ...installedResources].forEach((r) => {
      if (!resourceMap.has(r.id)) {
        resourceMap.set(r.id, r);
      }
    });

    return Array.from(resourceMap.values());
  });

  // 获取单个资源
  ipcMain.handle('plugin-resource:get', async (_e, payload: { id: string }) => {
    return PluginResourceStore.get(payload.id);
  });

  // 安装资源（Engine或模型）
  ipcMain.handle('plugin-resource:install', async (event, payload: { pluginId: string; resourceId: string; deleteAfterInstall?: boolean }) => {
    console.log('plugin-resource:install', payload);

    if (!getPluginDefinitionsPathFn) {
      return { ok: false, error: 'Plugin definitions path not configured' };
    }
    const definitions = await loadPluginDefinitions(getPluginDefinitionsPathFn());
    const pluginDef = definitions.find((p) => p.id === payload.resourceId && p.pluginId === payload.pluginId);
    console.log(pluginDef);

    if (!pluginDef) {
      return { ok: false, error: 'PLUGIN_NOT_FOUND' };
    }

    // 如果是系统预设插件，直接返回已安装状态
    if (isSystemPresetPlugin(pluginDef)) {
      const deterministicId = `${pluginDef.pluginId}_${pluginDef.type}_${pluginDef.id}_${pluginDef.version}`;
      const resource: PluginResource = {
        id: deterministicId,
        pluginId: pluginDef.pluginId,
        resourceId: pluginDef.id,
        type: pluginDef.type,
        name: pluginDef.name,
        displayName: pluginDef.displayName,
        version: pluginDef.version,
        binaryName: pluginDef.binaryName,
        archiveType: pluginDef.archiveType || 'none',
        status: 'installed'
      };
      return { ok: true, data: resource, message: 'System preset plugin, already installed' };
    }

    const platformInfo = getPluginForCurrentPlatform(pluginDef);
    console.log('platformInfo', platformInfo);

    if (!platformInfo) {
      return { ok: false, error: 'PLATFORM_NOT_SUPPORTED' };
    }

    // 构建确定性资源ID：pluginId_version[_sha256]
    const deterministicId = `${pluginDef.pluginId}_${pluginDef.type}_${pluginDef.id}_${pluginDef.version}${platformInfo.sha256 ? `_${platformInfo.sha256}` : ''}`;
    console.log('deterministicId', deterministicId);

    // 如果已存在同ID资源，避免重复安装
    const existing = PluginResourceStore.get(deterministicId);
    console.log('existing', existing);
    if (existing) {
      // 已安装则直接返回
      if (existing.status === 'installed' && pluginResourceManager.isInstalled(existing)) {
        console.log('existing is installed and isInstalled', existing);
        return { ok: true, data: existing, message: 'Resource already installed' };
      }
      // 正在处理中则直接返回
      if (['queued', 'downloading', 'extracting', 'verifying'].includes(existing.status || '')) {
        console.log('existing is in progress', existing);
        return { ok: true, data: existing, message: 'Resource already in progress' };
      }
    }

    // 构建资源对象
    const resource: PluginResource = {
      id: deterministicId,
      pluginId: pluginDef.pluginId,
      resourceId: pluginDef.id,
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
    const proxyAgent = getHttpProxyFn ? getHttpProxyFn() : undefined;
    pluginResourceManager.enqueue(resource, payload.deleteAfterInstall ?? false, { proxyAgent });

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
    // 先检查是否是系统预设插件
    if (getPluginDefinitionsPathFn) {
      const definitions = await loadPluginDefinitions(getPluginDefinitionsPathFn());
      // 从 id 中提取信息：格式为 pluginId_type_id_version[_sha256]
      const parts = payload.id.split('_');
      if (parts.length >= 4) {
        const pluginId = parts[0];
        const type = parts[1] as 'engine' | 'model';
        const resourceId = parts.slice(2, -1).join('_'); // 处理 id 中可能包含下划线的情况
        const pluginDef = definitions.find((p) => p.pluginId === pluginId && p.id === resourceId && p.type === type);
        if (pluginDef && isSystemPresetPlugin(pluginDef)) {
          return { ok: true, installed: true };
        }
      }
    }

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
