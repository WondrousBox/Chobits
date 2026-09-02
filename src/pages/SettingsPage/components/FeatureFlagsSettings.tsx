import React from 'react';

import { Switch } from '@/components/ui/switch';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';

import { SettingGroup, SettingItem } from './SettingComponents';

/**
 * 功能管理:全局功能旗标开关
 *
 * 不常用功能默认关闭,可在此重新开启。
 * 主进程的 IPC handler 与窗口在启动时注册,切换开关后需重启应用才能完全生效。
 */
export default function FeatureFlagsSettings(): JSX.Element {
  const { definitions, flags, isLoading, setFeatureFlag } = useFeatureFlags();

  return (
    <div className="p-4 space-y-4 max-w-2xl">
      <SettingGroup title="功能开关">
        {definitions.map((def) => (
          <SettingItem
            key={def.key}
            title={def.label}
            description={def.description}
            action={<Switch checked={flags[def.key]} disabled={isLoading} onCheckedChange={(checked) => void setFeatureFlag(def.key, checked)} />}
          />
        ))}
      </SettingGroup>
      <p className="text-xs text-muted-foreground px-2">关闭的功能会隐藏对应入口并停用相关后台服务;切换开关后需重启应用才能完全生效。</p>
    </div>
  );
}
