import React, { useCallback, useState } from 'react';
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
  const [isChecking, setIsChecking] = useState(false);

  const handleCheckUpdate = useCallback(async (): Promise<void> => {
    setIsChecking(true);
    try {
      const result = await window.chobits.system['app:update:check']();
      if (!result.ok) {
        toast.error('检查更新失败', { description: result.error });
        return;
      }
      switch (result.status) {
        case 'available':
          toast.success(`发现新版本 ${result.version ?? ''}`.trim(), { description: '正在后台下载，下载完成后重启应用即可安装' });
          break;
        case 'downloaded':
          toast.success(`新版本 ${result.version ?? ''} 已下载完成`.trim(), { description: '重启应用后自动安装' });
          break;
        case 'not-available':
          toast.success('当前已是最新版本');
          break;
        case 'disabled':
          toast.info('开发版本不支持自动更新', { description: '仅生产构建可检查更新' });
          break;
        case 'error':
          toast.error('检查更新失败', { description: '请稍后重试，或查看日志了解详情' });
          break;
        default:
          toast.info('正在检查更新，请稍后再试');
      }
    } catch (error) {
      toast.error('检查更新失败', { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsChecking(false);
    }
  }, []);

  return (
    <SettingGroup title="更新">
      <SettingItem
        title="检查更新"
        description="新版本会在后台自动下载，重启应用后完成安装"
        action={
          <Button size="sm" variant="outline" disabled={isChecking} onClick={() => void handleCheckUpdate()}>
            {isChecking ? '检查中…' : '检查更新'}
          </Button>
        }
      />
    </SettingGroup>
  );
};

export default UpdateSettings;
