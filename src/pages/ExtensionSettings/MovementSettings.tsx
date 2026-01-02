import React, { useEffect, useState } from 'react';
import { TbRun } from 'react-icons/tb';

import { Switch } from '@/components/ui/switch';

type MovementSettingsProps = {
  expanded: boolean;
  onExpand: () => void;
};

const MovementSettings: React.FC<MovementSettingsProps> = () => {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const isEnabled = await window.YUA.window.getAutoWalkEnabled();
        if (!cancelled) {
          setEnabled(isEnabled);
          setLoading(false);
        }
      } catch (error) {
        console.warn('加载自动移动开关失败:', error);
        setLoading(false);
      }
    })();

    const listener = (_: any, isEnabled: boolean): void => {
      if (!cancelled) {
        setEnabled(isEnabled);
      }
    };
    window.ipcRenderer?.on('auto-walk-enabled-changed', listener);

    return () => {
      cancelled = true;
      window.ipcRenderer?.off('auto-walk-enabled-changed', listener as any);
    };
  }, []);

  const handleToggleEnabled = async (checked: boolean): void => {
    try {
      await window.YUA.window.setAutoWalkEnabled(checked);
      setEnabled(checked);
    } catch (error) {
      console.error('设置自动移动开关失败:', error);
    }
  };

  return (
    <div className="space-y-3">
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
            <Switch checked={enabled} onCheckedChange={handleToggleEnabled} disabled={loading} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MovementSettings;
