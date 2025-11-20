import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbDownload, TbRefresh } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type DownloadResourceSettingsState = {
  externalResourceMode: string;
  externalResourceCookies: boolean;
  preferredBrowser: string;
};

const defaultState: DownloadResourceSettingsState = {
  externalResourceMode: '1',
  externalResourceCookies: false,
  preferredBrowser: 'chrome'
};

const DownloadResourceSettings: React.FC = () => {
  const [externalSettings, setExternalSettings] = useState<DownloadResourceSettingsState>(defaultState);
  const [loading, setLoading] = useState(false);
  const loadedRef = useRef(false);

  const fetchExternalSettings = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await window.YUA.videoDownloader['getExternalResourceSettings']();
      setExternalSettings(settings ?? defaultState);
      loadedRef.current = true;
    } catch (error) {
      console.warn('加载外部资源设置失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExternalSettings();
  }, [fetchExternalSettings]);

  useEffect(() => {
    if (!loadedRef.current) return;
    const timer = setTimeout(async () => {
      try {
        await window.YUA.videoDownloader['setExternalResourceSettings'](externalSettings);
      } catch (error) {
        console.error('自动保存外部资源设置失败:', error);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [externalSettings]);

  const updateSettings = (partial: Partial<DownloadResourceSettingsState>): void => {
    setExternalSettings((prev) => ({ ...prev, ...partial }));
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <TbDownload className="h-6 w-6" />
            </div>
            <div>
              <div className="text-base font-semibold text-foreground">下载资料扩展</div>
              <div className="text-sm text-muted-foreground">管理外部资源抓取、Cookie 登录与质量限制。</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={fetchExternalSettings} disabled={loading}>
              <TbRefresh className={loading ? 'animate-spin' : ''} />
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">使用浏览器 Cookie</p>
            <p className="text-xs text-muted-foreground mt-1">启用后将读取浏览器 Cookie，用于访问需要登录的资源。</p>
          </div>
          <Switch checked={externalSettings.externalResourceCookies} onCheckedChange={(checked: boolean) => updateSettings({ externalResourceCookies: checked })} />
        </div>

        {externalSettings.externalResourceCookies && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">首选浏览器</label>
            <Select value={externalSettings.preferredBrowser} onValueChange={(v) => updateSettings({ preferredBrowser: v })}>
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

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">下载质量模式</label>
          <Tabs value={externalSettings.externalResourceMode} onValueChange={(v) => updateSettings({ externalResourceMode: v })}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="1">高质量</TabsTrigger>
              <TabsTrigger value="2">限制质量（480p 以下）</TabsTrigger>
            </TabsList>
          </Tabs>
          <p className="text-xs text-muted-foreground">针对视频数据设置默认下载质量，避免占用过多空间或带宽。</p>
        </div>
      </div>
    </div>
  );
};

export default DownloadResourceSettings;
