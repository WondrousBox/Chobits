import type { FeatureKey } from '@packages/common/feature-flags';
import type { PluginConfig } from '@packages/plugins/plugin-config-store';
import { isPluginCompatibleWithPlatform, isSystemPresetPlugin, PluginCategory, PluginDefinition } from '@packages/plugins/types';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TbBox, TbFilter, TbLoader, TbPlug, TbSettings, TbWifi, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { cn } from '@/lib/utils';

// 插件与功能旗标的映射：旗标关闭时隐藏对应插件，未列出的插件始终显示
const PLUGIN_FEATURE_FLAGS: Record<string, FeatureKey> = {
  'whisper-cli': 'localAi',
  'sherpa-onnx': 'localAi',
  'parakeet-cli': 'localAi',
  'funasr-cli': 'localAi',
  'fast-whisper-cli': 'localAi',
  'paddle-ocr-runtime': 'localAi'
};

// 分类配置：中文名称和显示顺序
const CATEGORY_CONFIG: { value: PluginCategory; label: string }[] = [
  { value: 'core', label: '核心引擎' },
  { value: 'asr', label: '语音识别' },
  { value: 'tts', label: '语音合成' },
  { value: 'stt', label: '语音转文字' },
  { value: 'vad', label: '语音检测' },
  { value: 'voice-clone', label: '声音克隆' },
  { value: 'llm', label: '大语言模型' },
  { value: 'nlp', label: '自然语言处理' },
  { value: 'translation', label: '翻译' },
  { value: 'punctuation', label: '标点恢复' },
  { value: 'embedding', label: '文本嵌入' },
  { value: 'image-gen', label: '图像生成' },
  { value: 'image-edit', label: '图像编辑' },
  { value: 'ocr', label: '文字识别' },
  { value: 'image-recognition', label: '图像识别' },
  { value: 'face', label: '人脸识别' },
  { value: 'image-super-res', label: '图像超分' },
  { value: 'video-gen', label: '视频生成' },
  { value: 'video-edit', label: '视频编辑' },
  { value: 'video-analysis', label: '视频分析' },
  { value: 'multimodal', label: '多模态' },
  { value: 'agent', label: 'AI代理' },
  { value: 'code', label: '代码生成' },
  { value: 'music', label: '音乐生成' },
  { value: 'three-d', label: '3D生成' },
  { value: 'other', label: '其他' }
];

import { NetworkCheckDialog } from './components/NetworkCheckDialog';
import { PluginListItem } from './components/PluginListItem';
import SelectModelFolder from './components/SelectModelFolder';
import type { InstalledResource } from './components/types';

type DownloadSettingKey =
  | 'deletePartialDownloadOnCancel'
  | 'deletePartialDownloadOnFailure'
  | 'deleteDownloadedFileOnFailure'
  | 'deleteArchiveAfterInstall'
  | 'downloaderResumeValidation'
  | 'downloaderDebug';

const DOWNLOAD_SETTING_ITEMS: Array<{
  key: DownloadSettingKey;
  title: string;
  description: string;
}> = [
  {
    key: 'deletePartialDownloadOnCancel',
    title: '取消后删除临时文件',
    description: '关闭后，取消下载会保留 .download 文件，方便下次继续下载。'
  },
  {
    key: 'deletePartialDownloadOnFailure',
    title: '失败后删除临时文件',
    description: '关闭后，下载失败时保留未完成的临时文件。'
  },
  {
    key: 'deleteDownloadedFileOnFailure',
    title: '失败后删除目标文件',
    description: '控制非压缩资源下载失败时是否清理目标文件。'
  },
  {
    key: 'deleteArchiveAfterInstall',
    title: '安装后删除压缩包',
    description: '开启后，解压安装完成会清理原始压缩包。'
  },
  {
    key: 'downloaderResumeValidation',
    title: '续传前校验远端资源',
    description: '开启后，继续下载前会用 HEAD 校验资源是否变化。'
  },
  {
    key: 'downloaderDebug',
    title: '下载器 debug 日志',
    description: '开启后打印 aim-downloader 的内部调试日志。'
  }
];

const PluginPage: React.FC = () => {
  const [supported, setSupported] = useState<PluginDefinition[]>([]);
  const [installed, setInstalled] = useState<InstalledResource[]>([]);
  const [downloadConfig, setDownloadConfig] = useState<PluginConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tabValue, setTabValue] = useState<'available' | 'installed'>('available');
  const [installing, setInstalling] = useState<string | null>(null);
  const [installingIds, setInstallingIds] = useState<Set<string>>(() => new Set());
  const installingIdsRef = useRef<Set<string>>(new Set());
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
  const [showNetworkDialog, setShowNetworkDialog] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<PluginCategory | null>(null);
  const { isEnabled } = useFeatureFlags();

  // 按功能旗标过滤插件列表（localAi / spleeter 关闭时隐藏对应插件）
  const visibleSupported = useMemo(
    () =>
      supported.filter((plugin) => {
        const flag = PLUGIN_FEATURE_FLAGS[plugin.pluginId];
        return flag ? isEnabled(flag) : true;
      }),
    [supported, isEnabled]
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // 读取设置窗口打开时传入的 payload；category 跳转由 SettingsPage 处理，
        // 这里只处理插件页自身的 tab / 分类筛选 / 选中插件
        const payload = await window.chobits.window['window:payload:get']('settings' as any);
        if (!mounted || !payload || typeof payload !== 'object') return;
        const tab = (payload as any).tab;
        const category = (payload as any).category;
        const pluginId = (payload as any).pluginId;
        if (tab === 'available' || tab === 'installed') {
          setTabValue(tab);
        }
        if (CATEGORY_CONFIG.some((item) => item.value === category)) {
          setSelectedCategory(category);
        }
        if (typeof pluginId === 'string' && pluginId.trim()) {
          setSelectedPluginId(pluginId);
        }
      } catch (error) {
        console.warn('[PluginPage] failed to apply initial payload', error);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // 获取当前可用的分类列表（只显示有插件的分类）
  const availableCategories = useMemo(() => {
    const categories = new Set<PluginCategory>();
    visibleSupported.forEach((plugin) => {
      if (plugin.category) {
        const cats = Array.isArray(plugin.category) ? plugin.category : [plugin.category];
        cats.forEach((c) => categories.add(c));
      }
    });
    return CATEGORY_CONFIG.filter((c) => categories.has(c.value));
  }, [visibleSupported]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const sup = await window.chobits.pluginResource['plugin-resource:list-supported']();
        const inst = await window.chobits.pluginResource['plugin-resource:list']();
        const configRes = await window.chobits.pluginResource['plugin-resource:get-config']();
        if (!mounted) return;
        // 过滤掉不兼容当前平台的插件
        const compatibleSup = sup.filter((plugin: PluginDefinition) => isPluginCompatibleWithPlatform(plugin, window.chobits.platform, window.chobits.arch));
        setSupported(compatibleSup);
        setInstalled(inst);
        if (configRes.ok && configRes.config) {
          setDownloadConfig(configRes.config);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    const listener = (_: any, info: any): void => {
      if (!info || !info.id) return;

      setInstalled((prev) => {
        const idx = prev.findIndex((m) => m.id === info.id);
        if (idx < 0) {
          // 新安装的资源 - 包括所有非最终状态
          if (['queued', 'downloading', 'extracting', 'verifying', 'installed', 'failed', 'cancelled'].includes(info.status)) {
            return [
              ...prev,
              {
                id: info.id,
                resourceId: info.resourceId || '',
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
    if (installingIdsRef.current.has(resourceId)) return;
    installingIdsRef.current.add(resourceId);
    setInstalling(resourceId);
    setInstallingIds((prev) => new Set(prev).add(resourceId));
    try {
      const res = await window.chobits.pluginResource['plugin-resource:install']({ pluginId, resourceId, deleteAfterInstall: true });
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
      setInstallingIds((prev) => {
        const next = new Set(prev);
        next.delete(resourceId);
        return next;
      });
      installingIdsRef.current.delete(resourceId);
    }
  };

  const cancel = async (id: string): Promise<void> => {
    await window.chobits.pluginResource['plugin-resource:cancel']({ id });
  };

  const retry = async (id: string): Promise<void> => {
    const resource = installed.find((r) => r.id === id);
    if (!resource) return;
    if (installingIdsRef.current.has(resource.resourceId)) return;
    installingIdsRef.current.add(resource.resourceId);
    setInstallingIds((prev) => new Set(prev).add(resource.resourceId));
    try {
      const res = await window.chobits.pluginResource['plugin-resource:install']({
        pluginId: resource.pluginId,
        resourceId: resource.resourceId,
        deleteAfterInstall: true
      });
      if (res.ok) {
        setInstalled((prev) => prev.map((m) => (m.id === id ? { ...m, status: 'queued', progressBytes: 0 } : m)));
      }
    } finally {
      setInstallingIds((prev) => {
        const next = new Set(prev);
        next.delete(resource.resourceId);
        return next;
      });
      installingIdsRef.current.delete(resource.resourceId);
    }
  };

  const remove = async (id: string): Promise<void> => {
    const res = await window.chobits.pluginResource['plugin-resource:remove']({ id, deleteFiles: true });
    if (res.ok) {
      setInstalled((prev) => prev.filter((m) => m.id !== id));
    }
  };

  const updateDownloadConfig = async (patch: Partial<PluginConfig>): Promise<void> => {
    setDownloadConfig((prev) => ({ ...(prev || {}), ...patch }));
    const res = await window.chobits.pluginResource['plugin-resource:set-config'](patch);
    if (res.ok && res.config) {
      setDownloadConfig(res.config);
    }
  };

  const getDownloadSettingChecked = (key: DownloadSettingKey): boolean => {
    if (!downloadConfig) return false;
    if (key === 'deleteArchiveAfterInstall') {
      return downloadConfig.deleteArchiveAfterInstall ?? true;
    }
    return !!downloadConfig[key];
  };

  // 根据当前标签页和分类筛选要显示的资源列表
  const getDisplayResources = (): PluginDefinition[] => {
    let resources: PluginDefinition[] = [];

    if (tabValue === 'installed') {
      // 已安装标签页：筛选已安装的资源，转换为 PluginDefinition 格式
      const installedResources = installed
        .filter((m) => m.status === 'installed')
        .map((m) => {
          // 从支持的插件列表中找到对应的 PluginDefinition
          const resource = visibleSupported.find((s) => s.pluginId === m.pluginId && s.name === m.name);
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

      // 添加系统预设插件
      const systemPresetPlugins = visibleSupported.filter((s) => isSystemPresetPlugin(s));
      const installedIds = new Set(installedResources.map((r) => r.id));
      systemPresetPlugins.forEach((plugin) => {
        if (!installedIds.has(plugin.id)) {
          installedResources.push(plugin);
        }
      });

      resources = installedResources;
    } else {
      // 可用插件标签页：返回所有支持的资源（状态会通过 installedResource prop 传递）
      resources = visibleSupported;
    }

    // 应用分类筛选
    if (selectedCategory) {
      resources = resources.filter((r) => {
        if (!r.category) return false;
        const cats = Array.isArray(r.category) ? r.category : [r.category];
        return cats.includes(selectedCategory);
      });
    }

    return resources;
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

    // 注意:已安装标签页不再回填插件下的全部模型 —— 系统预设引擎(如 sherpa-onnx)常驻已安装列表,
    // 回填会让该插件的所有模型(含未安装)都显示出来,使「已安装」筛选失去意义。
    // 语义划分:可用插件页 = 发现/安装;已安装页 = 已装内容的查看/卸载。

    // 过滤掉没有引擎的分组（引擎不兼容当前平台时，其模型也不应展示）
    for (const pluginId of Object.keys(grouped)) {
      if (grouped[pluginId].engines.length === 0) {
        delete grouped[pluginId];
      }
    }

    return grouped;
  })();

  // 计算当前选中的插件
  const pluginIds = Object.keys(resourcesByPlugin);
  const activePluginId = selectedPluginId && pluginIds.includes(selectedPluginId) ? selectedPluginId : pluginIds[0] || null;
  const activePlugin = activePluginId ? resourcesByPlugin[activePluginId] : null;

  // 渲染资源列表项
  const renderResourceItem = (resource: PluginDefinition): React.ReactElement => {
    const busy = installing === resource.id || installingIds.has(resource.id);
    const rec = installed.find((m) => m.pluginId === resource.pluginId && m.name === resource.name && m.status !== 'removed');
    // 如果是系统预设插件，创建一个虚拟的已安装资源记录
    const isSystemPreset = isSystemPresetPlugin(resource);
    const installedResource = isSystemPreset
      ? {
          id: `${resource.pluginId}_${resource.type}_${resource.id}_${resource.version}`,
          pluginId: resource.pluginId,
          resourceId: resource.id,
          type: resource.type,
          name: resource.name,
          displayName: resource.displayName,
          version: resource.version,
          status: 'installed' as const
        }
      : rec;
    return <PluginListItem key={resource.id} resource={resource} installedResource={installedResource} isInstalling={busy} onInstall={install} onCancel={cancel} onRetry={retry} onRemove={remove} />;
  };

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center text-muted-foreground">
        <TbLoader className="h-4 w-4 mr-2 animate-spin" />
        加载中...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center px-4 py-3 border-b border-border">
        <Tabs value={tabValue} onValueChange={(v) => setTabValue(v as 'available' | 'installed')} className="no-drag flex-1">
          <TabsList className="h-8">
            <TabsTrigger value="available" className="text-xs px-3">
              可用插件
            </TabsTrigger>
            <TabsTrigger value="installed" className="text-xs px-3">
              已安装
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* 分类筛选 */}
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant={selectedCategory ? 'default' : 'ghost'} className="h-8 text-xs">
              <TbFilter className="h-4 w-4 mr-1" />
              {selectedCategory ? CATEGORY_CONFIG.find((c) => c.value === selectedCategory)?.label : '分类'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="end">
            <div className="flex flex-wrap gap-1.5">
              {availableCategories.map((category) => (
                <button
                  key={category.value}
                  onClick={() => setSelectedCategory(selectedCategory === category.value ? null : category.value)}
                  className={`text-xs px-2 py-1 rounded-md transition-colors ${
                    selectedCategory === category.value ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* 清除筛选 */}
        {selectedCategory && (
          <Button size="sm" variant="ghost" className="h-8 text-xs px-2" onClick={() => setSelectedCategory(null)} title="清除筛选">
            <TbX className="h-4 w-4" />
          </Button>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" title="设置下载文件夹">
              <TbSettings />
              存储位置
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <SelectModelFolder />
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 text-xs">
              <TbSettings />
              下载设置
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96 p-0" align="end">
            <div className="border-b border-border px-4 py-3">
              <div className="text-sm font-medium">下载设置</div>
              <div className="text-xs text-muted-foreground mt-1">控制下载取消、失败清理和续传校验行为。</div>
            </div>
            <div className="divide-y divide-border">
              {DOWNLOAD_SETTING_ITEMS.map((item) => (
                <div key={item.key} className="flex items-center gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm leading-5">{item.title}</div>
                    <div className="text-xs leading-5 text-muted-foreground">{item.description}</div>
                  </div>
                  <Switch
                    aria-label={item.title}
                    checked={getDownloadSettingChecked(item.key)}
                    disabled={!downloadConfig}
                    onCheckedChange={(checked) => {
                      void updateDownloadConfig({ [item.key]: checked });
                    }}
                  />
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setShowNetworkDialog(true)}>
          <TbWifi />
          网络测试
        </Button>
      </div>

      <NetworkCheckDialog isOpen={showNetworkDialog} onOpenChange={setShowNetworkDialog} />

      {/* 左右布局：引擎列表 + 模型详情 */}
      <div className="flex-1 overflow-hidden flex">
        {/* 左侧：引擎列表 */}
        <div className="w-64 shrink-0 border-r border-border overflow-y-auto">
          {pluginIds.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-muted-foreground p-4">
                <TbBox className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">暂无插件</p>
                {/* 插件被功能旗标过滤掉时，引导用户去功能管理开启「本地 AI 推理」 */}
                {supported.length > 0 && visibleSupported.length === 0 && <p className="text-xs mt-2 opacity-70">插件已被隐藏，请先在「功能管理」中开启「本地 AI 推理」</p>}
              </div>
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {Object.entries(resourcesByPlugin).map(([pluginId, { engines, models }]) => {
                const engineDef = engines[0];
                const pluginName = engineDef?.displayName || engineDef?.name || models[0]?.displayName || models[0]?.name || pluginId.replace('plugin:', '');
                const isSelected = activePluginId === pluginId;
                const hasInstalledEngine = installed.some((r) => r.pluginId === pluginId && r.type === 'engine' && r.status === 'installed') || engines.some((e) => isSystemPresetPlugin(e));
                const isEngineDownloading = installed.some((r) => r.pluginId === pluginId && r.type === 'engine' && ['queued', 'downloading', 'extracting', 'verifying'].includes(r.status || ''));
                const category = engineDef?.category;
                const firstCategory = Array.isArray(category) ? category[0] : category;
                const categoryLabel = firstCategory ? CATEGORY_CONFIG.find((c) => c.value === firstCategory)?.label || firstCategory : '';

                return (
                  <div
                    key={pluginId}
                    onClick={() => setSelectedPluginId(pluginId)}
                    className={cn('flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-accent/50', isSelected && 'bg-accent ring-1 ring-primary/30')}
                  >
                    <div
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-full shrink-0 transition-colors',
                        hasInstalledEngine ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {isEngineDownloading ? <TbLoader className="h-5 w-5 animate-spin" /> : <TbPlug className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{pluginName}</span>
                        {hasInstalledEngine && <span className="text-[10px] px-1.5 rounded-md bg-green-500/90 text-white shrink-0">已安装</span>}
                      </div>
                      <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {categoryLabel}
                        {categoryLabel && models.length > 0 && ' · '}
                        {models.length > 0 && `${models.length} 个模型`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 右侧：引擎详情 + 模型列表 */}
        <div className="flex-1 overflow-y-auto">
          {activePlugin ? (
            <div>
              {/* 引擎信息 */}
              {activePlugin.engines.length > 0 && (
                <div className="relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/8 to-cyan-500/5 dark:from-blue-500/10 dark:via-purple-500/12 dark:to-cyan-500/10" />
                  <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent_25%,rgba(255,255,255,0.08)_50%,transparent_75%)] bg-[length:250%_100%] animate-[shimmer_6s_ease-in-out_infinite]" />
                  <div className="relative divide-y divide-border/70">{activePlugin.engines.map((resource) => renderResourceItem(resource))}</div>
                </div>
              )}

              {/* 模型列表或提示 */}
              {(() => {
                const hasInstalledEngine =
                  installed.some((r) => r.pluginId === activePluginId && r.type === 'engine' && r.status === 'installed') || activePlugin.engines.some((e) => isSystemPresetPlugin(e));

                if (activePlugin.models.length === 0) return null;

                if (!hasInstalledEngine) {
                  return (
                    <div className="border-t border-border/70 px-4 py-8 text-center text-muted-foreground">
                      <TbBox className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">请先安装引擎后再选择模型</p>
                      <p className="text-xs mt-1 opacity-70">该引擎有 {activePlugin.models.length} 个可用模型</p>
                    </div>
                  );
                }

                return (
                  <div className="border-t border-border/70">
                    <div className="px-4 py-2.5 text-sm text-muted-foreground flex items-center gap-2 bg-muted/20">
                      <TbBox className="h-4 w-4" />
                      <span>模型列表 ({activePlugin.models.length})</span>
                    </div>
                    <div className="divide-y divide-border/50">{activePlugin.models.map((resource) => renderResourceItem(resource))}</div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-muted-foreground">
                <TbBox className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">暂无插件</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PluginPage;
