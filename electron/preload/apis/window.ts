import { ipcRenderer } from 'electron';

import { IPCParams } from '../type';
import { WindowKey } from 'electron/main/window/types';
import type { WindowConfig } from 'electron/main/window/types';

type WindowBridgeParams = {
  /**
   * 移动窗口
   */
  moveWindow: IPCParams<[number, number], boolean>;
  getWindowPosition: IPCParams<[void], [number, number]>;
  getScreenSize: IPCParams<[void], { width: number; height: number }>;
  /**
   * 设置窗口大小
   */
  setWindowSize: IPCParams<[string, number, number, boolean?], { success: boolean; bounds?: { x: number; y: number; width: number; height: number }; error?: string }>;
  /**
   * 获取窗口大小
   */
  getWindowSize: IPCParams<[string], { success: boolean; bounds?: { x: number; y: number; width: number; height: number }; error?: string }>;
  /**
   * 设置窗口是否穿透点击
   */
  setClickThrough: IPCParams<[boolean], boolean>;
  openWindow: IPCParams<[WindowKey, any?], boolean>;
  openWindowReady: IPCParams<[WindowKey], boolean>;
  getWindowPayload: IPCParams<[WindowKey], any>;
  closeWindow: IPCParams<[WindowKey], boolean>;
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
  /** 最小化当前窗口 */
  'window-minimize': IPCParams<[void], boolean>;
  /** 最大化或还原当前窗口 */
  'window-maximize-or-restore': IPCParams<[void], { maximized: boolean }>;
  /** 关闭当前窗口 */
  'window-close-self': IPCParams<[void], boolean>;
  /** 当前窗口是否已最大化 */
  'window-is-maximized': IPCParams<[void], boolean>;
  /** 当前窗口能力（是否允许最小化/最大化/缩放） */
  'window-capabilities': IPCParams<[void], { minimizable: boolean; maximizable: boolean; resizable: boolean }>;
  /** 保存窗口状态 */
  'window-save-state': IPCParams<[WindowKey], boolean>;
  /** 获取窗口状态 */
  'window-get-state': IPCParams<[WindowKey], any>;
  /** 清除窗口状态 */
  'window-clear-state': IPCParams<[WindowKey], boolean>;
  /** 注册/覆盖窗口配置 */
  'window-register-config': IPCParams<[WindowKey, WindowConfig, { persist?: boolean; openNow?: boolean; payload?: any }?], { ok: boolean; error?: string }>;
  /** 取消注册窗口配置 */
  'window-unregister-config': IPCParams<[WindowKey, { persist?: boolean; closeIfOpen?: boolean; removeState?: boolean }?], { ok: boolean; error?: string }>;
  /** 列出所有窗口 key */
  'window-list-configs': IPCParams<[void], string[]>;
  /** 获取窗口配置 */
  'window-get-config': IPCParams<[WindowKey], WindowConfig | undefined>;
};

const methods: Array<keyof WindowBridgeParams> = [
  'moveWindow',
  'getWindowPosition',
  'getScreenSize',
  'setWindowSize',
  'getWindowSize',
  'setClickThrough',
  'openWindow',
  'openWindowReady',
  'getWindowPayload',
  'closeWindow',
  'getMovementConfig',
  'updateMovementConfig',
  'window-minimize',
  'window-maximize-or-restore',
  'window-close-self',
  'window-is-maximized',
  'window-capabilities',
  'window-save-state',
  'window-get-state',
  'window-clear-state',
  'window-register-config',
  'window-unregister-config',
  'window-list-configs',
  'window-get-config'
];

export type WindowBridgeType = {
  [K in keyof WindowBridgeParams]: (...args: WindowBridgeParams[K]['request']) => Promise<WindowBridgeParams[K]['response']>;
};

const newBridge: Record<string, any> = {};

methods.forEach((method) => {
  newBridge[method] = (...args: WindowBridgeParams[typeof method]['request']) => ipcRenderer.invoke(method, ...args);
});

export const windowBridge = {
  ...newBridge
} as WindowBridgeType;
