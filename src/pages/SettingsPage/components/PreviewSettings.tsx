import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TbCheck, TbLayoutSidebarRight, TbLoader2, TbWindow } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { BroadcastChannelManager, CHANNEL_NAMES } from '@/utils/broadcastChannels';

import { SettingGroup, SettingItem } from './SettingComponents';

// 预览模式类型
type PreviewMode = 'window' | 'panel';

const PreviewSettings: React.FC = () => {
  const [mode, setMode] = useState<PreviewMode>('window');
  const [pending, setPending] = useState<PreviewMode | null>(null);
  const [loading, setLoading] = useState(true);

  // 预览模式选项
  const options = useMemo(
    () => [
      {
        value: 'window' as const,
        label: '独立窗口',
        icon: TbWindow
      },
      {
        value: 'panel' as const,
        label: '右侧面板',
        icon: TbLayoutSidebarRight
      }
    ],
    []
  );

  // 加载当前配置
  useEffect(() => {
    const loadConfig = async (): Promise<void> => {
      try {
        const result = await window.YUA.preferences['preferences:getPreviewMode']();
        if (result.ok && result.previewMode) {
          setMode(result.previewMode);
        }
      } catch (error) {
        console.warn('加载预览模式配置失败:', error);
      } finally {
        setLoading(false);
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
        const result = await window.YUA.preferences['preferences:setPreviewMode']({ mode: value });
        if (result.ok && result.config) {
          setMode(result.config.previewMode);
          // 使用 BroadcastChannel 通知其他窗口配置已更新
          BroadcastChannelManager.postMessage(CHANNEL_NAMES.PREFERENCES, {
            type: 'previewModeChanged',
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
    <SettingGroup title="预览">
      <SettingItem
        title="预览模式"
        description="选择资源预览的显示方式"
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={loading || pending !== null} className="min-w-[100px]">
                {loading || pending !== null ? (
                  <TbLoader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <CurrentIcon className="h-4 w-4 mr-1.5" />
                )}
                {loading ? '加载中...' : pending !== null ? '切换中...' : currentOption.label}
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
