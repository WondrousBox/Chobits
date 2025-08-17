import { ipcRenderer } from "electron";

import { IPCParams } from "../type";

type WindowBridgeParams = {
  /**
   * 移动窗口
   */
  "moveWindow": IPCParams<[number, number], boolean>;
  "getWindowPosition": IPCParams<[void], [number, number]>;
  "getScreenSize": IPCParams<[void], { width: number; height: number }>;
}

const methods: Array<keyof WindowBridgeParams> = [
  "moveWindow",
  "getWindowPosition",
  "getScreenSize",
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
