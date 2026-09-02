import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Switch } from '@/components/ui/switch';

import { SettingGroup, SettingItem } from './SettingComponents';

/**
 * 启动:开机自启动开关
 *
 * 切换后主进程立即调用 app.setLoginItemSettings,无需重启应用。
 */
const LaunchAtLoginSettings: React.FC = () => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let disposed = false;

    const load = async (): Promise<void> => {
      try {
        const result = await window.chobits.preferences['preferences:get-config']();
        if (!disposed && result.ok && result.config) {
          setIsEnabled(result.config.launchAtLoginEnabled);
        }
      } catch (error) {
        console.warn('[LaunchAtLogin] 读取开机自启动设置失败:', error);
      } finally {
        if (!disposed) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      disposed = true;
    };
  }, []);

  const handleToggle = useCallback(
    async (checked: boolean): Promise<void> => {
      const previous = isEnabled;
      setIsEnabled(checked);
      try {
        const result = await window.chobits.preferences['preferences:set-config']({
          config: { launchAtLoginEnabled: checked }
        });
        if (!result.ok) {
          throw new Error(result.error || '更新开机自启动失败');
        }
      } catch (error) {
        setIsEnabled(previous);
        toast.error('更新开机自启动失败', {
          description: error instanceof Error ? error.message : String(error)
        });
      }
    },
    [isEnabled]
  );

  return (
    <SettingGroup title="启动">
      <SettingItem title="开机自启动" description="登录系统后自动启动 Chobits" action={<Switch checked={isEnabled} disabled={isLoading} onCheckedChange={(checked) => void handleToggle(checked)} />} />
    </SettingGroup>
  );
};

export default LaunchAtLoginSettings;
