import React, { useEffect, useState } from 'react';
import { TbRun } from 'react-icons/tb';

import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

/* ─── Hook ─── */
export function useMovementSettings() {
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

  const handleToggle = async (checked: boolean): Promise<void> => {
    try {
      await window.YUA.window.setAutoWalkEnabled(checked);
      setEnabled(checked);
    } catch (error) {
      console.error('设置自动移动开关失败:', error);
    }
  };

  return { enabled, loading, handleToggle };
}

export type MovementSettingsState = ReturnType<typeof useMovementSettings>;

/* ─── Left-panel item ─── */
export const MovementItem: React.FC<{
  state: MovementSettingsState;
  selected: boolean;
  onSelect: () => void;
}> = ({ state, selected, onSelect }) => (
  <div onClick={onSelect} className={cn('flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-accent/50', selected && 'bg-accent ring-1 ring-primary/30')}>
    <div className={cn('flex h-10 w-10 items-center justify-center rounded-full shrink-0 transition-colors', state.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
      <TbRun className="h-5 w-5" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium text-foreground">自由移动</div>
      <div className="text-xs text-muted-foreground line-clamp-1">开启之后，精灵可以在桌面自由走动。</div>
    </div>
    <div onClick={(e) => e.stopPropagation()}>
      <Switch checked={state.enabled} onCheckedChange={state.handleToggle} disabled={state.loading} />
    </div>
  </div>
);

/* ─── Right-panel detail ─── */
export const MovementDetailContent: React.FC<{ state: MovementSettingsState }> = ({ state }) => (
  <div className="space-y-3">
    <p className="text-sm text-muted-foreground">开启此功能后，精灵将可以在桌面上自由走动，在桌面的可用区域内随机移动。</p>
    <div className="flex items-center gap-2">
      <div className={cn('w-2 h-2 rounded-full', state.enabled ? 'bg-green-500' : 'bg-gray-400')} />
      <span className="text-sm">{state.enabled ? '自由移动已开启' : '自由移动已关闭'}</span>
    </div>
  </div>
);

/* ─── Default: self-contained detail (for SkillDetailPanel) ─── */
const MovementSettings: React.FC = () => {
  const state = useMovementSettings();
  return <MovementDetailContent state={state} />;
};

export default MovementSettings;
