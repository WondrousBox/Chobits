import { ipcRenderer } from "electron";

import { IPCParams } from "../type";

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
  /** 打开设置窗口 */
  "openSettingsWindow": IPCParams<[void], boolean>;
  /** 打开资源管理窗口 */
  "openResourcesWindow": IPCParams<[void], boolean>;
  /** 打开回收站窗口 */
  "openRecycleWindow": IPCParams<[void], boolean>;
  /** 获取移动配置 */
  "getMovementConfig": IPCParams<[void], { width: number; height: number } & { walkSpeed: number; fpsLimit: number; movementMode: 'stepped' | 'smooth'; stepGrid: number; pathCurveFactor: number; assistantPadding: number }>;
  /** 更新移动配置 */
  "updateMovementConfig": IPCParams<[Partial<{ walkSpeed: number; fpsLimit: number; movementMode: 'stepped' | 'smooth'; stepGrid: number; pathCurveFactor: number; assistantPadding: number }>], { walkSpeed: number; fpsLimit: number; movementMode: 'stepped' | 'smooth'; stepGrid: number; pathCurveFactor: number; assistantPadding: number }>;

}

const methods: Array<keyof WindowBridgeParams> = [
  "moveWindow",
  "getWindowPosition",
  "getScreenSize",
  "setClickThrough",
  "openFileListWindow",
  "openMenuWindow",
  "openSettingsWindow",
  "openResourcesWindow",
  "openRecycleWindow",
  "getMovementConfig",
  "updateMovementConfig",
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
