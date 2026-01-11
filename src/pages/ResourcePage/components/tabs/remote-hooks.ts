/**
 * 远程组件开发工具包
 *
 * 远程组件可以直接导入这个文件来使用 Context Hook
 * 这个文件会在运行时自动从主应用获取 Context 实例
 *
 * 使用方式：
 * ```typescript
 * import { useResourceTabContext } from 'path/to/remote-hooks';
 *
 * const MyTab: React.FC = () => {
 *   const { resource, currentTime } = useResourceTabContext();
 *   return <div>{resource.title}</div>;
 * };
 * ```
 */

import React, { useContext } from 'react';

// 类型定义（与主应用保持一致）
export interface ResourceItem {
  id: string;
  title?: string;
  filePath?: string;
  url?: string;
  type?: string;
}

export interface MediaPlayerRef {
  seekTo: (time: number) => void;
  pause: () => void;
  getCurrentTime: () => number;
}

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
}

/**
 * 获取全局 Context
 * 主应用会将 Context 暴露到 window.__RESOURCE_TAB_CONTEXT__
 */
function getResourceTabContext(): React.Context<ResourceTabContextValue | null> | null {
  if (typeof window !== 'undefined' && (window as any).__RESOURCE_TAB_CONTEXT__) {
    return (window as any).__RESOURCE_TAB_CONTEXT__;
  }
  return null;
}

/**
 * 使用资源 Tab Context 的 Hook
 *
 * 远程组件可以直接导入并使用这个 Hook，就像使用普通的 React Hook 一样：
 *
 * ```typescript
 * import { useResourceTabContext } from 'path/to/remote-hooks';
 *
 * const MyTab: React.FC = () => {
 *   const { resource, currentTime, subtitleList } = useResourceTabContext();
 *
 *   return (
 *     <div>
 *       <h2>{resource.title}</h2>
 *       <p>播放时间: {currentTime}s</p>
 *     </div>
 *   );
 * };
 * ```
 *
 * @throws 如果 Hook 未在 ResourceTabContextProvider 内部使用，会抛出错误
 */
export function useResourceTabContext(): ResourceTabContextValue {
  const Context = getResourceTabContext();

  if (!Context) {
    throw new Error(
      'ResourceTabContext is not available. ' + 'Make sure the remote component is loaded within ResourceTabContextProvider. ' + 'The Context should be automatically exposed by the host application.'
    );
  }

  const context = useContext(Context);

  if (!context) {
    throw new Error('useResourceTabContext must be used within ResourceTabContextProvider');
  }

  return context;
}
