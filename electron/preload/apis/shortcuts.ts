import type { ShortcutAction, ShortcutsConfig } from '@packages/common/types/shortcuts';
import { ipcRenderer, IpcRendererEvent } from 'electron';

import type { IpcParams } from '../type';

export type { PlatformKey, ShortcutAction, ShortcutEnabledConfig, ShortcutsConfig } from '@packages/common/types/shortcuts';

export type ShortcutsBridgeParams = {
  'shortcuts:get-config': IpcParams<[void], { ok: boolean; data?: ShortcutsConfig; error?: string }>;
  'shortcuts:get-schema': IpcParams<[void], { ok: boolean; data?: ShortcutAction[]; error?: string }>;
  'shortcuts:validate': IpcParams<[Partial<ShortcutsConfig>], { ok: boolean; data?: { ok: boolean; details: Record<string, { accelerator: string; ok: boolean; error?: string }[]> }; error?: string }>;
  'shortcuts:set-config': IpcParams<[Partial<ShortcutsConfig>], { ok: boolean; data?: ShortcutsConfig; error?: string }>;
};

const methods: Array<keyof ShortcutsBridgeParams> = ['shortcuts:get-config', 'shortcuts:get-schema', 'shortcuts:validate', 'shortcuts:set-config'];

export type ShortcutsBridgeType = { [K in keyof ShortcutsBridgeParams]: (...args: ShortcutsBridgeParams[K]['request']) => Promise<ShortcutsBridgeParams[K]['response']> } & {
  /** 订阅快捷键配置更新广播（shortcuts:config-updated） */
  onConfigUpdated: (callback: (config: ShortcutsConfig) => void) => () => void;
};

const bridge: Record<string, any> = {};
methods.forEach((m) => {
  bridge[m] = (...args: any[]) => ipcRenderer.invoke(m as string, ...args);
});

bridge.onConfigUpdated = (callback: (config: ShortcutsConfig) => void): (() => void) => {
  const listener = (_event: IpcRendererEvent, config: ShortcutsConfig): void => callback(config);
  ipcRenderer.on('shortcuts:config-updated', listener);
  return () => {
    ipcRenderer.off('shortcuts:config-updated', listener);
  };
};

export const shortcutsBridge = bridge as ShortcutsBridgeType;
