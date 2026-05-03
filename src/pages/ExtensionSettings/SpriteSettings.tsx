import type { SpriteCapabilityState } from '@packages/sprite-core/capability-registry';
import React from 'react';
import { TbMoodKid } from 'react-icons/tb';

import { cn } from '@/lib/utils';

import SpriteManager from './SpriteManager';

export const SpriteItem: React.FC<{
  selected: boolean;
  onSelect: () => void;
}> = ({ selected, onSelect }) => (
  <div onClick={onSelect} className={cn('flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-accent/50', selected && 'bg-accent ring-1 ring-primary/30')}>
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
      <TbMoodKid className="h-5 w-5" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium text-foreground">精灵管理</div>
      <div className="text-xs text-muted-foreground line-clamp-1">管理桌面精灵动画资源、导入与调试动作</div>
    </div>
  </div>
);

export const SpriteDetailContent: React.FC<{ actionChoreographyCapability?: SpriteCapabilityState | null; onBlocked?: (capability: SpriteCapabilityState) => void }> = ({
  actionChoreographyCapability,
  onBlocked
}) => <SpriteManager actionChoreographyCapability={actionChoreographyCapability} onCapabilityBlocked={onBlocked} />;

const SpriteSettings: React.FC = () => <SpriteManager />;

export default SpriteSettings;
