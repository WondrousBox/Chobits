import React, { useEffect, useRef, useState } from 'react';
import { TbRun } from 'react-icons/tb';

import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

type MovementConfig = {
  walkSpeed: number;
  fpsLimit: number;
  movementMode: 'stepped' | 'smooth';
  stepGrid: number;
  pathCurveFactor: number;
  assistantPadding: number;
  enabled?: boolean;
};

const MovementSettings: React.FC = () => {
  const [movementConfig, setMovementConfig] = useState<MovementConfig | null>(null);
  const loadedRef = useRef(false);
  const applyingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await window.YUA.window.getMovementConfig();
        if (!cancelled) {
          applyingRef.current = true;
          setMovementConfig(cfg);
          loadedRef.current = true;
        }
      } catch (error) {
        console.warn('加载移动参数失败:', error);
      }
    })();

    const listener = (_: any, cfg: MovementConfig): void => {
      applyingRef.current = true;
      setMovementConfig(cfg);
    };
    window.ipcRenderer?.on('movement-config-updated', listener);

    return () => {
      cancelled = true;
      window.ipcRenderer?.off('movement-config-updated', listener as any);
    };
  }, []);

  const updateMovement = (partial: Partial<MovementConfig>): void => {
    if (!movementConfig) return;
    setMovementConfig({ ...movementConfig, ...partial });
  };

  useEffect(() => {
    if (!movementConfig) return;
    if (!loadedRef.current) return;
    if (applyingRef.current) {
      applyingRef.current = false;
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

  const enabled = movementConfig?.enabled !== false;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <TbRun className="h-6 w-6" />
            </div>
            <div>
              <div className="text-base font-semibold text-foreground">自由移动</div>
              <div className="text-sm text-muted-foreground">开启之后，精灵可以在桌面自由走动。</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={enabled} onCheckedChange={(checked) => updateMovement({ enabled: checked })} disabled={!movementConfig} />
          </div>
        </div>
      </div>

      {movementConfig && enabled && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">行走速度 (px/s)</label>
                <Input type="number" value={movementConfig.walkSpeed || 0} onChange={(e) => updateMovement({ walkSpeed: +e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">FPS 限制</label>
                <Input type="number" value={movementConfig.fpsLimit || 0} onChange={(e) => updateMovement({ fpsLimit: +e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">移动模式</label>
                <Select value={movementConfig.movementMode || 'stepped'} onValueChange={(v) => updateMovement({ movementMode: v as MovementConfig['movementMode'] })}>
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
                <Input type="number" value={movementConfig.stepGrid || 0} onChange={(e) => updateMovement({ stepGrid: +e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">路径弯曲系数</label>
                <Input type="number" step="0.01" value={movementConfig.pathCurveFactor || 0} onChange={(e) => updateMovement({ pathCurveFactor: +e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">角色内边距 (px)</label>
                <Input type="number" value={movementConfig.assistantPadding || 0} onChange={(e) => updateMovement({ assistantPadding: +e.target.value })} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MovementSettings;
