import { windowIpcRenderer, WindowIpcType } from '@aim-packages/window-manager/renderer';
import { ipcRenderer } from 'electron';

import { IPCParams } from '../type';

type WindowBridgeParams = {
  /** 设置助手窗口大小和 padding */
  setAssistantSize: IPCParams<[{ width: number; height: number; padding: number }], { success: boolean; error?: string }>;
  'screen:work-area:get': IPCParams<[string?], { x: number; y: number; width: number; height: number }>;
  'window:bounds:set': IPCParams<
    [string, { x: number; y: number; width: number; height: number }],
    { success: boolean; bounds?: { x: number; y: number; width: number; height: number }; error?: string }
  >;
};

const methods: Array<keyof WindowBridgeParams> = ['setAssistantSize', 'screen:work-area:get', 'window:bounds:set'];

export type WindowBridgeType = {
  [K in keyof WindowBridgeParams]: (...args: WindowBridgeParams[K]['request']) => Promise<WindowBridgeParams[K]['response']>;
} & WindowIpcType;

const newBridge: Record<string, any> = {};

methods.forEach((method) => {
  newBridge[method] = (...args: WindowBridgeParams[typeof method]['request']) => ipcRenderer.invoke(method, ...args);
});

export const windowBridge = {
  ...newBridge,
  ...windowIpcRenderer
} as WindowBridgeType;
