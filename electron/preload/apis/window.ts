import { windowIpcRenderer, WindowIpcType } from '@aim-packages/window-manager/renderer';
import { ipcRenderer } from 'electron';

import { IPCParams } from '../type';

type WindowBridgeParams = {
  /** 设置助手窗口大小和 padding */
  setAssistantSize: IPCParams<[{ width: number; height: number; padding: number }], { success: boolean; error?: string }>;
  setAssistantInteractiveRegions: IPCParams<
    [{ regions: Array<{ x: number; y: number; width: number; height: number }> }],
    { success: boolean; error?: string }
  >;
  'screen:work-area:get': IPCParams<[string?], { x: number; y: number; width: number; height: number }>;
  'window:bounds:set': IPCParams<
    [string, { x: number; y: number; width: number; height: number }],
    { success: boolean; bounds?: { x: number; y: number; width: number; height: number }; error?: string }
  >;
  'window:animation:play': IPCParams<[string, WindowAnimationTimeline], WindowAnimationPlaybackResult>;
  'window:animation:stop': IPCParams<[string, WindowAnimationStopOptions?], WindowAnimationPlaybackResult>;
  'window:animation:state': IPCParams<[string?], WindowAnimationState>;
};

export type WindowAnimationEasing =
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'ease-in-quad'
  | 'ease-out-quad'
  | 'ease-in-out-quad'
  | 'ease-in-cubic'
  | 'ease-out-cubic'
  | 'ease-in-out-cubic';

export type WindowAnimationCurve = 'line' | 'quadratic' | 'cubic';

export type WindowAnimationAnchor = 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right';

export type WindowAnimationDisplay = 'primary' | 'current' | 'main';

export type WindowAnimationCoordinateSpaceType = 'absolute' | 'design-area';

export type WindowAnimationCoordinateFitMode = 'contain' | 'cover' | 'stretch';

export type WindowAnimationSizeMode = 'absolute' | 'scale-with-area';

export type WindowAnimationOrientation = 'landscape' | 'portrait';

export interface WindowAnimationDesignArea {
  width: number;
  height: number;
}

export interface WindowAnimationCoordinateSpace {
  type?: WindowAnimationCoordinateSpaceType;
  designArea?: WindowAnimationDesignArea;
  display?: WindowAnimationDisplay;
  useWorkArea?: boolean;
  fitMode?: WindowAnimationCoordinateFitMode;
  sizeMode?: WindowAnimationSizeMode;
}

export type WindowAnimationMargin =
  | number
  | {
      x?: number;
      y?: number;
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
    };

export interface WindowAnimationPoint {
  x: number;
  y: number;
}

export interface WindowAnimationBounds extends WindowAnimationPoint {
  width: number;
  height: number;
}

export interface WindowAnimationPlacement {
  anchor: WindowAnimationAnchor;
  display?: WindowAnimationDisplay;
  useWorkArea?: boolean;
  margin?: WindowAnimationMargin;
  offset?: Partial<WindowAnimationPoint>;
}

export interface WindowAnimationKeyframe extends Partial<WindowAnimationBounds> {
  placement?: WindowAnimationPlacement;
  duration?: number;
  easing?: WindowAnimationEasing;
  curve?: WindowAnimationCurve;
  control1?: WindowAnimationPoint;
  control2?: WindowAnimationPoint;
  opacity?: number;
}

export interface WindowAnimationTimelineVariant {
  keyframes?: WindowAnimationKeyframe[];
  coordinateSpace?: WindowAnimationCoordinateSpace;
  positionAnchor?: WindowAnimationAnchor;
}

export interface WindowAnimationTimeline {
  id?: string;
  keyframes: WindowAnimationKeyframe[];
  coordinateSpace?: WindowAnimationCoordinateSpace;
  positionAnchor?: WindowAnimationAnchor;
  variants?: Partial<Record<WindowAnimationOrientation, WindowAnimationTimelineVariant>>;
  createIfMissing?: boolean;
  showBeforePlay?: boolean;
  clampToWorkArea?: boolean;
  suspendFollowMainDuringPlay?: boolean;
  refreshFollowerAfterPlay?: boolean;
}

export interface WindowAnimationState {
  active: boolean;
  animationId?: string;
  windowKey?: string;
  progress: number;
  elapsedMs: number;
  durationMs: number;
  currentBounds?: WindowAnimationBounds;
  currentOpacity?: number;
}

export interface WindowAnimationPlaybackResult {
  ok: boolean;
  animationId?: string;
  state?: WindowAnimationState;
  error?: string;
}

export interface WindowAnimationStopOptions {
  complete?: boolean;
}

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
