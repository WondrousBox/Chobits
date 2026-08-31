import type { ShortcutAction, ShortcutEnabledConfig, ShortcutsConfig } from '@packages/common/types/shortcuts';
import { ipcRenderer } from 'electron';

import type { IPCParams } from '../type';

export type { PlatformKey, ShortcutAction, ShortcutEnabledConfig, ShortcutsConfig } from '@packages/common/types/shortcuts';

export type ShortcutsBridgeParams = {
  'shortcuts:getConfig': IPCParams<[void], { ok: boolean; data?: ShortcutsConfig; error?: string }>;
  'shortcuts:getSchema': IPCParams<[void], { ok: boolean; data?: ShortcutAction[]; error?: string }>;
  'shortcuts:validate': IPCParams<[Partial<ShortcutsConfig>], { ok: boolean; data?: { ok: boolean; details: Record<string, { accel: string; ok: boolean; error?: string }[]> }; error?: string }>;
  'shortcuts:setConfig': IPCParams<[Partial<ShortcutsConfig>], { ok: boolean; data?: ShortcutsConfig; error?: string }>;
  'shortcuts:getEnabledConfig': IPCParams<[void], { ok: boolean; data?: ShortcutEnabledConfig; error?: string }>;
  'shortcuts:setEnabledConfig': IPCParams<[Partial<ShortcutEnabledConfig>], { ok: boolean; data?: ShortcutEnabledConfig; error?: string }>;
};

const methods: Array<keyof ShortcutsBridgeParams> = [
  'shortcuts:getConfig',
  'shortcuts:getSchema',
  'shortcuts:validate',
  'shortcuts:setConfig',
  'shortcuts:getEnabledConfig',
  'shortcuts:setEnabledConfig'
];

export type ShortcutsBridgeType = { [K in keyof ShortcutsBridgeParams]: (...args: ShortcutsBridgeParams[K]['request']) => Promise<ShortcutsBridgeParams[K]['response']> };

const bridge: Record<string, any> = {};
methods.forEach((m) => {
  bridge[m] = (...args: any[]) => ipcRenderer.invoke(m as string, ...args);
});

export const shortcutsBridge = bridge as ShortcutsBridgeType;
