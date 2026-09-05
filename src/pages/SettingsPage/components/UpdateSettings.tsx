import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import { SettingGroup, SettingItem } from './SettingComponents';

/**
 * 更新:手动检查更新入口
 *
 * 生产环境下后台也会自动检查并下载更新,这里只提供手动触发;
 * 下载完成的更新在用户下次退出应用时自动安装。
 */
const UpdateSettings: React.FC = () => {
  const { t } = useTranslation('settings');
  const [isChecking, setIsChecking] = useState(false);

  const handleCheckUpdate = useCallback(async (): Promise<void> => {
    setIsChecking(true);
    try {
      const result = await window.chobits.system['app:update:check']();
      if (!result.ok) {
        toast.error(t('update.toast.failed.title'), { description: result.error });
        return;
      }
      switch (result.status) {
        case 'available':
          toast.success(t('update.toast.available.title', { version: result.version ?? '' }).trim(), { description: t('update.toast.available.description') });
          break;
        case 'downloaded':
          toast.success(t('update.toast.downloaded.title', { version: result.version ?? '' }).trim(), { description: t('update.toast.downloaded.description') });
          break;
        case 'not-available':
          toast.success(t('update.toast.latest'));
          break;
        case 'disabled':
          toast.info(t('update.toast.devUnsupported.title'), { description: t('update.toast.devUnsupported.description') });
          break;
        case 'error':
          toast.error(t('update.toast.failed.title'), { description: t('update.toast.failed.description') });
          break;
        default:
          toast.info(t('update.toast.checking'));
      }
    } catch (error) {
      toast.error(t('update.toast.failed.title'), { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsChecking(false);
    }
  }, [t]);

  return (
    <SettingGroup title={t('update.groupTitle')}>
      <SettingItem
        title={t('update.check.label')}
        description={t('update.check.description')}
        action={
          <Button size="sm" variant="outline" disabled={isChecking} onClick={() => void handleCheckUpdate()}>
            {isChecking ? t('update.check.checking') : t('update.check.button')}
          </Button>
        }
      />
    </SettingGroup>
  );
};

export default UpdateSettings;
