import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation('settings');
  const { definitions, flags, isLoading, setFeatureFlag } = useFeatureFlags();

  return (
    <div className="p-4 space-y-4 max-w-2xl">
      <SettingGroup title={t('features.groupTitle')}>
        {definitions.map((def) => (
          <SettingItem
            key={def.key}
            title={t(def.labelKey)}
            description={t(def.descriptionKey)}
            action={<Switch checked={flags[def.key]} disabled={isLoading} onCheckedChange={(checked) => void setFeatureFlag(def.key, checked)} />}
          />
        ))}
      </SettingGroup>
      <p className="text-xs text-muted-foreground px-2">{t('features.restartHint')}</p>
    </div>
  );
}
