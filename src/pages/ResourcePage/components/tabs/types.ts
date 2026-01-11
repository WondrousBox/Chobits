import type React from 'react';

import type { TabType } from '../ResourceTabs';

/**
 * Tab 组件接口
 * 所有 tab 内容组件必须实现此接口
 */
export interface TabComponent {
  /** 组件 ID，必须与 TabType 匹配 */
  id: TabType;
  /** 组件名称 */
  name: string;
  /** React 组件 */
  component: React.ComponentType;
  /** 是否为动态加载的组件 */
  isDynamic?: boolean;
  /** 动态组件的加载函数（如果是动态组件） */
  loader?: () => Promise<{ default: React.ComponentType }>;
}

/**
 * Tab 组件注册器
 */
export interface TabRegistry {
  /** 注册 tab 组件 */
  register(tab: TabComponent): void;
  /** 获取 tab 组件 */
  get(id: TabType): TabComponent | undefined;
  /** 获取所有已注册的 tab 组件 */
  getAll(): TabComponent[];
  /** 检查 tab 组件是否存在 */
  has(id: TabType): boolean;
}
