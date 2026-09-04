import type { ThemeSource } from '@packages/common/types/theme';
import { ipcRenderer, type IpcRendererEvent } from 'electron';

export type { ThemeSource } from '@packages/common/types/theme';

export type ThemeBridgeResponse = {
  ok: boolean;
  themeSource?: ThemeSource;
  shouldUseDarkColors?: boolean;
  error?: string;
};

export type ThemeUpdatePayload = {
  themeSource: ThemeSource;
  shouldUseDarkColors: boolean;
};

export type ThemeBridgeType = {
  'theme:get': () => Promise<ThemeBridgeResponse>;
  'theme:set': (theme: ThemeSource) => Promise<ThemeBridgeResponse>;
  'theme:onChange': (callback: (payload: ThemeUpdatePayload) => void) => () => void;
};

const get = async (): Promise<ThemeBridgeResponse> => ipcRenderer.invoke('theme:get');
const set = async (theme: ThemeSource): Promise<ThemeBridgeResponse> => ipcRenderer.invoke('theme:set', theme);

const onChange = (callback: (payload: ThemeUpdatePayload) => void): (() => void) => {
  const listener = (_event: IpcRendererEvent, payload: ThemeUpdatePayload): void => callback(payload);
  ipcRenderer.on('theme:updated', listener);
  return () => ipcRenderer.off('theme:updated', listener);
};

export const themeBridge: ThemeBridgeType = {
  'theme:get': get,
  'theme:set': set,
  'theme:onChange': onChange
};
