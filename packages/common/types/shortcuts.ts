export type PlatformKey = 'darwin' | 'win32' | 'linux';
export type SingleAccel = string | Partial<Record<PlatformKey, string>>;
export type MultiAccel = string[] | Partial<Record<PlatformKey, string[]>>;
export type ShortcutValue = SingleAccel | MultiAccel;

// 取值历史上两侧定义有细微差异，这里取并集：允许按平台混合 string | string[]
export type ShortcutsConfig = Record<string, string | string[] | Partial<Record<PlatformKey, string | string[]>>>;

// 快捷键功能的启用状态配置（key 为 ShortcutAction.id，仅显式配置的项会被检查）
export type ShortcutEnabledConfig = Record<string, boolean>;

export type ShortcutAction = {
  id: string;
  label: string;
  description?: string;
  type: 'single' | 'multi';
  defaults: Partial<Record<PlatformKey, string | string[]>>;
};
