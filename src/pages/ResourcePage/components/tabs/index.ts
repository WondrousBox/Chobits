/**
 * Tab 组件导出
 */
export { default as ContentTab } from './ContentTab';
export { default as ListTab } from './ListTab';
export { default as NotesTab } from './NotesTab';
export { registerDefaultTabs, registerDynamicTab, registerTabFromUrl } from './registerTabs';
export type { ResourceTabContextValue } from './ResourceTabContext';
export { ResourceTabContextProvider, useResourceTabContext } from './ResourceTabContext';
export { default as SubtitleTab } from './SubtitleTab';
export { default as SummaryTab } from './SummaryTab';
export type { PanelTabChangeEvent, PanelTabChangeListener } from './TabPanelManager';
export { tabPanelManager } from './TabPanelManager';
export { tabRegistry } from './TabRegistry';
export { default as TranslateTab } from './TranslateTab';
export type { TabComponent, TabIcon as TabIconType, TabRegistry } from './types';

// 远程组件工具包类型导出（供远程组件使用）
// 注意：远程组件应该直接从 './remote-hooks' 文件导入 useResourceTabContext Hook
// 这里只导出类型定义，避免与本地 Hook 冲突
export type { MediaPlayerRef, ResourceItem } from './remote-hooks';

// Tab 设置组件
export { SortableTabTrigger, TabPreview } from './SortableTabTrigger';
export { TabIcon } from './TabIcon';
export { TabSettings } from './TabSettings';
