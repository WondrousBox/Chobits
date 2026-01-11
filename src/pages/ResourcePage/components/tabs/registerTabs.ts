import React from 'react';

import ContentTab from './ContentTab';
import ListTab from './ListTab';
import SubtitleTab from './SubtitleTab';
import SummaryTab from './SummaryTab';
import { tabRegistry } from './TabRegistry';
import TranslateTab from './TranslateTab';
import type { TabComponent } from './types';

/**
 * 注册所有默认的 Tab 组件
 * 可以在应用启动时调用，也可以按需调用
 */
export function registerDefaultTabs(): void {
  const defaultTabs: TabComponent[] = [
    {
      id: 'content',
      name: '内容',
      component: ContentTab
    },
    {
      id: 'translate',
      name: '翻译',
      component: TranslateTab
    },
    {
      id: 'subtitle',
      name: '字幕',
      component: SubtitleTab
    },
    {
      id: 'summary',
      name: '总结',
      component: SummaryTab
    },
    {
      id: 'list',
      name: '列表',
      component: ListTab
    }
  ];

  defaultTabs.forEach((tab) => {
    tabRegistry.register(tab);
  });
}

/**
 * 注册动态 Tab 组件
 * @param id Tab ID
 * @param name Tab 名称
 * @param loader 动态加载函数
 */
export async function registerDynamicTab(id: string, name: string, loader: () => Promise<{ default: React.ComponentType }>): Promise<void> {
  const component = await loader();
  tabRegistry.register({
    id: id as any,
    name,
    component: component.default,
    isDynamic: true,
    loader
  });
}

/**
 * 从 URL 加载并注册 Tab 组件
 * @param id Tab ID
 * @param name Tab 名称
 * @param url 组件 URL
 */
export async function registerTabFromUrl(id: string, name: string, url: string): Promise<void> {
  // 动态导入远程组件
  const loader = async () => {
    // 这里可以使用动态 import 或其他加载方式
    // 例如：从 CDN 加载，或从本地文件系统加载
    const module = await import(/* @vite-ignore */ url);
    return module;
  };

  await registerDynamicTab(id, name, loader);
}
