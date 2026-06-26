import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { ProxyAgent } from '@aim-packages/downloader';
import { createDownloader } from '@aim-packages/downloader';
import { windowManager } from '@aim-packages/window-manager';
import { AppEvent, eventManager } from '@packages/event';
import { BrowserWindow, ipcMain, net, screen } from 'electron';

import { DownloadProgress, PluginResource, pluginResourceManager } from '.';
import { PluginConfigStore } from './plugin-config-store';
import { getPluginForCurrentPlatform, loadPluginDefinitions } from './plugin-loader';
import { PluginResourceStore } from './plugin-resource-store';
import { isSystemPresetPlugin, type PluginDefinition } from './types';

// 存储获取 proxy 的方法
let getHttpProxyFn: (() => ProxyAgent | undefined) | null = null;
// 存储获取插件配置文件路径的方法
let getPluginDefinitionsPathFn: (() => string) | null = null;
// 存储进度回调函数
let onProgressFn: ((info: DownloadProgress) => void) | null = null;
const pendingInstallRequests = new Map<string, Promise<{ ok: boolean; data?: any; error?: string; message?: string }>>();

function getFilesSizeBytes(files?: PluginResource['files']): number | undefined {
  if (!files?.length) return undefined;
  const total = files.reduce((sum, file) => sum + (file.sizeBytes || 0), 0);
  return total > 0 ? total : undefined;
}

function getFilesDigest(files?: PluginResource['files']): string | undefined {
  if (!files?.length || files.some((file) => !file.sha256)) return undefined;
  const payload = files.map((file) => `${file.path}:${file.sha256}`).join('|');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function getDeterministicResourceId(pluginDef: PluginDefinition, platformInfo?: PluginDefinition['platforms'][number]): string {
  const deterministicHash = platformInfo?.sha256 || getFilesDigest(platformInfo?.files);
  return `${pluginDef.pluginId}_${pluginDef.type}_${pluginDef.id}_${pluginDef.version}${deterministicHash ? `_${deterministicHash}` : ''}`;
}

function hydrateResourceFromDefinition(pluginDef: PluginDefinition, platformInfo?: PluginDefinition['platforms'][number]): PluginResource {
  const resource: PluginResource = {
    id: getDeterministicResourceId(pluginDef, platformInfo),
    pluginId: pluginDef.pluginId,
    resourceId: pluginDef.id,
    type: pluginDef.type,
    name: pluginDef.name,
    displayName: pluginDef.displayName,
    version: pluginDef.version,
    binaryName: pluginDef.binaryName,
    archiveType: pluginDef.archiveType || 'zip',
    sourceUrl: platformInfo?.sourceUrl,
    sizeBytes: platformInfo?.sizeBytes || getFilesSizeBytes(platformInfo?.files),
    sha256: platformInfo?.sha256,
    files: platformInfo?.files,
    status: 'installed'
  };
  resource.installPath =
    resource.type === 'engine' ? pluginResourceManager.getEnginePath(resource.pluginId, resource.binaryName || resource.name) : pluginResourceManager.getModelPath(resource.pluginId, resource.name);
  return resource;
}

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
    const installedIds = new Set(installedEngines.map((engine) => engine.id));
    const hydratedEngines = definitions
      .filter((definition) => definition.type === 'engine' && !isSystemPresetPlugin(definition))
      .map((definition) => {
        const platformInfo = getPluginForCurrentPlatform(definition);
        return platformInfo ? hydrateResourceFromDefinition(definition, platformInfo) : null;
      })
      .filter((resource): resource is PluginResource => resource !== null && !installedIds.has(resource.id) && pluginResourceManager.isInstalled(resource))
      .map((resource) => {
        PluginResourceStore.upsert(resource);
        return resource;
      });

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
      ...installedEngines,
      ...hydratedEngines
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
    let definitions: PluginDefinition[] = [];
    // 获取系统预设插件
    let systemPresetResources: any[] = [];
    if (getPluginDefinitionsPathFn) {
      definitions = await loadPluginDefinitions(getPluginDefinitionsPathFn());
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

    const installedIds = new Set(installedResources.map((resource) => resource.id));
    const hydratedResources = definitions
      .filter((definition) => {
        if (isSystemPresetPlugin(definition)) return false;
        if (payload?.pluginId && definition.pluginId !== payload.pluginId) return false;
        if (payload?.type && definition.type !== payload.type) return false;
        return true;
      })
      .map((definition) => {
        const platformInfo = getPluginForCurrentPlatform(definition);
        return platformInfo ? hydrateResourceFromDefinition(definition, platformInfo) : null;
      })
      .filter((resource): resource is PluginResource => resource !== null && !installedIds.has(resource.id) && pluginResourceManager.isInstalled(resource));

    installedResources = [
      ...installedResources,
      ...hydratedResources.map((resource) => {
        PluginResourceStore.upsert(resource);
        return resource;
      })
    ];

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
    const requestKey = `${payload.pluginId}:${payload.resourceId}`;
    const pending = pendingInstallRequests.get(requestKey);
    if (pending) {
      console.log('[pluginResource] reuse pending install request', payload);
      return pending;
    }

    const request = (async (): Promise<{ ok: boolean; data?: any; error?: string; message?: string }> => {
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
      const deterministicId = getDeterministicResourceId(pluginDef, platformInfo);
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
        if (['queued', 'downloading', 'extracting', 'verifying'].includes(existing.status || '') && pluginResourceManager.isActive(existing.id)) {
          console.log('existing is in progress', existing);
          return { ok: true, data: existing, message: 'Resource already in progress' };
        }
      }

      // 构建资源对象
      const resource = hydrateResourceFromDefinition(pluginDef, platformInfo);
      resource.status = 'queued';

      // 检查是否已安装（基于文件存在）
      if (pluginResourceManager.isInstalled(resource)) {
        // 同ID不存在但文件已存在时，标记为已安装并保存到 store
        resource.status = 'installed';
        resource.installedAt = Date.now();
        PluginResourceStore.upsert(resource);
        return { ok: true, data: resource, message: 'Resource already installed' };
      }

      console.log('resource', resource);
      console.log('payload', payload);

      // 加入下载队列，支持deleteAfterInstall参数（默认为false，不删除下载文件）
      const proxyAgent = getHttpProxyFn ? getHttpProxyFn() : undefined;
      const queuedResource = pluginResourceManager.enqueue(resource, payload.deleteAfterInstall ?? false, { proxyAgent });

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

      const resourceLabel = queuedResource.displayName || queuedResource.name || queuedResource.id;
      eventManager.emit(AppEvent.SPRITE_DOWNLOAD_START, {
        name: queuedResource.name || queuedResource.id,
        message: `${queuedResource.type === 'model' ? '模型' : '插件'}下载中: ${resourceLabel}`,
        progress: 0
      });
      return { ok: true, data: queuedResource };
    })();

    pendingInstallRequests.set(requestKey, request);
    try {
      return await request;
    } finally {
      if (pendingInstallRequests.get(requestKey) === request) {
        pendingInstallRequests.delete(requestKey);
      }
    }
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

  // 删除资源。默认只移除记录；deleteFiles=true 时同时删除受管理的安装文件。
  ipcMain.handle('plugin-resource:remove', async (_e, payload: { id: string; deleteFiles?: boolean }) => {
    let resource = PluginResourceStore.get(payload.id);
    if (!resource && getPluginDefinitionsPathFn) {
      const definitions = await loadPluginDefinitions(getPluginDefinitionsPathFn());
      const pluginDef = definitions.find((def) => {
        if (isSystemPresetPlugin(def)) return payload.id === `${def.pluginId}_${def.type}_${def.id}_${def.version}`;
        const platformInfo = getPluginForCurrentPlatform(def);
        return payload.id === getDeterministicResourceId(def, platformInfo);
      });
      const platformInfo = pluginDef ? getPluginForCurrentPlatform(pluginDef) : undefined;
      if (pluginDef && platformInfo) {
        const candidate = hydrateResourceFromDefinition(pluginDef, platformInfo);
        if (pluginResourceManager.isInstalled(candidate)) {
          resource = candidate;
        }
      }
    }
    let deletedPaths: string[] = [];
    if (resource && payload.deleteFiles) {
      deletedPaths = await pluginResourceManager.removeInstalledFiles(resource);
    }
    const removed = PluginResourceStore.remove(payload.id);
    if (removed || deletedPaths.length > 0) {
      eventManager.emit(AppEvent.SPRITE_PLUGIN_REMOVE, { name: payload.id });
    }
    return { ok: removed || deletedPaths.length > 0, deletedPaths };
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
  ipcMain.handle('plugin-resource:setPluginsDir', async (event, payload: { dir: string }) => {
    const oldDir = pluginResourceManager.getPluginsDir();
    const newDir = payload.dir;

    // 如果旧目录存在且与新目录不同，需要移动文件
    if (oldDir && fs.existsSync(oldDir) && path.resolve(oldDir) !== path.resolve(newDir)) {
      try {
        // 发送进度事件到渲染进程
        const sendProgress = (progress: { current: number; total: number; currentFile: string; percentage: number }): void => {
          BrowserWindow.getAllWindows().forEach((w) => {
            if (!w.isDestroyed()) {
              try {
                w.webContents.send('plugin-resource:move-progress', {
                  current: progress.current,
                  total: progress.total,
                  currentFile: progress.currentFile,
                  percentage: progress.percentage
                });
              } catch (error) {
                console.error('[pluginResource] 发送移动进度失败:', error);
              }
            }
          });
        };

        // 执行移动操作
        await pluginResourceManager.movePluginsDir(oldDir, newDir, sendProgress);

        // 发送完成事件
        BrowserWindow.getAllWindows().forEach((w) => {
          if (!w.isDestroyed()) {
            try {
              w.webContents.send('plugin-resource:move-progress', {
                current: 100,
                total: 100,
                currentFile: '',
                percentage: 100
              });
            } catch (error) {
              console.error('[pluginResource] 发送移动完成事件失败:', error);
            }
          }
        });

        // 移动完成后，更新配置
        pluginResourceManager.setPluginsDir(newDir);
        return { ok: true };
      } catch (error: any) {
        console.error('[pluginResource] 移动插件目录失败:', error);
        return { ok: false, error: error.message || String(error) };
      }
    } else {
      // 直接设置新目录
      pluginResourceManager.setPluginsDir(newDir);
      return { ok: true };
    }
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

  // 获取插件下载配置
  ipcMain.handle('plugin-resource:getConfig', async () => {
    return { ok: true, config: PluginConfigStore.getConfig() };
  });

  // 更新插件下载配置
  ipcMain.handle('plugin-resource:setConfig', async (_e, payload: Partial<ReturnType<typeof PluginConfigStore.getConfig>>) => {
    const config = PluginConfigStore.setConfig(payload);
    if (typeof payload.concurrency === 'number') {
      pluginResourceManager.setConcurrency(payload.concurrency);
    }
    return { ok: true, config };
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
