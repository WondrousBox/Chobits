import { windowIpcRenderer, WindowIPCType } from '@aim-packages/window-manager/renderer';
import { ipcRenderer } from 'electron';

import { IPCParams } from '../type';

type WindowBridgeParams = {
  /** 获取移动配置 */
  getMovementConfig: IPCParams<
    [void],
    { width: number; height: number } & { walkSpeed: number; fpsLimit: number; movementMode: 'stepped' | 'smooth'; stepGrid: number; pathCurveFactor: number; assistantPadding: number }
  >;
  /** 更新移动配置 */
  updateMovementConfig: IPCParams<
    [Partial<{ walkSpeed: number; fpsLimit: number; movementMode: 'stepped' | 'smooth'; stepGrid: number; pathCurveFactor: number; assistantPadding: number }>],
    { walkSpeed: number; fpsLimit: number; movementMode: 'stepped' | 'smooth'; stepGrid: number; pathCurveFactor: number; assistantPadding: number }
  >;
};

const methods: Array<keyof WindowBridgeParams> = ['getMovementConfig', 'updateMovementConfig'];

export type WindowBridgeType = {
  [K in keyof WindowBridgeParams]: (...args: WindowBridgeParams[K]['request']) => Promise<WindowBridgeParams[K]['response']>;
} & WindowIPCType;

const newBridge: Record<string, any> = {};

methods.forEach((method) => {
  newBridge[method] = (...args: WindowBridgeParams[typeof method]['request']) => ipcRenderer.invoke(method, ...args);
});

export const windowBridge = {
  ...newBridge,
  ...windowIpcRenderer
} as WindowBridgeType;
