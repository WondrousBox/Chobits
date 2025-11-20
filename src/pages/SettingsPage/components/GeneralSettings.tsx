import React, { useEffect, useRef, useState } from 'react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

// 外部资源设置类型
type GeneralSettings = {
  externalResourceMode: string;
  externalResourceCookies: boolean;
  preferredBrowser: string;
};

const GeneralSettings: React.FC = () => {
  const [externalSettings, setExternalSettings] = useState<GeneralSettings>({
    externalResourceMode: '1',
    externalResourceCookies: false,
    preferredBrowser: 'chrome'
  });

  // refs to control auto-save behavior
  const externalLoadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await window.YUA.videoDownloader['getExternalResourceSettings']();
        if (settings && !cancelled) {
          setExternalSettings(settings);
          externalLoadedRef.current = true; // mark initial load to skip first auto-save
        }
      } catch (error) {
        console.warn('加载外部资源设置失败:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-save external settings with debounce
  useEffect(() => {
    if (!externalLoadedRef.current) {
      // first assignment from load – don't save
      externalLoadedRef.current = true;
      return;
    }
    const timer = setTimeout(async () => {
      try {
        await window.YUA.videoDownloader['setExternalResourceSettings'](externalSettings);
      } catch (error) {
        console.error('自动保存外部资源设置失败:', error);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [externalSettings]);

  return (
    <div className="space-y-6">
      {/* 外部资源设置 */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="text-base font-semibold text-foreground">下载设置</div>
        <div className="space-y-6">
          {/* Cookie 设置 */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-foreground">使用浏览器 Cookie</h4>
                <p className="text-xs text-muted-foreground mt-1">启用后将从浏览器获取 Cookie 以访问需要登录的内容</p>
              </div>
              <Switch checked={externalSettings.externalResourceCookies} onCheckedChange={(checked: boolean) => setExternalSettings((prev) => ({ ...prev, externalResourceCookies: checked }))} />
            </div>
          </div>

          {/* 浏览器选择 */}
          {externalSettings.externalResourceCookies && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">首选浏览器</label>
              <Select value={externalSettings.preferredBrowser} onValueChange={(v) => setExternalSettings((prev) => ({ ...prev, preferredBrowser: v }))}>
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
              <p className="text-xs text-muted-foreground">如果首选浏览器不可用，将自动尝试其他浏览器</p>
            </div>
          )}

          {/* 下载模式 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">下载模式</label>
            <Tabs value={externalSettings.externalResourceMode} onValueChange={(v) => setExternalSettings((prev) => ({ ...prev, externalResourceMode: v }))} className="w-[400px]">
              <TabsList>
                <TabsTrigger value="1">高质量</TabsTrigger>
                <TabsTrigger value="2">限制质量（480p 以下）</TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="text-xs text-muted-foreground">选择下载视频的质量限制</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeneralSettings;
