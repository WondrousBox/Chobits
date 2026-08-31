import { windowIpcRenderer, WindowIpcType } from '@aim-packages/window-manager/renderer';
import type { WindowAnimationPlaybackResult, WindowAnimationState, WindowAnimationStopOptions, WindowAnimationTimeline } from '@packages/common/types/window-animation';
import { ipcRenderer } from 'electron';

import { IPCParams } from '../type';

export type {
  WindowAnimationAnchor,
  WindowAnimationBounds,
  WindowAnimationCoordinateFitMode,
  WindowAnimationCoordinateSpace,
  WindowAnimationCoordinateSpaceType,
  WindowAnimationCurve,
  WindowAnimationDesignArea,
  WindowAnimationDisplay,
  WindowAnimationEasing,
  WindowAnimationKeyframe,
  WindowAnimationMargin,
  WindowAnimationOrientation,
  WindowAnimationPlacement,
  WindowAnimationPlaybackResult,
  WindowAnimationPoint,
  WindowAnimationSizeMode,
  WindowAnimationState,
  WindowAnimationStopOptions,
  WindowAnimationTimeline,
  WindowAnimationTimelineVariant
} from '@packages/common/types/window-animation';

type WindowBridgeParams = {
  /** 设置助手窗口大小和 padding */
  setAssistantSize: IPCParams<[{ width: number; height: number; padding: number }], { success: boolean; error?: string }>;
  setAssistantInteractiveRegions: IPCParams<[{ regions: Array<{ x: number; y: number; width: number; height: number }> }], { success: boolean; error?: string }>;
  'screen:work-area:get': IPCParams<[string?], { x: number; y: number; width: number; height: number }>;
  'window:bounds:set': IPCParams<
    [string, { x: number; y: number; width: number; height: number }],
    { success: boolean; bounds?: { x: number; y: number; width: number; height: number }; error?: string }
  >;
  'window:animation:play': IPCParams<[string, WindowAnimationTimeline], WindowAnimationPlaybackResult>;
  'window:animation:stop': IPCParams<[string, WindowAnimationStopOptions?], WindowAnimationPlaybackResult>;
  'window:animation:state': IPCParams<[string?], WindowAnimationState>;
};

const methods: Array<keyof WindowBridgeParams> = [
  'setAssistantSize',
  'setAssistantInteractiveRegions',
  'screen:work-area:get',
  'window:bounds:set',
  'window:animation:play',
  'window:animation:stop',
  'window:animation:state'
];

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
