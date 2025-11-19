import { ipcRenderer } from 'electron';

import { IPCParams } from './type';
import type { WindowConfig } from './types';
import { WindowKey } from './types';
import { WindowState } from './window-state-store';

type WindowIPCParams = {
  /**
   * 移动窗口
   */
  'window:move': IPCParams<[{ x: number; y: number }, WindowKey?], boolean>;
  'window:position:get': IPCParams<[WindowKey?], [number, number]>;
  'screen:size:get': IPCParams<[void], { width: number; height: number }>;
  /**
   * 设置窗口大小
   */
  'window:size:set': IPCParams<[string, number, number, boolean?], { success: boolean; bounds?: { x: number; y: number; width: number; height: number }; error?: string }>;
  /**
   * 获取窗口大小
   */
  'window:size:get': IPCParams<[string], { success: boolean; bounds?: { x: number; y: number; width: number; height: number }; error?: string }>;
  /**
   * 设置窗口是否穿透点击
   */
  'window:click:through': IPCParams<[boolean], boolean>;
  'window:open': IPCParams<[WindowKey, any?, { sameDisplayAsSender?: boolean }?], boolean>;
  'window:open:ready': IPCParams<[WindowKey], boolean>;
  'window:payload:get': IPCParams<[WindowKey], any>;
  'window:close': IPCParams<[WindowKey], boolean>;
  /** 窗口抖动 */
  'window:shake': IPCParams<[WindowKey], boolean>;
  /** 发送消息给其他窗口 */
  'window:send': IPCParams<[WindowKey, string, any], boolean>;
  /** 最小化当前窗口 */
  'window:minimize': IPCParams<[void], boolean>;
  /** 最大化或还原当前窗口 */
  'window:maximize': IPCParams<[void], { maximized: boolean }>;
  /** 关闭当前窗口 */
  'window:close:self': IPCParams<[void], boolean>;
  /** 当前窗口是否已最大化 */
  'window:maximized:get': IPCParams<[void], boolean>;
  /** 当前窗口能力（是否允许最小化/最大化/缩放） */
  'window:capabilities:get': IPCParams<[void], { minimizable: boolean; maximizable: boolean; resizable: boolean }>;
  /** 保存窗口状态 */
  'window:state:save': IPCParams<[WindowKey], boolean>;
  /** 获取窗口状态 */
  'window:state:get': IPCParams<[WindowKey], WindowState | undefined>;
  /** 清除窗口状态 */
  'window:state:clear': IPCParams<[WindowKey], boolean>;
  /** 注册/覆盖窗口配置 */
  'window:config:register': IPCParams<[WindowKey, WindowConfig, { persist?: boolean; openNow?: boolean; payload?: any }?], { ok: boolean; error?: string }>;
  /** 取消注册窗口配置 */
  'window:config:unregister': IPCParams<[WindowKey, { persist?: boolean; closeIfOpen?: boolean; removeState?: boolean }?], { ok: boolean; error?: string }>;
  /** 列出所有窗口 key */
  'window:config:list': IPCParams<[void], string[]>;
  /** 获取窗口配置 */
  'window:config:get': IPCParams<[WindowKey], WindowConfig | undefined>;
};

const methods: Array<keyof WindowIPCParams> = [
  'window:move',
  'window:position:get',
  'screen:size:get',
  'window:size:set',
  'window:size:get',
  'window:click:through',
  'window:open',
  'window:open:ready',
  'window:payload:get',
  'window:close',
  'window:shake',
  'window:send',
  'window:minimize',
  'window:maximize',
  'window:close:self',
  'window:maximized:get',
  'window:capabilities:get',
  'window:state:save',
  'window:state:get',
  'window:state:clear',
  'window:config:register',
  'window:config:unregister',
  'window:config:list',
  'window:config:get'
];

export type WindowIPCType = {
  [K in keyof WindowIPCParams]: (...args: WindowIPCParams[K]['request']) => Promise<WindowIPCParams[K]['response']>;
};

const newIPC: Record<string, any> = {};

methods.forEach((method) => {
  newIPC[method] = (...args: WindowIPCParams[typeof method]['request']) => ipcRenderer.invoke(method, ...args);
});

export const windowIPC = {
  ...newIPC
} as WindowIPCType;

export function onWindowMessage(channel: string, callback: (payload: any) => void): () => void {
  const handler = (_: any, payload: any) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}
