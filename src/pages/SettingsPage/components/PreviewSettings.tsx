import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TbCheck, TbLayoutSidebarRight, TbLoader2, TbWindow } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { BroadcastChannelManager, CHANNEL_NAMES } from '@/utils/broadcastChannels';

import { SettingGroup, SettingItem } from './SettingComponents';

// 预览模式类型
type PreviewMode = 'window' | 'panel';

const PreviewSettings: React.FC = () => {
  const { t } = useTranslation('settings');
  const [mode, setMode] = useState<PreviewMode>('window');
  const [pending, setPending] = useState<PreviewMode | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 预览模式选项
  const options = useMemo(
    () => [
      {
        value: 'window' as const,
        label: t('preview.options.window'),
        icon: TbWindow
      },
      {
        value: 'panel' as const,
        label: t('preview.options.panel'),
        icon: TbLayoutSidebarRight
      }
    ],
    [t]
  );

  // 加载当前配置
  useEffect(() => {
    const loadConfig = async (): Promise<void> => {
      try {
        const result = await window.chobits.preferences['preferences:get-preview-mode']();
        if (result.ok && result.previewMode) {
          setMode(result.previewMode);
        }
      } catch (error) {
        console.warn('加载预览模式配置失败:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadConfig();
  }, []);

  // 处理模式切换
  const handleChange = useCallback(
    async (value: PreviewMode): Promise<void> => {
      if (pending || value === mode) return;
      setPending(value);
      try {
        const result = await window.chobits.preferences['preferences:set-preview-mode']({ mode: value });
        if (result.ok && result.config) {
          setMode(result.config.previewMode);
          // 使用 BroadcastChannel 通知其他窗口配置已更新
          BroadcastChannelManager.postMessage(CHANNEL_NAMES.PREFERENCES, {
            type: 'preview-mode-changed',
            previewMode: result.config.previewMode
          });
        }
      } catch (error) {
        console.error('设置预览模式失败:', error);
      } finally {
        setPending(null);
      }
    },
    [mode, pending]
  );

  const currentOption = options.find((o) => o.value === mode) || options[0];
  const CurrentIcon = currentOption.icon;

  return (
    <SettingGroup title={t('preview.groupTitle')}>
      <SettingItem
        title={t('preview.mode.label')}
        description={t('preview.mode.description')}
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={isLoading || pending !== null} className="min-w-[100px]">
                {isLoading || pending !== null ? <TbLoader2 className="animate-spin" /> : <CurrentIcon />}
                {isLoading ? t('common.loading') : pending !== null ? t('preview.switching') : currentOption.label}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {options.map((option) => {
                const Icon = option.icon;
                const isActive = mode === option.value;
                return (
                  <DropdownMenuItem key={option.value} onClick={() => handleChange(option.value)} className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <span className="flex-1">{option.label}</span>
                    {isActive && <TbCheck className="h-4 w-4 text-primary" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
    </SettingGroup>
  );
};

export default PreviewSettings;
