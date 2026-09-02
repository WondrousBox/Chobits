import { windowIpcRenderer, WindowIpcType } from '@aim-packages/window-manager/renderer';
import type { WindowAnimationPlaybackResult, WindowAnimationState, WindowAnimationStopOptions, WindowAnimationTimeline } from '@packages/common/types/window-animation';
import { ipcRenderer } from 'electron';

import { IpcParams } from '../type';

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
  /** 设置精灵窗口大小和 padding */
  'sprite:size:set': IpcParams<[{ width: number; height: number; padding: number }], { ok: boolean; error?: string }>;
  'sprite:interactive-regions:set': IpcParams<[{ regions: Array<{ x: number; y: number; width: number; height: number }> }], { ok: boolean; error?: string }>;
  'screen:work-area:get': IpcParams<[string?], { x: number; y: number; width: number; height: number }>;
  'window:bounds:set': IpcParams<
    [string, { x: number; y: number; width: number; height: number }],
    { ok: boolean; bounds?: { x: number; y: number; width: number; height: number }; error?: string }
  >;
  'window:animation:play': IpcParams<[string, WindowAnimationTimeline], WindowAnimationPlaybackResult>;
  'window:animation:stop': IpcParams<[string, WindowAnimationStopOptions?], WindowAnimationPlaybackResult>;
  'window:animation:state': IpcParams<[string?], WindowAnimationState>;
};

const methods: Array<keyof WindowBridgeParams> = [
  'sprite:size:set',
  'sprite:interactive-regions:set',
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
