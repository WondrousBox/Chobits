import { AnimatePresence, motion } from 'framer-motion';
import React, { useEffect, useState } from 'react';
import { TbCamera, TbChevronDown, TbKey, TbLoader2 } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

type ScreenshotSettingsProps = {
  expanded: boolean;
  onExpand: () => void;
};

type PlatformKey = 'darwin' | 'win32' | 'linux';
type ShortcutsConfig = Record<string, string | string[] | Partial<Record<PlatformKey, string | string[]>>>;

const ScreenshotSettings: React.FC<ScreenshotSettingsProps> = ({ expanded, onExpand }) => {
  const [shortcutConfig, setShortcutConfig] = useState<string>('');
  const [shortcutLoading, setShortcutLoading] = useState(true);

  // 检测当前平台
  const currentPlatform: PlatformKey = ((): PlatformKey => {
    try {
      if (window.YUA?.isMac) return 'darwin';
      if (window.YUA?.isWindows) return 'win32';
      return 'linux';
    } catch {
      return 'darwin';
    }
  })();

  // 加载快捷键配置
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
      } catch (error) {
        console.warn('加载快捷键配置失败:', error);
      } finally {
        if (!cancelled) {
          setShortcutLoading(false);
        }
      }
    })();

    // 监听快捷键配置更新
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
    window.ipcRenderer?.on('shortcuts-config-updated', listener);

    return () => {
      cancelled = true;
      window.ipcRenderer?.off('shortcuts-config-updated', listener as any);
    };
  }, [currentPlatform]);

  // 格式化快捷键显示
  const formatShortcut = (shortcut: string): string => {
    return shortcut
      .replace(/CommandOrControl/g, currentPlatform === 'darwin' ? '⌘' : 'Ctrl')
      .replace(/Command/g, '⌘')
      .replace(/Control/g, 'Ctrl')
      .replace(/Shift/g, '⇧')
      .replace(/Alt/g, '⌥')
      .replace(/\+/g, ' + ');
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <TbCamera className="h-6 w-6" />
            </div>
            <div>
              <div className="text-base font-semibold text-foreground">屏幕截图</div>
              <div className="text-sm text-muted-foreground">使用快捷键进行屏幕截图，可在设置页面的「快捷键」选项中配置。</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className={`w-8 h-8 transition-transform ${expanded ? 'rotate-180' : ''}`} onClick={onExpand}>
              <TbChevronDown className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="screenshot-settings-panel"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="mt-4 pt-4 border-t border-border space-y-4">
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ScreenshotSettings;
