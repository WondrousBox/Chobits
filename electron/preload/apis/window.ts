import { ipcRenderer } from "electron";

import { IPCParams } from "../type";
import { WindowKey } from "electron/main/window-config";

type WindowBridgeParams = {
  /**
   * 移动窗口
   */
  "moveWindow": IPCParams<[number, number], boolean>;
  "getWindowPosition": IPCParams<[void], [number, number]>;
  "getScreenSize": IPCParams<[void], { width: number; height: number }>;
  /**
   * 设置窗口是否穿透点击
   */
  "setClickThrough": IPCParams<[boolean], boolean>;
  /**
   * 打开或更新文件跟随窗口
   */
  "openFileListWindow": IPCParams<[Array<{ name: string; path: string; isDirectory: boolean }>], boolean>;
  /** 打开上下文菜单窗口 */
  "openMenuWindow": IPCParams<[void], boolean>;
  "openWindow": IPCParams<[WindowKey, any?], boolean>;
  "openWindowReady": IPCParams<[WindowKey], boolean>;
  "getWindowPayload": IPCParams<[WindowKey], any>;
  "closeWindow": IPCParams<[WindowKey], boolean>;
  /** 获取移动配置 */
  "getMovementConfig": IPCParams<[void], { width: number; height: number } & { walkSpeed: number; fpsLimit: number; movementMode: 'stepped' | 'smooth'; stepGrid: number; pathCurveFactor: number; assistantPadding: number }>;
  /** 更新移动配置 */
  "updateMovementConfig": IPCParams<[Partial<{ walkSpeed: number; fpsLimit: number; movementMode: 'stepped' | 'smooth'; stepGrid: number; pathCurveFactor: number; assistantPadding: number }>], { walkSpeed: number; fpsLimit: number; movementMode: 'stepped' | 'smooth'; stepGrid: number; pathCurveFactor: number; assistantPadding: number }>;
  /** 建议默认工作空间路径 */
  "suggestWorkspacePath": IPCParams<[void], { ok: boolean; path?: string }>;
  /** 最小化当前窗口 */
  "window-minimize": IPCParams<[void], boolean>;
  /** 最大化或还原当前窗口 */
  "window-maximize-or-restore": IPCParams<[void], { maximized: boolean }>;
  /** 关闭当前窗口 */
  "window-close-self": IPCParams<[void], boolean>;
  /** 当前窗口是否已最大化 */
  "window-is-maximized": IPCParams<[void], boolean>;
  /** 当前窗口能力（是否允许最小化/最大化/缩放） */
  "window-capabilities": IPCParams<[void], { minimizable: boolean; maximizable: boolean; resizable: boolean }>;

}

const methods: Array<keyof WindowBridgeParams> = [
  "moveWindow",
  "getWindowPosition",
  "getScreenSize",
  "setClickThrough",
  "openFileListWindow",
  "openMenuWindow",
  "openWindow",
  "openWindowReady",
  "getWindowPayload",
  "closeWindow",
  "getMovementConfig",
  "updateMovementConfig",
  "suggestWorkspacePath",
  "window-minimize",
  "window-maximize-or-restore",
  "window-close-self",
  "window-is-maximized",
  "window-capabilities",
];

export type WindowBridgeType = {
  [K in keyof WindowBridgeParams]: (
    ...args: WindowBridgeParams[K]["request"]
  ) => Promise<WindowBridgeParams[K]["response"]>;
};

const newBridge: Record<string, any> = {};

methods.forEach(method => {
  newBridge[method] = (...args: WindowBridgeParams[typeof method]["request"]) => ipcRenderer.invoke(method, ...args);
});

export const windowBridge = {
  ...newBridge,
} as WindowBridgeType;
