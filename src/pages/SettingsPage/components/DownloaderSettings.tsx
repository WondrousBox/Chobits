import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbCheck, TbDownload, TbFolderOpen, TbLoader2, TbRefresh, TbRotate } from 'react-icons/tb';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { SettingGroup, SettingItem } from './SettingComponents';

interface ReleaseInfo {
  tag_name: string;
  name: string;
  published_at: string;
  assets: Array<{ name: string; browser_download_url: string; size: number }>;
  body?: string;
}

interface UpdateInfo {
  current: string | null;
  latest: string;
  hasUpdate: boolean;
  path: string;
  recentReleases: ReleaseInfo[];
}

interface DownloadProgress {
  received: number;
  total?: number;
  percent?: number;
  status?: 'downloading' | 'extracting' | 'installing' | 'completed' | 'error';
  message?: string;
}

interface ExternalResourceSettings {
  externalResourceEnabled: boolean;
  externalResourceMode: string;
  externalResourceCookies: boolean;
  preferredBrowser: string;
  ejsRemoteComponents?: 'github' | 'npm' | 'none';
  ejsJsRuntime?: 'deno' | 'node' | 'bun' | 'quickjs' | 'auto';
}

const defaultExternalSettings: ExternalResourceSettings = {
  externalResourceEnabled: true,
  externalResourceMode: '1',
  externalResourceCookies: false,
  preferredBrowser: 'chrome',
  ejsRemoteComponents: 'github',
  ejsJsRuntime: 'auto'
};

const DownloaderSettings: React.FC = () => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [externalSettings, setExternalSettings] = useState<ExternalResourceSettings>(defaultExternalSettings);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const loadedRef = useRef(false);

  // 检查更新
  const checkUpdate = useCallback(async () => {
    setChecking(true);
    try {
      const result = await window.YUA.ytdlp.checkUpdate();
      if (result.success && result.data) {
        setUpdateInfo(result.data);
        if (!result.data.hasUpdate) {
          toast.success('已是最新版本');
        }
      } else {
        toast.error('检查更新失败', { description: result.error });
      }
    } catch (error: any) {
      toast.error('检查更新失败', { description: error?.message || String(error) });
    } finally {
      setChecking(false);
    }
  }, []);

  // 下载指定版本
  const downloadVersion = useCallback(
    async (release?: ReleaseInfo) => {
      setDownloading(true);
      setProgress({ received: 0, status: 'downloading' });

      try {
        const result = await window.YUA.ytdlp.downloadVersion(release);
        if (result.success && result.data) {
          toast.success('更新成功', {
            description: `已安装版本 ${result.data.installedVersion}`
          });
          // 刷新更新信息
          await checkUpdate();
        } else {
          toast.error('更新失败', { description: result.error });
        }
      } catch (error: any) {
        toast.error('更新失败', { description: error?.message || String(error) });
      } finally {
        setDownloading(false);
        setProgress(null);
      }
    },
    [checkUpdate]
  );

  // 重置为内置版本
  const resetToBuiltin = useCallback(async () => {
    try {
      const result = await window.YUA.ytdlp.resetToBuiltin();
      if (result.success) {
        toast.success('已重置为内置版本');
        await checkUpdate();
      } else {
        toast.error('重置失败', { description: result.error });
      }
    } catch (error: any) {
      toast.error('重置失败', { description: error?.message || String(error) });
    }
  }, [checkUpdate]);

  // 打开下载文件夹
  const openFolder = useCallback(async () => {
    try {
      const result = await window.YUA.ytdlp.getFolderPath();
      if (result.success && result.data) {
        await window.YUA.file['file:openPath'](result.data.folderPath);
      } else {
        toast.error('获取文件夹路径失败', { description: result.error });
      }
    } catch (error: any) {
      toast.error('打开文件夹失败', { description: error?.message || String(error) });
    }
  }, []);

  // 打开配置文件路径
  const openConfigPath = useCallback(async () => {
    try {
      const result = await window.YUA.videoDownloader.getConfigPath();
      if (result.success && result.data) {
        const revealResult = await window.YUA.file['file:reveal'](result.data.configPath);
        if (!revealResult.ok) {
          toast.error('打开配置文件路径失败', { description: revealResult.error });
        }
      } else {
        toast.error('获取配置文件路径失败', { description: result.error });
      }
    } catch (error: any) {
      toast.error('打开配置文件路径失败', { description: error?.message || String(error) });
    }
  }, []);

  // 监听下载进度
  useEffect(() => {
    const unsubscribe = window.YUA.ytdlp.onDownloadProgress((p: DownloadProgress) => {
      setProgress(p);
    });
    return unsubscribe;
  }, []);

  // 加载外部资源设置
  const fetchExternalSettings = useCallback(async () => {
    setLoadingSettings(true);
    try {
      const response = await window.YUA.videoDownloader['getExternalResourceSettings']();
      const payload = response && 'data' in response ? response.data : response;
      setExternalSettings({ ...defaultExternalSettings, ...(payload ?? {}) });
      loadedRef.current = true;
    } catch (error) {
      console.warn('加载外部资源设置失败:', error);
    } finally {
      setLoadingSettings(false);
    }
  }, []);

  // 保存外部资源设置
  const saveExternalSettings = useCallback(async (settings: ExternalResourceSettings) => {
    try {
      await window.YUA.videoDownloader['setExternalResourceSettings'](settings);
    } catch (error) {
      console.error('保存外部资源设置失败:', error);
      toast.error('保存设置失败');
    }
  }, []);

  // 更新设置（自动保存）
  useEffect(() => {
    if (!loadedRef.current) return;
    const timer = setTimeout(() => {
      saveExternalSettings(externalSettings);
    }, 600);
    return () => clearTimeout(timer);
  }, [externalSettings, saveExternalSettings]);

  // 更新设置
  const updateExternalSettings = useCallback((partial: Partial<ExternalResourceSettings>) => {
    setExternalSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  // 初始化时加载设置和检查更新
  useEffect(() => {
    fetchExternalSettings();
    checkUpdate();
  }, [fetchExternalSettings, checkUpdate]);

  // 格式化日期
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  // 获取进度百分比
  const getProgressPercent = (): number => {
    if (!progress) return 0;
    if (progress.percent !== undefined) {
      return Math.round(progress.percent * 100);
    }
    return 0;
  };

  // 获取状态文本
  const getStatusText = (): string => {
    if (!progress) return '';
    switch (progress.status) {
      case 'downloading':
        return `下载中 ${getProgressPercent()}%`;
      case 'extracting':
        return '解压中...';
      case 'installing':
        return '安装中...';
      case 'completed':
        return '完成';
      case 'error':
        return '错误';
      default:
        return progress.message || '';
    }
  };

  return (
    <SettingGroup title="下载器">
      <SettingItem
        title="yt-dlp 版本"
        description={updateInfo ? `当前版本: ${updateInfo.current || '未知'} ${updateInfo.hasUpdate ? '(有新版本可用)' : ''}` : '正在检查...'}
        action={
          <div className="flex items-center gap-2">
            {/* 检查更新按钮 */}
            <Button variant="outline" size="sm" disabled={checking || downloading} onClick={checkUpdate} className="h-8 w-8">
              {checking ? <TbLoader2 className="h-4 w-4 animate-spin" /> : <TbRefresh className="h-4 w-4" />}
            </Button>

            {/* 版本选择下拉菜单 */}
            {updateInfo && updateInfo.recentReleases.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={downloading}>
                    {downloading ? (
                      <>
                        <TbLoader2 className="animate-spin" />
                        {getStatusText()}
                      </>
                    ) : (
                      <>
                        <TbDownload />
                        选择版本
                      </>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[280px]">
                  {updateInfo.recentReleases.map((release, index) => {
                    const version = release.tag_name.replace(/^v/, '');
                    const isCurrentVersion = updateInfo.current === version;
                    const isLatest = index === 0;

                    return (
                      <DropdownMenuItem key={release.tag_name} onClick={() => downloadVersion(release)} disabled={isCurrentVersion} className="flex items-center justify-between gap-2 py-2">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{version}</span>
                            {isLatest && (
                              <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                最新
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">{formatDate(release.published_at)}</span>
                        </div>
                        {isCurrentVersion && <TbCheck className="h-4 w-4 text-primary flex-shrink-0" />}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        }
      >
        {/* 下载进度条 */}
        {downloading && progress && (
          <div className="space-y-2">
            <Progress value={getProgressPercent()} className="h-2" />
            <div className="text-xs text-muted-foreground text-center">{getStatusText()}</div>
          </div>
        )}
      </SettingItem>

      {/* 打开下载文件夹 */}
      <SettingItem
        title="打开下载文件夹"
        description="在文件管理器中打开 yt-dlp 下载安装的文件夹位置"
        action={
          <Button variant="ghost" size="sm" onClick={openFolder} className="h-8">
            <TbFolderOpen className="h-4 w-4 mr-1.5" />
            打开
          </Button>
        }
      />

      {/* 重置为内置版本 */}
      <SettingItem
        title="重置下载器"
        description="将 yt-dlp 重置为软件内置的版本"
        action={
          <Button variant="ghost" size="sm" onClick={resetToBuiltin} disabled={downloading} className="h-8">
            <TbRotate className="h-4 w-4 mr-1.5" />
            重置
          </Button>
        }
      />

      {/* 打开配置文件路径 */}
      <SettingItem
        title="打开配置文件路径"
        description="在文件管理器中打开 yt-dlp 配置文件所在的位置"
        action={
          <Button variant="ghost" size="sm" onClick={openConfigPath} className="h-8">
            <TbFolderOpen className="h-4 w-4 mr-1.5" />
            打开
          </Button>
        }
      />

      {/* 启用下载资料扩展 */}
      <SettingItem
        title="启用下载资料扩展"
        description="启用后可以从外部网站下载视频、音频等资源"
        action={
          <Switch
            checked={externalSettings.externalResourceEnabled !== false}
            onCheckedChange={(checked: boolean) => updateExternalSettings({ externalResourceEnabled: checked })}
            disabled={loadingSettings}
          />
        }
      />

      {/* 使用浏览器 Cookie */}
      {externalSettings.externalResourceEnabled !== false && (
        <SettingItem
          title="使用浏览器 Cookie"
          description="启用后将读取浏览器 Cookie，用于访问需要登录的资源"
          action={
            <Switch
              checked={externalSettings.externalResourceCookies}
              onCheckedChange={(checked: boolean) => updateExternalSettings({ externalResourceCookies: checked })}
              disabled={loadingSettings}
            />
          }
        >
          {/* 首选浏览器选择 */}
          {externalSettings.externalResourceCookies && (
            <div className="mt-3 space-y-2">
              <label className="text-xs font-medium text-foreground">首选浏览器</label>
              <Select value={externalSettings.preferredBrowser} onValueChange={(v) => updateExternalSettings({ preferredBrowser: v })} disabled={loadingSettings}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择浏览器" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="chrome">Chrome</SelectItem>
                  <SelectItem value="firefox">Firefox</SelectItem>
                  <SelectItem value="edge">Edge</SelectItem>
                  <SelectItem value="safari">Safari</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">若首选浏览器不可用，将自动回退到其他浏览器。</p>
            </div>
          )}
        </SettingItem>
      )}

      {/* 下载质量模式 */}
      {externalSettings.externalResourceEnabled !== false && (
        <SettingItem title="下载质量模式" description="针对视频数据设置默认下载质量，避免占用过多空间或带宽" action={null}>
          <div className="mt-3">
            <Tabs value={externalSettings.externalResourceMode} onValueChange={(v) => updateExternalSettings({ externalResourceMode: v })}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="1">高质量</TabsTrigger>
                <TabsTrigger value="2">限制质量（480p 以下）</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </SettingItem>
      )}

      {/* EJS 远程组件配置 */}
      {externalSettings.externalResourceEnabled !== false && (
        <SettingItem title="EJS 远程组件" description="配置 EJS 脚本的获取方式，用于解密 YouTube 视频" action={null}>
          <div className="mt-3">
            <Select
              value={externalSettings.ejsRemoteComponents || 'github'}
              onValueChange={(v: 'github' | 'npm' | 'none') => updateExternalSettings({ ejsRemoteComponents: v })}
              disabled={loadingSettings}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="github">GitHub（推荐）</SelectItem>
                <SelectItem value="npm">npm（需要 deno/bun）</SelectItem>
                <SelectItem value="none">使用内置版本</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">GitHub：自动从 GitHub 下载最新 EJS 脚本。npm：从 npm 下载（需要 deno 或 bun 运行时）。内置：使用 PyInstaller 打包的版本。</p>
          </div>
        </SettingItem>
      )}

      {/* EJS JS 运行时配置 */}
      {externalSettings.externalResourceEnabled !== false && (
        <SettingItem title="EJS JavaScript 运行时" description="选择用于运行 EJS 脚本的 JavaScript 运行时" action={null}>
          <div className="mt-3">
            <Select
              value={externalSettings.ejsJsRuntime || 'auto'}
              onValueChange={(v: 'deno' | 'node' | 'bun' | 'quickjs' | 'auto') => updateExternalSettings({ ejsJsRuntime: v })}
              disabled={loadingSettings}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">自动检测（推荐）</SelectItem>
                <SelectItem value="deno">Deno</SelectItem>
                <SelectItem value="node">Node.js</SelectItem>
                <SelectItem value="bun">Bun</SelectItem>
                <SelectItem value="quickjs">QuickJS</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">自动检测会优先使用 deno（推荐），如果未安装则回退到其他可用的运行时。</p>
          </div>
        </SettingItem>
      )}
    </SettingGroup>
  );
};

export default DownloaderSettings;
