import type { SpriteCapabilityState } from '@packages/sprite-core/capability-registry';
import React, { useCallback, useEffect, useState } from 'react';
import { TbMoodKid } from 'react-icons/tb';
import { toast } from 'sonner';

import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

import { SettingGroup, SettingItem } from '../SettingsPage/components/SettingComponents';
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

function useAssistantMiniWindowSetting(): {
  enabled: boolean;
  loading: boolean;
  pending: boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
} {
  const [enabled, setEnabledState] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let disposed = false;

    const load = async (): Promise<void> => {
      try {
        const result = await window.YUA.preferences['preferences:getConfig']();
        if (!disposed && result.ok && result.config) {
          setEnabledState(Boolean(result.config.assistantMiniWindowEnabled));
        }
      } catch (error) {
        console.warn('[SpriteSettings] failed to load assistant mini window setting:', error);
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      disposed = true;
    };
  }, []);

  const setEnabled = useCallback(
    async (nextEnabled: boolean): Promise<void> => {
      if (pending) return;
      const previous = enabled;
      setEnabledState(nextEnabled);
      setPending(true);
      try {
        const result = await window.YUA.preferences['preferences:setConfig']({
          config: { assistantMiniWindowEnabled: nextEnabled }
        });
        if (!result.ok || !result.config) {
          throw new Error(result.error || '设置迷你输入窗失败');
        }
        setEnabledState(Boolean(result.config.assistantMiniWindowEnabled));
      } catch (error) {
        setEnabledState(previous);
        toast.error('设置迷你输入窗失败', {
          description: error instanceof Error ? error.message : String(error)
        });
      } finally {
        setPending(false);
      }
    },
    [enabled, pending]
  );

  return { enabled, loading, pending, setEnabled };
}

const AssistantMiniWindowSettings: React.FC = () => {
  const setting = useAssistantMiniWindowSetting();

  return (
    <SettingGroup title="对话入口">
      <SettingItem
        title="双击打开迷你输入窗"
        description="开启后，双击桌面精灵会打开跟随精灵的小输入窗，只显示模型、麦克风和发送入口。其他对话选项继续沿用本地缓存。"
        action={<Switch checked={setting.enabled} disabled={setting.loading || setting.pending} onCheckedChange={(checked) => void setting.setEnabled(checked)} />}
      />
    </SettingGroup>
  );
};

export const SpriteDetailContent: React.FC<{ assetAuthoringCapability?: SpriteCapabilityState | null; onBlocked?: (capability: SpriteCapabilityState) => void }> = ({
  assetAuthoringCapability,
  onBlocked
}) => (
  <div className="space-y-4">
    <AssistantMiniWindowSettings />
    <SpriteManager assetAuthoringCapability={assetAuthoringCapability} onCapabilityBlocked={onBlocked} />
  </div>
);

const SpriteSettings: React.FC = () => (
  <div className="space-y-4">
    <AssistantMiniWindowSettings />
    <SpriteManager />
  </div>
);

export default SpriteSettings;
