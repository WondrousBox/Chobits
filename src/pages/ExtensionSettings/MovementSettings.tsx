import React from 'react';
import { TbRun } from 'react-icons/tb';

import type { SpriteCapabilityState } from '@packages/sprite-core/capability-registry';
import { Switch } from '@/components/ui/switch';
import { SpriteCapabilityLockedNotice } from '@/features/sprite-assistant/capability-ui';
import { cn } from '@/lib/utils';

import { type MovementSettingsState, useMovementSettings } from './useMovementSettings';

/* ─── Left-panel item ─── */
export const MovementItem: React.FC<{
  state: MovementSettingsState;
  capability?: SpriteCapabilityState | null;
  selected: boolean;
  onSelect: () => void;
}> = ({ state, capability, selected, onSelect }) => (
  <div
    onClick={onSelect}
    className={cn('flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-accent/50', selected && 'bg-accent ring-1 ring-primary/30', capability?.status === 'locked' && 'opacity-70')}
  >
    <div className={cn('flex h-10 w-10 items-center justify-center rounded-full shrink-0 transition-colors', state.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
      <TbRun className="h-5 w-5" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium text-foreground">自由移动</div>
      <div className="text-xs text-muted-foreground line-clamp-1">开启之后，精灵可以在桌面自由走动。</div>
    </div>
    <div onClick={(e) => e.stopPropagation()}>
      <Switch checked={state.enabled} onCheckedChange={state.handleToggle} disabled={state.loading || capability?.status === 'locked'} />
    </div>
  </div>
);

/* ─── Right-panel detail ─── */
export const MovementDetailContent: React.FC<{ state: MovementSettingsState; capability?: SpriteCapabilityState | null }> = ({ state, capability }) => {
  if (capability?.status === 'locked') {
    return <SpriteCapabilityLockedNotice capability={capability} hint="自由移动属于成长型能力，解锁后才能真正接管 auto-walk 运行态。" />;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">开启此功能后，精灵将可以在桌面上自由走动，在桌面的可用区域内随机移动。</p>
      <div className="flex items-center gap-2">
        <div className={cn('w-2 h-2 rounded-full', state.enabled ? 'bg-green-500' : 'bg-gray-400')} />
        <span className="text-sm">{state.enabled ? '自由移动已开启' : '自由移动已关闭'}</span>
      </div>
    </div>
  );
};

/* ─── Default: self-contained detail (for SkillDetailPanel) ─── */
const MovementSettings: React.FC<{ capability?: SpriteCapabilityState | null }> = ({ capability }) => {
  const state = useMovementSettings({ capability });
  return <MovementDetailContent state={state} capability={capability} />;
};

export default MovementSettings;
