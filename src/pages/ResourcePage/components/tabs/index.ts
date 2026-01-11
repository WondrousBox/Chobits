/**
 * Tab 组件导出
 */
export { default as ContentTab } from './ContentTab';
export { default as ListTab } from './ListTab';
export { registerDefaultTabs, registerDynamicTab, registerTabFromUrl } from './registerTabs';
export type { ResourceTabContextValue } from './ResourceTabContext';
export { ResourceTabContextProvider, useResourceTabContext } from './ResourceTabContext';
export { default as SubtitleTab } from './SubtitleTab';
export { default as SummaryTab } from './SummaryTab';
export { tabRegistry } from './TabRegistry';
export { default as TranslateTab } from './TranslateTab';
export type { TabComponent, TabRegistry } from './types';
