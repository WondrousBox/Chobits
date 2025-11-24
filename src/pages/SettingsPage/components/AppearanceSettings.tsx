import React, { useMemo, useState } from 'react';
import { TbDeviceDesktop, TbLoader2, TbMoon, TbPalette, TbSunHigh } from 'react-icons/tb';

import { useThemePreference } from '@/components/providers/ThemeProvider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

type ThemeSource = 'system' | 'light' | 'dark';

const AppearanceSettings: React.FC = () => {
  const { mode, effectiveMode, setMode } = useThemePreference();
  const [pending, setPending] = useState<ThemeSource | null>(null);

  const options = useMemo(
    () => [
      {
        value: 'system' as const,
        label: '跟随系统',
        description: '根据系统的颜色方案在明亮与黑暗之间自动切换。',
        icon: TbDeviceDesktop
      },
      {
        value: 'light' as const,
        label: '明亮模式',
        description: '保持浅色界面，适合日间与亮色环境使用。',
        icon: TbSunHigh
      },
      {
        value: 'dark' as const,
        label: '黑暗模式',
        description: '降低亮度并突出内容，适合夜间或弱光环境。',
        icon: TbMoon
      }
    ],
    []
  );

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
    <div className="px-2">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <TbPalette className="h-6 w-6" />
            </div>
            <div>
              <div className="text-base font-semibold text-foreground">主题外观</div>
              <div className="text-sm text-muted-foreground">切换界面颜色模式，或根据系统自动调整。</div>
            </div>
          </div>
          <div className="rounded-full border border-border px-4 py-1 text-xs font-medium text-muted-foreground">当前效果：{effectiveMode === 'dark' ? '黑暗' : '明亮'}</div>
        </div>

        <RadioGroup value={pending ?? mode} onValueChange={(value) => handleChange(value as ThemeSource)} className="grid gap-3 md:grid-cols-3">
          {options.map((option) => {
            const Icon = option.icon;
            const isActive = (pending ?? mode) === option.value;
            return (
              <label
                key={option.value}
                htmlFor={`theme-${option.value}`}
                className={cn(
                  'relative flex cursor-pointer flex-col gap-3 rounded-2xl border p-4 transition-all',
                  isActive ? 'border-primary bg-primary/5 shadow-inner' : 'border-border hover:border-primary/50'
                )}
              >
                <div className="flex items-center gap-3">
                  <RadioGroupItem id={`theme-${option.value}`} value={option.value} className="mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Icon className="h-5 w-5" />
                      {option.label}
                    </div>
                    <p className="text-xs text-muted-foreground">{option.description}</p>
                  </div>
                </div>
                {pending === option.value && (
                  <div className="absolute right-4 top-4 text-primary">
                    <TbLoader2 className="h-4 w-4 animate-spin" />
                  </div>
                )}
              </label>
            );
          })}
        </RadioGroup>
      </div>
    </div>
  );
};

export default AppearanceSettings;
