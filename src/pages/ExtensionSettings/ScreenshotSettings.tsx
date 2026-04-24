import React, { useEffect, useState } from 'react';
import { TbCamera, TbKey, TbLoader2 } from 'react-icons/tb';

import type { SpriteCapabilityState } from '@packages/sprite-core/capability-registry';
import { Switch } from '@/components/ui/switch';
import { SpriteCapabilityLockedNotice, ensureSpriteCapabilityAccessible, type SpriteCapabilityGuardOptions } from '@/features/sprite-assistant/capability-ui';
import { cn } from '@/lib/utils';

type PlatformKey = 'darwin' | 'win32' | 'linux';
type ShortcutsConfig = Record<string, string | string[] | Partial<Record<PlatformKey, string | string[]>>>;
type ShortcutEnabledConfig = {
  screenshot: boolean;
};

/* ─── Hook ─── */
export function useScreenshotSettings(options?: SpriteCapabilityGuardOptions) {
  const [shortcutConfig, setShortcutConfig] = useState<string>('');
  const [shortcutLoading, setShortcutLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [enabledLoading, setEnabledLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const currentPlatform: PlatformKey = ((): PlatformKey => {
    try {
      if (window.YUA?.isMac) return 'darwin';
      if (window.YUA?.isWindows) return 'win32';
      return 'linux';
    } catch {
      return 'darwin';
    }
  })();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resCfg = await window.YUA.shortcuts['shortcuts:getConfig']();
        if (!cancelled && resCfg?.ok && resCfg.data) {
          const screenshotShortcut = (resCfg.data as ShortcutsConfig)['screenshot'];
          if (screenshotShortcut) {
            if (typeof screenshotShortcut === 'string') {
              setShortcutConfig(screenshotShortcut);
            } else if (typeof screenshotShortcut === 'object' && !Array.isArray(screenshotShortcut)) {
              const platformShortcut = screenshotShortcut[currentPlatform];
              if (typeof platformShortcut === 'string') {
                setShortcutConfig(platformShortcut);
              } else if (Array.isArray(platformShortcut) && platformShortcut.length > 0) {
                setShortcutConfig(platformShortcut[0]);
              }
            } else if (Array.isArray(screenshotShortcut) && screenshotShortcut.length > 0) {
              setShortcutConfig(screenshotShortcut[0]);
            }
          }
        }

        const resEnabled = await window.YUA.shortcuts['shortcuts:getEnabledConfig']();
        if (!cancelled && resEnabled?.ok && resEnabled.data) {
          setEnabled(resEnabled.data.screenshot ?? false);
        }
      } catch (error) {
        console.warn('加载快捷键配置失败:', error);
      } finally {
        if (!cancelled) {
          setShortcutLoading(false);
          setEnabledLoading(false);
        }
      }
    })();

    const listener = (_: any, data: ShortcutsConfig): void => {
      const screenshotShortcut = data['screenshot'];
      if (screenshotShortcut) {
        if (typeof screenshotShortcut === 'string') {
          setShortcutConfig(screenshotShortcut);
        } else if (typeof screenshotShortcut === 'object' && !Array.isArray(screenshotShortcut)) {
          const platformShortcut = screenshotShortcut[currentPlatform];
          if (typeof platformShortcut === 'string') {
            setShortcutConfig(platformShortcut);
          } else if (Array.isArray(platformShortcut) && platformShortcut.length > 0) {
            setShortcutConfig(platformShortcut[0]);
          }
        } else if (Array.isArray(screenshotShortcut) && screenshotShortcut.length > 0) {
          setShortcutConfig(screenshotShortcut[0]);
        }
      }
    };

    const enabledListener = (_: any, data: ShortcutEnabledConfig): void => {
      setEnabled(data.screenshot ?? false);
    };

    window.ipcRenderer?.on('shortcuts-config-updated', listener);
    window.ipcRenderer?.on('shortcuts-enabled-updated', enabledListener);

    return () => {
      cancelled = true;
      window.ipcRenderer?.off('shortcuts-config-updated', listener as any);
      window.ipcRenderer?.off('shortcuts-enabled-updated', enabledListener as any);
    };
  }, [currentPlatform]);

  const formatShortcut = (shortcut: string): string => {
    return shortcut
      .replace(/CommandOrControl/g, currentPlatform === 'darwin' ? '⌘' : 'Ctrl')
      .replace(/Command/g, '⌘')
      .replace(/Control/g, 'Ctrl')
      .replace(/Shift/g, '⇧')
      .replace(/Alt/g, '⌥')
      .replace(/\+/g, ' + ');
  };

  const handleToggle = async (checked: boolean): Promise<void> => {
    if (checked && !ensureSpriteCapabilityAccessible(options?.capability, options?.onBlocked)) {
      return;
    }
    if (toggling) return;
    setToggling(true);
    try {
      const res = await window.YUA.shortcuts['shortcuts:setEnabledConfig']({ screenshot: checked });
      if (res?.ok) {
        setEnabled(checked);
      } else {
        console.warn('切换截图功能失败:', res?.error);
      }
    } catch (error) {
      console.warn('切换截图功能失败:', error);
    } finally {
      setToggling(false);
      await options?.afterChange?.();
    }
  };

  return { enabled, enabledLoading, toggling, shortcutConfig, shortcutLoading, capability: options?.capability ?? null, handleToggle, formatShortcut };
}

export type ScreenshotSettingsState = ReturnType<typeof useScreenshotSettings>;

/* ─── Left-panel item ─── */
export const ScreenshotItem: React.FC<{
  state: ScreenshotSettingsState;
  capability?: SpriteCapabilityState | null;
  selected: boolean;
  onSelect: () => void;
}> = ({ state, capability, selected, onSelect }) => (
  <div
    onClick={onSelect}
    className={cn('flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-accent/50', selected && 'bg-accent ring-1 ring-primary/30', capability?.status === 'locked' && 'opacity-70')}
  >
    <div className={cn('flex h-10 w-10 items-center justify-center rounded-full shrink-0 transition-colors', state.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
      <TbCamera className="h-5 w-5" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium text-foreground">屏幕截图</div>
      <div className="text-xs text-muted-foreground line-clamp-1">使用快捷键进行屏幕截图。</div>
    </div>
    <div onClick={(e) => e.stopPropagation()}>
      {state.enabledLoading ? <TbLoader2 className="animate-spin h-4 w-4 text-muted-foreground" /> : <Switch checked={state.enabled} onCheckedChange={state.handleToggle} disabled={state.toggling || capability?.status === 'locked'} />}
    </div>
  </div>
);

/* ─── Right-panel detail ─── */
export const ScreenshotDetailContent: React.FC<{ state: ScreenshotSettingsState; capability?: SpriteCapabilityState | null }> = ({ state, capability }) => {
  if (capability?.status === 'locked') {
    return <SpriteCapabilityLockedNotice capability={capability} hint="截图入口现在受 capability runtime 管控，解锁后才允许注册快捷键。" />;
  }

  const { enabled, shortcutConfig, shortcutLoading, formatShortcut } = state;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className={cn('w-2 h-2 rounded-full', enabled ? 'bg-green-500' : 'bg-gray-400')} />
          <span className="text-sm font-medium">{enabled ? '截图功能已启用' : '截图功能已禁用'}</span>
        </div>
        <p className="text-xs text-muted-foreground">{enabled ? '快捷键已注册，可以使用快捷键进行截图。' : '开启后将注册截图快捷键，关闭后快捷键将被解除注册。'}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <TbKey className="text-muted-foreground" />
          <span className="text-sm font-medium">快捷键设置</span>
        </div>
        {shortcutLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TbLoader2 className="animate-spin h-4 w-4" />
            <span>加载中...</span>
          </div>
        ) : shortcutConfig ? (
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="text-xs text-muted-foreground mb-1">当前快捷键</div>
            <div className="text-sm font-mono font-semibold">{formatShortcut(shortcutConfig)}</div>
            <div className="text-xs text-muted-foreground mt-2">提示：可在设置页面的「快捷键」选项中修改截图快捷键</div>
          </div>
        ) : (
          <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">未配置快捷键，可在设置页面的「快捷键」选项中设置</div>
        )}
      </div>
    </div>
  );
};

/* ─── Default: self-contained detail (for SkillDetailPanel) ─── */
const ScreenshotSettings: React.FC<{ capability?: SpriteCapabilityState | null }> = ({ capability }) => {
  const state = useScreenshotSettings({ capability });
  return <ScreenshotDetailContent state={state} capability={capability} />;
};

export default ScreenshotSettings;
