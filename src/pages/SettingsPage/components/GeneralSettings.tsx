import React, { useEffect, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

// 外部资源设置类型
type GeneralSettings = {
  externalResourceMode: string;
  externalResourceCookies: boolean;
  preferredBrowser: string;
};

// 角色移动参数类型
type MovementConfig = {
  walkSpeed: number;
  fpsLimit: number;
  movementMode: 'stepped' | 'smooth';
  stepGrid: number;
  pathCurveFactor: number;
  assistantPadding: number;
};

const GeneralSettings: React.FC = () => {
  const [externalSettings, setExternalSettings] = useState<GeneralSettings>({
    externalResourceMode: '1',
    externalResourceCookies: false,
    preferredBrowser: 'chrome'
  });

  // 移动参数本地状态
  const [movementConfig, setMovementConfig] = useState<MovementConfig | null>(null);
  // refs to control auto-save behavior
  const externalLoadedRef = useRef(false);
  const movementLoadedRef = useRef(false);
  const movementApplyingRef = useRef(false);

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

      // 读取移动参数
      try {
        const cfg = await window.YUA.window.getMovementConfig();
        if (!cancelled) {
          movementApplyingRef.current = true; // prevent immediate autosave from initial set
          setMovementConfig(cfg);
          movementLoadedRef.current = true;
        }
      } catch (err) {
        console.warn('加载移动参数失败:', err);
      }
    })();

    // 监听移动参数变更
    const movementListener = (_: any, c: MovementConfig): void => {
      movementApplyingRef.current = true; // mark as remote update to avoid loop
      setMovementConfig(c);
    };
    window.ipcRenderer?.on('movement-config-updated', movementListener);

    return () => {
      cancelled = true;
      window.ipcRenderer?.off('movement-config-updated', movementListener as any);
    };
  }, []);

  const updateMovement = (partial: Partial<MovementConfig>): void => {
    if (!movementConfig) return;
    setMovementConfig({ ...movementConfig, ...partial });
  };

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

  // Auto-save movement settings with debounce and loop prevention
  useEffect(() => {
    if (!movementConfig) return;
    if (!movementLoadedRef.current) return;
    if (movementApplyingRef.current) {
      // change came from remote (initial load or IPC). Clear flag and skip saving this tick.
      movementApplyingRef.current = false;
      return;
    }
    const timer = setTimeout(async () => {
      try {
        await window.YUA.window.updateMovementConfig(movementConfig);
      } catch (error) {
        console.error('自动保存移动参数失败:', error);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [movementConfig]);

  return (
    <div className="space-y-6">
      {/* 移动参数设置 */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="space-y-6">
          <div className="text-base font-semibold text-foreground">移动参数</div>
          {!movementConfig ? (
            <div className="text-sm text-muted-foreground">加载中...</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-2">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">行走速度 (px/s)</label>
                    <Input type="number" value={movementConfig?.walkSpeed || 0} onChange={(e) => updateMovement({ walkSpeed: +e.target.value })} />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">FPS 限制</label>
                    <Input type="number" value={movementConfig?.fpsLimit || 0} onChange={(e) => updateMovement({ fpsLimit: +e.target.value })} />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">移动模式</label>
                    <Select value={movementConfig?.movementMode || 'stepped'} onValueChange={(v) => updateMovement({ movementMode: v as MovementConfig['movementMode'] })}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="选择移动模式" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="stepped">离散步进</SelectItem>
                        <SelectItem value="smooth">平滑</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">步进网格 (px)</label>
                    <Input type="number" value={movementConfig?.stepGrid || 0} onChange={(e) => updateMovement({ stepGrid: +e.target.value })} />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">路径弯曲系数</label>
                    <Input type="number" step="0.01" value={movementConfig?.pathCurveFactor || 0} onChange={(e) => updateMovement({ pathCurveFactor: +e.target.value })} />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">角色内边距 (px)</label>
                    <Input type="number" value={movementConfig?.assistantPadding || 0} onChange={(e) => updateMovement({ assistantPadding: +e.target.value })} />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

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
