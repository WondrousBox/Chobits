import React, { useMemo, useState } from 'react';
import { TbCheck, TbDeviceDesktop, TbLoader2, TbMoon, TbSunHigh } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

import { useThemePreference } from '../providers/ThemeProvider';
import { SettingGroup, SettingItem } from './SettingComponents';

type ThemeSource = 'system' | 'light' | 'dark';

const AppearanceSettings: React.FC = () => {
  const { mode, setMode } = useThemePreference();
  const [pending, setPending] = useState<ThemeSource | null>(null);

  const options = useMemo(
    () => [
      {
        value: 'system' as const,
        label: '跟随系统',
        icon: TbDeviceDesktop
      },
      {
        value: 'light' as const,
        label: '明亮模式',
        icon: TbSunHigh
      },
      {
        value: 'dark' as const,
        label: '黑暗模式',
        icon: TbMoon
      }
    ],
    []
  );

  const currentOption = options.find((o) => o.value === mode) || options[0];
  const CurrentIcon = currentOption.icon;

  const handleChange = async (value: ThemeSource): Promise<void> => {
    if (pending || value === mode) return;
    setPending(value);
    try {
      await setMode(value);
    } finally {
      setPending(null);
    }
  };

  return (
    <SettingGroup title="外观">
      <SettingItem
        title="主题外观"
        description="切换界面颜色模式，或根据系统自动调整"
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={pending !== null} className="min-w-[100px]">
                {pending !== null ? (
                  <TbLoader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <CurrentIcon className="h-4 w-4 mr-1.5" />
                )}
                {pending !== null ? '切换中...' : currentOption.label}
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

export default AppearanceSettings;
