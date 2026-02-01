import React, { createContext, useContext } from 'react';

import type { ResourceItem } from '../../types';
import type { MediaPlayerRef } from '../Players/MediaPlayer/MediaPlayer';

/**
 * 资源 Tab 上下文数据
 * 为所有 tab 组件提供统一的输入接口
 */
export interface ResourceTabContextValue {
  /** 当前预览的资源 */
  resource: ResourceItem;
  /** 当前播放时间（用于字幕同步） */
  currentTime: number;
  /** 媒体播放器引用（用于字幕跳转） */
  mediaPlayerRef: React.RefObject<MediaPlayerRef>;
  /** 字幕列表（用于视频资源） */
  subtitleList: ResourceItem[];
  /** 当前激活的字幕 */
  activeSubtitle: ResourceItem | null;
  /** 设置激活的字幕 */
  setActiveSubtitle: (subtitle: ResourceItem | null) => void;
  /** 资源切换回调 */
  onResourceChange?: (resource: ResourceItem) => void;
  /** 媒体播放器播放事件回调 */
  onMediaPlay?: () => void;
  /** 媒体播放器暂停事件回调 */
  onMediaPause?: () => void;
}

const ResourceTabContext = createContext<ResourceTabContextValue | null>(null);

/**
 * 将 Context 暴露到全局，供远程组件使用
 * 这个函数在应用启动时调用一次即可
 */
export const exposeResourceTabContext = (): void => {
  if (typeof window !== 'undefined') {
    (window as any).__RESOURCE_TAB_CONTEXT__ = ResourceTabContext;
  }
};

/**
 * ResourceTabContext Provider
 */
export const ResourceTabContextProvider: React.FC<{ value: ResourceTabContextValue; children: React.ReactNode }> = ({ value, children }) => {
  // 确保 Context 已暴露到全局（幂等操作）
  React.useEffect(() => {
    exposeResourceTabContext();
  }, []);

  return <ResourceTabContext.Provider value={value}>{children}</ResourceTabContext.Provider>;
};

/**
 * Hook to access ResourceTabContext
 */
export const useResourceTabContext = (): ResourceTabContextValue => {
  const context = useContext(ResourceTabContext);
  if (!context) {
    throw new Error('useResourceTabContext must be used within ResourceTabContextProvider');
  }
  return context;
};

/**
 * 将 Hook 注入到全局对象，供远程组件使用
 * 这个函数会在 ResourceTabContextProvider 挂载时调用
 */
export const injectResourceTabContextHook = (): void => {
  if (typeof window !== 'undefined') {
    (window as any).__RESOURCE_TAB_CONTEXT_HOOK__ = useResourceTabContext;
  }
};
