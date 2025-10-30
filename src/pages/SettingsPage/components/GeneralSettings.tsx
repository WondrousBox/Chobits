import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

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

  const saveExternalSettings = async (): Promise<void> => {
    try {
      await (window.YUA as any).videoDownloader['setGeneralSettings'](externalSettings);
    } catch (error) {
      console.error('保存外部资源设置失败:', error);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await (window.YUA as any).videoDownloader['getGeneralSettings']();
        if (settings && !cancelled) {
          setExternalSettings(settings);
        }
      } catch (error) {
        console.warn('加载外部资源设置失败:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="space-y-6">
          {/* Cookie 设置 */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-foreground">使用浏览器 Cookie</h4>
                <p className="text-xs text-muted-foreground mt-1">启用后将从浏览器获取 Cookie 以访问需要登录的内容</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={externalSettings.externalResourceCookies}
                  onChange={(e) => setExternalSettings((prev) => ({ ...prev, externalResourceCookies: e.target.checked }))}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>

          {/* 浏览器选择 */}
          {externalSettings.externalResourceCookies && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">首选浏览器</label>
              <select
                className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                value={externalSettings.preferredBrowser}
                onChange={(e) => setExternalSettings((prev) => ({ ...prev, preferredBrowser: e.target.value }))}
              >
                <option value="chrome">Chrome</option>
                <option value="firefox">Firefox</option>
                <option value="edge">Edge</option>
                <option value="safari">Safari</option>
              </select>
              <p className="text-xs text-muted-foreground">如果首选浏览器不可用，将自动尝试其他浏览器</p>
            </div>
          )}

          {/* 下载模式 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">下载模式</label>
            <select
              className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              value={externalSettings.externalResourceMode}
              onChange={(e) => setExternalSettings((prev) => ({ ...prev, externalResourceMode: e.target.value }))}
            >
              <option value="1">高质量（默认）</option>
              <option value="2">限制质量（480p 以下）</option>
            </select>
            <p className="text-xs text-muted-foreground">选择下载视频的质量限制</p>
          </div>

          {/* 保存按钮 */}
          <div className="flex justify-end pt-4">
            <Button onClick={saveExternalSettings} size="sm">
              保存设置
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeneralSettings;
