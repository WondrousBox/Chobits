import { ipcRenderer } from "electron";

import { IPCParams } from "../type";

type FFmpegBridgeParams = {
  "playSprite": IPCParams<[void], boolean>;
}

const methods: Array<keyof FFmpegBridgeParams> = [
  "playSprite",
];

export type FFmpegBridgeType = {
  [K in keyof FFmpegBridgeParams]: (
    ...args: FFmpegBridgeParams[K]["request"]
  ) => Promise<FFmpegBridgeParams[K]["response"]>;
};

const newBridge: Record<string, any> = {};

methods.forEach(method => {
  newBridge[method] = (...args: FFmpegBridgeParams[typeof method]["request"]) => ipcRenderer.invoke(method, ...args);
});

export const ffmpegBridge = {
  ...newBridge,
} as FFmpegBridgeType;
