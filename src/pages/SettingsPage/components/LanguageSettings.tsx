import type { LanguagePreference } from '@packages/common/types/preferences';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { applyLanguagePreference } from '@/i18n';

import { SettingGroup, SettingItem } from './SettingComponents';

const LANGUAGE_OPTIONS: LanguagePreference[] = ['system', 'zh-CN', 'ja', 'en'];

/**
 * 语言:界面语言选择
 *
 * 切换后立即应用并通过 preferences:set-config 持久化,无需重启应用。
 */
const LanguageSettings: React.FC = () => {
  const { t } = useTranslation('settings');
  const [language, setLanguage] = useState<LanguagePreference>('system');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let disposed = false;

    const load = async (): Promise<void> => {
      try {
        const result = await window.chobits.preferences['preferences:get-config']();
        if (!disposed && result.ok && result.config?.language) {
          setLanguage(result.config.language);
        }
      } catch (error) {
        console.warn('[LanguageSettings] 读取语言设置失败:', error);
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

  const handleChange = useCallback(
    async (next: LanguagePreference): Promise<void> => {
      const previous = language;
      setLanguage(next);
      applyLanguagePreference(next);
      try {
        const result = await window.chobits.preferences['preferences:set-config']({
          config: { language: next }
        });
        if (!result.ok) {
          throw new Error(result.error || t('language.updateFailed'));
        }
      } catch (error) {
        setLanguage(previous);
        applyLanguagePreference(previous);
        toast.error(t('language.updateFailed'), {
          description: error instanceof Error ? error.message : String(error)
        });
      }
    },
    [language, t]
  );

  return (
    <SettingGroup title={t('language.groupTitle')}>
      <SettingItem
        title={t('language.label')}
        description={t('language.description')}
        action={
          <Select value={language} disabled={isLoading} onValueChange={(value) => void handleChange(value as LanguagePreference)}>
            <SelectTrigger className="w-[140px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {t(`language.options.${option}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
    </SettingGroup>
  );
};

export default LanguageSettings;
