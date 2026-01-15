import React from 'react';
import { TbArticle, TbBrain, TbFileExport, TbLanguage, TbList, TbMessage, TbSparkles, TbSubtask } from 'react-icons/tb';

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
  // 本地内置组件
  const defaultTabs: TabComponent[] = [
    {
      id: 'content',
      name: '内容',
      description: '查看和编辑资源的原始内容',
      icon: TbArticle,
      component: ContentTab
    },
    {
      id: 'translate',
      name: '翻译',
      description: '将内容翻译为其他语言',
      icon: TbLanguage,
      component: TranslateTab
    },
    {
      id: 'subtitle',
      name: '字幕',
      description: '管理视频字幕和时间轴',
      icon: TbMessage,
      component: SubtitleTab
    },
    {
      id: 'summary',
      name: '总结',
      description: '自动生成内容摘要',
      icon: TbSubtask,
      component: SummaryTab
    },
    {
      id: 'list',
      name: '列表',
      description: '以列表形式展示资源数据',
      icon: TbList,
      component: ListTab
    }
  ];

  defaultTabs.forEach((tab) => {
    tabRegistry.register(tab);
  });

  // 注册示例远程扩展（用于演示）
  registerDemoRemoteTabs();
}

/**
 * 注册示例远程扩展（仅用于演示样式效果）
 */
function registerDemoRemoteTabs(): void {
  // 创建一个占位组件
  const PlaceholderComponent: React.FC = () => null;

  const demoRemoteTabs: TabComponent[] = [
    {
      id: 'ai-analysis' as any,
      name: 'AI 分析',
      description: '使用 AI 深度分析内容结构和语义',
      icon: TbSparkles,
      component: PlaceholderComponent,
      isDynamic: true
    },
    {
      id: 'mind-map' as any,
      name: '思维导图',
      description: '自动生成内容的思维导图',
      icon: TbBrain,
      component: PlaceholderComponent,
      isDynamic: true
    },
    {
      id: 'export-pdf' as any,
      name: '导出 PDF',
      description: '将内容导出为 PDF 格式',
      icon: TbFileExport,
      component: PlaceholderComponent,
      isDynamic: true
    }
  ];

  demoRemoteTabs.forEach((tab) => {
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
