import { windowIpcRenderer, WindowIpcType } from '@aim-packages/window-manager/renderer';
import { ipcRenderer } from 'electron';

import { IPCParams } from '../type';

type WindowBridgeParams = {
  /** 设置助手窗口大小和 padding */
  setAssistantSize: IPCParams<[{ width: number; height: number; padding: number }], { success: boolean; error?: string }>;
};

const methods: Array<keyof WindowBridgeParams> = ['setAssistantSize'];

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
