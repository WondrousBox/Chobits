import React, { useCallback, useEffect, useState } from 'react';
import { TbCheck, TbDownload, TbFolderOpen, TbLoader2, TbRefresh, TbRotate } from 'react-icons/tb';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';

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

const DownloaderSettings: React.FC = () => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);

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

  // 监听下载进度
  useEffect(() => {
    const unsubscribe = window.YUA.ytdlp.onDownloadProgress((p: DownloadProgress) => {
      setProgress(p);
    });
    return unsubscribe;
  }, []);

  // 初始化时检查更新
  useEffect(() => {
    checkUpdate();
  }, [checkUpdate]);

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
    </SettingGroup>
  );
};

export default DownloaderSettings;
