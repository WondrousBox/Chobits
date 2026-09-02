import type { ShortcutAction, ShortcutEnabledConfig, ShortcutsConfig } from '@packages/common/types/shortcuts';
import { ipcRenderer } from 'electron';

import type { IpcParams } from '../type';

export type { PlatformKey, ShortcutAction, ShortcutEnabledConfig, ShortcutsConfig } from '@packages/common/types/shortcuts';

export type ShortcutsBridgeParams = {
  'shortcuts:get-config': IpcParams<[void], { ok: boolean; data?: ShortcutsConfig; error?: string }>;
  'shortcuts:get-schema': IpcParams<[void], { ok: boolean; data?: ShortcutAction[]; error?: string }>;
  'shortcuts:validate': IpcParams<[Partial<ShortcutsConfig>], { ok: boolean; data?: { ok: boolean; details: Record<string, { accelerator: string; ok: boolean; error?: string }[]> }; error?: string }>;
  'shortcuts:set-config': IpcParams<[Partial<ShortcutsConfig>], { ok: boolean; data?: ShortcutsConfig; error?: string }>;
  'shortcuts:get-enabled-config': IpcParams<[void], { ok: boolean; data?: ShortcutEnabledConfig; error?: string }>;
  'shortcuts:set-enabled-config': IpcParams<[Partial<ShortcutEnabledConfig>], { ok: boolean; data?: ShortcutEnabledConfig; error?: string }>;
};

const methods: Array<keyof ShortcutsBridgeParams> = [
  'shortcuts:get-config',
  'shortcuts:get-schema',
  'shortcuts:validate',
  'shortcuts:set-config',
  'shortcuts:get-enabled-config',
  'shortcuts:set-enabled-config'
];

export type ShortcutsBridgeType = { [K in keyof ShortcutsBridgeParams]: (...args: ShortcutsBridgeParams[K]['request']) => Promise<ShortcutsBridgeParams[K]['response']> };

const bridge: Record<string, any> = {};
methods.forEach((m) => {
  bridge[m] = (...args: any[]) => ipcRenderer.invoke(m as string, ...args);
});

export const shortcutsBridge = bridge as ShortcutsBridgeType;
