import { AnimatePresence, motion } from 'framer-motion';
import { PluginDefinition } from 'packages/plugins/types';
import React, { useEffect, useState } from 'react';
import { TbBox, TbChevronDown, TbChevronRight, TbSettings, TbWifi } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { NetworkCheckDialog } from './components/NetworkCheckDialog';
import { PluginListItem } from './components/PluginListItem';
import SelectModelFolder from './components/SelectModelFolder';
import type { InstalledResource } from './components/types';

interface PluginPageProps { }

const PluginPage: React.FC<PluginPageProps> = () => {
  const [supported, setSupported] = useState<PluginDefinition[]>([]);
  const [installed, setInstalled] = useState<InstalledResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState<'available' | 'installed'>('available');
  const [installing, setInstalling] = useState<string | null>(null);
  const [expandedPlugins, setExpandedPlugins] = useState<Set<string>>(new Set());
  const [showNetworkDialog, setShowNetworkDialog] = useState(false);
  const [showFolderSettings, setShowFolderSettings] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const sup = await window.YUA.pluginResource['plugin-resource:listSupported']();
        const inst = await window.YUA.pluginResource['plugin-resource:list']();
        if (!mounted) return;
        setSupported(sup);
        setInstalled(inst);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const listener = (_: any, info: any): void => {
      if (!info || !info.id) return;

      // @ts-ignore
      setInstalled((prev) => {
        const idx = prev.findIndex((m) => m.id === info.id);
        if (idx < 0) {
          // 新安装的资源 - 包括所有非最终状态
          if (['queued', 'downloading', 'extracting', 'verifying', 'installed', 'failed', 'cancelled'].includes(info.status)) {
            return [
              ...prev,
              {
                id: info.id,
                pluginId: info.pluginId || '',
                type: info.type || 'model',
                name: info.name || '',
                displayName: info.displayName,
                version: info.version,
                status: info.status,
                progressBytes: info.doneBytes || 0,
                sizeBytes: info.totalBytes,
                speedBps: info.speedBps,
                etaMs: info.etaMs,
                lastError: info.error
              }
            ];
          }
          return prev;
        }
        // 更新现有资源
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          status: info.status,
          progressBytes: info.doneBytes !== undefined ? info.doneBytes : next[idx].progressBytes,
          sizeBytes: info.totalBytes !== undefined ? info.totalBytes : next[idx].sizeBytes,
          speedBps: info.speedBps !== undefined ? info.speedBps : next[idx].speedBps,
          etaMs: info.etaMs !== undefined ? info.etaMs : next[idx].etaMs,
          lastError: info.error !== undefined ? info.error : next[idx].lastError
        };
        return next;
      });
    };
    window.ipcRenderer.on('plugin-resource:progress', listener);
    return () => {
      mounted = false;
      window.ipcRenderer.off('plugin-resource:progress', listener);
    };
  }, []);

  const install = async (pluginId: string, resourceId: string): Promise<void> => {
    setInstalling(resourceId);
    try {
      const res = await window.YUA.pluginResource['plugin-resource:install']({ pluginId, resourceId, deleteAfterInstall: true });
      if (res.ok && res.data) {
        const data: InstalledResource = res.data;
        // 进度事件会通过监听器更新，这里确保资源已添加到列表
        setInstalled((prev) => {
          const existing = prev.find((m) => m.id === data.id);
          if (existing) {
            // 如果已存在，更新状态
            return prev.map((m) => (m.id === data.id ? { ...m, ...data } : m));
          }
          // 如果不存在，添加新资源
          return [...prev, data];
        });
      }
    } finally {
      setInstalling(null);
    }
  };

  const cancel = async (id: string): Promise<void> => {
    const res = await window.YUA.pluginResource['plugin-resource:cancel']({ id });
    if (res.ok) {
      setInstalled((prev) => prev.map((m) => (m.id === id ? { ...m, status: 'cancelled' } : m)));
    }
  };

  const retry = async (id: string): Promise<void> => {
    const resource = installed.find((r) => r.id === id);
    if (!resource) return;
    const res = await window.YUA.pluginResource['plugin-resource:install']({
      pluginId: resource.pluginId,
      resourceId: resource.resourceId,
      deleteAfterInstall: true
    });
    if (res.ok) {
      setInstalled((prev) => prev.map((m) => (m.id === id ? { ...m, status: 'queued', progressBytes: 0 } : m)));
    }
  };

  const remove = async (id: string): Promise<void> => {
    const res = await window.YUA.pluginResource['plugin-resource:remove']({ id });
    if (res.ok) {
      setInstalled((prev) => prev.filter((m) => m.id !== id));
    }
  };

  // 根据当前标签页筛选要显示的资源列表
  const getDisplayResources = (): PluginDefinition[] => {
    if (tabValue === 'installed') {
      // 已安装标签页：筛选已安装的资源，转换为 PluginDefinition 格式
      return installed
        .filter((m) => m.status === 'installed')
        .map((m) => {
          // 从支持的插件列表中找到对应的 PluginDefinition
          const resource = supported.find((s) => s.pluginId === m.pluginId && s.name === m.name);
          // 如果找不到，创建一个基本的 PluginDefinition
          return (
            resource || {
              id: m.id,
              pluginId: m.pluginId,
              type: m.type,
              name: m.name,
              displayName: m.displayName || m.name,
              version: m.version || '0.0.0',
              platforms: []
            }
          );
        });
    } else {
      // 可用插件标签页：返回所有支持的资源（状态会通过 installedResource prop 传递）
      return supported;
    }
  };

  // 按插件分组资源
  const resourcesByPlugin = (() => {
    const displayResources = getDisplayResources();
    const grouped = displayResources.reduce(
      (acc, resource) => {
        if (!acc[resource.pluginId]) {
          acc[resource.pluginId] = { engines: [], models: [] };
        }
        if (resource.type === 'engine') {
          acc[resource.pluginId].engines.push(resource);
        } else if (resource.type === 'model') {
          acc[resource.pluginId].models.push(resource);
        }
        return acc;
      },
      {} as Record<string, { engines: PluginDefinition[]; models: PluginDefinition[] }>
    );

    // 如果是已安装标签页，需要补充该插件下所有可用的模型（用于展示模型列表）
    if (tabValue === 'installed') {
      Object.keys(grouped).forEach((pluginId) => {
        // 从支持的资源中获取该插件下所有模型
        const allModels = supported.filter((s) => s.pluginId === pluginId && s.type === 'model');
        // 合并已安装的模型和所有可用的模型，去重
        const existingModelIds = new Set(grouped[pluginId].models.map((m) => m.id));
        allModels.forEach((model) => {
          if (!existingModelIds.has(model.id)) {
            grouped[pluginId].models.push(model);
          }
        });
      });
    }

    return grouped;
  })();

  const togglePluginExpanded = (pluginId: string): void => {
    setExpandedPlugins((prev) => {
      const next = new Set(prev);
      if (next.has(pluginId)) {
        next.delete(pluginId);
      } else {
        next.add(pluginId);
      }
      return next;
    });
  };

  // 渲染资源列表项
  const renderResourceItem = (resource: PluginDefinition): React.ReactElement => {
    const busy = installing === resource.id;
    const rec = installed.find((m) => m.pluginId === resource.pluginId && m.name === resource.name && m.status !== 'removed');
    return <PluginListItem key={resource.id} resource={resource} installedResource={rec} isInstalling={busy} onInstall={install} onCancel={cancel} onRetry={retry} onRemove={remove} />;
  };

  if (loading) return <div className="p-4 text-xs text-muted-foreground">加载中...</div>;

  return (
    <>
      <div className="flex items-center gap-2 p-2">
        <div className="flex-1">
          <Tabs value={tabValue} onValueChange={(v) => setTabValue(v as 'available' | 'installed')} className="no-drag">
            <TabsList>
              <TabsTrigger value="available">可用插件</TabsTrigger>
              <TabsTrigger value="installed">已安装</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <Dialog open={showFolderSettings} onOpenChange={setShowFolderSettings}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" title="设置下载文件夹">
              <TbSettings />
              存储位置
            </Button>
          </DialogTrigger>
          <DialogContent className="w-80">
            <DialogHeader>
              <DialogTitle></DialogTitle>
              <DialogDescription></DialogDescription>
            </DialogHeader>
            <SelectModelFolder
              onConfigured={() => {
                setShowFolderSettings(false);
              }}
            />
          </DialogContent>
        </Dialog>
        <Button size="sm" variant="outline" onClick={() => setShowNetworkDialog(true)}>
          <TbWifi />
          网络测试
        </Button>
      </div>

      <NetworkCheckDialog open={showNetworkDialog} onOpenChange={setShowNetworkDialog} />

      {Object.keys(resourcesByPlugin).length === 0 && <div className="text-xs text-muted-foreground border rounded px-2 text-center py-20">暂无插件。</div>}
      <div className="space-y-1 px-2 h-[calc(100%-52px)] overflow-y-auto">
        {Object.entries(resourcesByPlugin).map(([pluginId, { engines, models }]) => {
          const pluginName = engines[0]?.pluginId.replace('plugin:', '') || models[0]?.pluginId.replace('plugin:', '') || pluginId.replace('plugin:', '');
          const isExpanded = expandedPlugins.has(pluginId);
          const hasModels = models.length > 0;
          const hasEngines = engines.length > 0;
          const hasInstalledEngine = installed.some((resource) => resource.pluginId === pluginId && resource.type === 'engine' && resource.status === 'installed');
          const shouldShowModels = hasModels && hasInstalledEngine;

          return (
            <div key={pluginId}>
              {/* 引擎列表 */}
              {hasEngines && engines.map((resource) => renderResourceItem(resource))}

              {/* 模型列表（可展开） */}
              {shouldShowModels && (
                <div>
                  <Button size="sm" variant="outline" onClick={() => togglePluginExpanded(pluginId)}>
                    {isExpanded ? <TbChevronDown /> : <TbChevronRight />}
                    <TbBox className="w-4 h-4" />
                    {pluginName} 模型列表 ({models.length})
                  </Button>
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div className="space-y-1">{models.map((resource) => renderResourceItem(resource))}</div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
};

export default PluginPage;
