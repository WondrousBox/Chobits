import { windowIpcRenderer, WindowIpcType } from '@aim-packages/window-manager/renderer';
import type { WindowAnimationPlaybackResult, WindowAnimationStopOptions, WindowAnimationTimeline } from '@packages/common/types/window-animation';
import { ipcRenderer, IpcRendererEvent } from 'electron';

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

type WindowBounds = { x: number; y: number; width: number; height: number };

/** 第三方 @aim-packages/window-manager 的 size 通道返回 { success } 包络，桥层统一翻译为 { ok } */
type ThirdPartyWindowSizeResult = { success: boolean; bounds?: WindowBounds; error?: string };
export type WindowSizeResult = { ok: boolean; bounds?: WindowBounds; error?: string };

export type WindowVisibilityPayload = { visible: boolean; key: string };

type WindowBridgeParams = {
  /** 设置精灵窗口大小和 padding */
  'sprite:size:set': IpcParams<[{ width: number; height: number; padding: number }], { ok: boolean; error?: string }>;
  'sprite:interactive-regions:set': IpcParams<[{ regions: Array<{ x: number; y: number; width: number; height: number }> }], { ok: boolean; error?: string }>;
  'screen:work-area:get': IpcParams<[string?], { x: number; y: number; width: number; height: number }>;
  'window:toggle': IpcParams<[string, any?], boolean>;
  'window:animation:play': IpcParams<[string, WindowAnimationTimeline], WindowAnimationPlaybackResult>;
  'window:animation:stop': IpcParams<[string, WindowAnimationStopOptions?], WindowAnimationPlaybackResult>;
};

const methods: Array<keyof WindowBridgeParams> = ['sprite:size:set', 'sprite:interactive-regions:set', 'screen:work-area:get', 'window:toggle', 'window:animation:play', 'window:animation:stop'];

/** 以下第三方通道不直接透传，改由下方包装方法以规范命名/包络暴露 */
type ThirdPartyWrappedChannels = 'window:size:set' | 'window:size:get' | 'window:click:through';

export type WindowBridgeType = {
  [K in keyof WindowBridgeParams]: (...args: WindowBridgeParams[K]['request']) => Promise<WindowBridgeParams[K]['response']>;
} & Omit<WindowIpcType, ThirdPartyWrappedChannels> & {
    /** 设置窗口大小（包装第三方 window:size:set，{ success } 翻译为 { ok }） */
    'window:size:set': (key: string, width: number, height: number, center?: boolean) => Promise<WindowSizeResult>;
    /** 获取窗口大小（包装第三方 window:size:get，{ success } 翻译为 { ok }） */
    'window:size:get': (key: string) => Promise<WindowSizeResult>;
    /** 设置窗口是否穿透点击（包装第三方 window:click:through，动词后置规范命名） */
    'window:click-through:set': (enabled: boolean) => Promise<boolean>;
    /** 清除窗口打开时缓存的 payload（第三方 window:payload:clear 未在其 renderer 类型中暴露） */
    'window:payload:clear': (key: string) => Promise<{ ok: boolean }>;
    /** 发送窗口命令（如 { type: 'quit-app' }），底层为第三方 window:command 的 send 通道 */
    'window:command:send': (command: { type: string; [key: string]: unknown }) => void;
    /** 订阅窗口最大化状态变化（包装第三方裸通道 window-maximize-changed） */
    onMaximizeChanged: (callback: (isMaximized: boolean) => void) => () => void;
    /** 订阅窗口打开就绪事件（包装第三方伪命名空间通道 on:window:open:ready），携带窗口 payload */
    onOpenReady: (callback: (payload: any) => void) => () => void;
    /** 订阅窗口可见性变化（包装第三方通道 window:visibility-changed） */
    onVisibilityChanged: (callback: (data: WindowVisibilityPayload) => void) => () => void;
  };

const newBridge: Record<string, any> = {};

methods.forEach((method) => {
  newBridge[method] = (...args: WindowBridgeParams[typeof method]['request']) => ipcRenderer.invoke(method, ...args);
});

const translateSizeResult = (result: ThirdPartyWindowSizeResult): WindowSizeResult => ({ ok: result.success, bounds: result.bounds, error: result.error });

const subscribeWindowEvent = <T>(channel: string, callback: (data: T) => void): (() => void) => {
  const listener = (_event: IpcRendererEvent, data: T): void => callback(data);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.off(channel, listener);
  };
};

const { 'window:size:set': thirdPartySizeSet, 'window:size:get': thirdPartySizeGet, 'window:click:through': thirdPartyClickThrough, ...thirdPartyPassthrough } = windowIpcRenderer;

export const windowBridge = {
  ...newBridge,
  ...thirdPartyPassthrough,
  'window:size:set': async (key: string, width: number, height: number, center?: boolean): Promise<WindowSizeResult> => translateSizeResult(await thirdPartySizeSet(key, width, height, center)),
  'window:size:get': async (key: string): Promise<WindowSizeResult> => translateSizeResult(await thirdPartySizeGet(key)),
  'window:click-through:set': (enabled: boolean): Promise<boolean> => thirdPartyClickThrough(enabled),
  'window:payload:clear': async (key: string): Promise<{ ok: boolean }> => ({ ok: !!(await ipcRenderer.invoke('window:payload:clear', key)) }),
  'window:command:send': (command: { type: string; [key: string]: unknown }): void => {
    ipcRenderer.send('window:command', command);
  },
  onMaximizeChanged: (callback: (isMaximized: boolean) => void): (() => void) => subscribeWindowEvent('window-maximize-changed', callback),
  onOpenReady: (callback: (payload: any) => void): (() => void) => subscribeWindowEvent('on:window:open:ready', callback),
  onVisibilityChanged: (callback: (data: WindowVisibilityPayload) => void): (() => void) => subscribeWindowEvent('window:visibility-changed', callback)
} as WindowBridgeType;
