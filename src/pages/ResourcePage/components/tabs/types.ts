import type React from 'react';

import type { TabType } from '../ResourceTabs';

/**
 * Tab 图标类型
 * - React 组件：如 TbFileText
 * - SVG 字符串：如 '<svg>...</svg>'
 * - URL 字符串：如 'https://example.com/icon.png' 或 '/path/to/icon.png'
 */
export type TabIcon = React.ComponentType<{ className?: string }> | string;

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
  /** Tab 图标（可选） */
  icon?: TabIcon;
  /** 是否为动态加载的组件 */
  isDynamic?: boolean;
  /** 动态组件的加载函数（如果是动态组件） */
  loader?: () => Promise<{ default: React.ComponentType }>;
}

/**
 * Tab 注册变化事件类型
 */
export type TabRegistryEventType = 'register' | 'unregister' | 'enable' | 'disable';

/**
 * Tab 注册变化事件
 */
export interface TabRegistryEvent {
  type: TabRegistryEventType;
  tabId: TabType | string;
  tab?: TabComponent;
}

/**
 * Tab 注册变化事件监听器
 */
export type TabRegistryEventListener = (event: TabRegistryEvent) => void;

/**
 * Tab 组件注册器
 */
export interface TabRegistry {
  /** 注册 tab 组件 */
  register(tab: TabComponent): void;
  /** 注销 tab 组件 */
  unregister(id: TabType | string): void;
  /** 获取 tab 组件 */
  get(id: TabType | string): TabComponent | undefined;
  /** 获取所有已注册的 tab 组件 */
  getAll(): TabComponent[];
  /** 检查 tab 组件是否存在 */
  has(id: TabType | string): boolean;
  /** 启用 tab（默认所有 tab 都是启用的） */
  enable(id: TabType | string): void;
  /** 禁用 tab */
  disable(id: TabType | string): void;
  /** 检查 tab 是否启用 */
  isEnabled(id: TabType | string): boolean;
  /** 获取所有启用的 tab 组件 */
  getEnabled(): TabComponent[];
  /** 设置 tab 顺序 */
  setOrder(orderedIds: string[]): void;
  /** 获取当前 tab 顺序 */
  getOrder(): string[];
  /** 添加事件监听器 */
  addEventListener(listener: TabRegistryEventListener): () => void;
  /** 移除事件监听器 */
  removeEventListener(listener: TabRegistryEventListener): void;
}
