import React, { useEffect, useMemo, useState } from 'react';
import { TbFileText, TbFileTextAi, TbLanguage, TbList, TbSparkles } from 'react-icons/tb';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import type { ResourceItem } from '../types';
import { isAudioFile, isImageFile, isVideoFile } from '../utils/resourceProtocol';
import { isSubtitleFile } from '../utils/subtitleUtils';
import type { MediaPlayerRef } from './Players/MediaPlayer/MediaPlayer';
import { ResourceTabContextProvider, tabRegistry } from './tabs';
import { registerDefaultTabs } from './tabs/registerTabs';

// 功能标签类型
export type TabType = 'content' | 'subtitle' | 'translate' | 'summary' | 'list';

export interface TabConfig {
  id: TabType;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}

// Tab 图标映射
const TAB_ICONS: Record<TabType, React.ComponentType<{ className?: string }>> = {
  content: TbFileTextAi,
  translate: TbLanguage,
  subtitle: TbFileText,
  summary: TbSparkles,
  list: TbList
};

// 初始化默认 Tab（只执行一次）
let defaultTabsRegistered = false;
if (!defaultTabsRegistered) {
  registerDefaultTabs();
  defaultTabsRegistered = true;
}

interface ResourceTabsProps {
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
 * 资源标签组件
 * 封装了资源预览面板中的所有 tab 相关功能
 */
const ResourceTabs: React.FC<ResourceTabsProps> = ({ resource, currentTime, mediaPlayerRef, subtitleList, activeSubtitle, setActiveSubtitle, onResourceChange }) => {
  // 判断资源类型
  const isVideo = isVideoFile(resource?.filePath);
  const isAudio = isAudioFile(resource?.filePath);
  const isImage = isImageFile(resource?.filePath);
  const isSubtitle = isSubtitleFile(resource?.filePath);

  // 根据资源类型获取可用的标签
  const availableTabs = useMemo((): TabConfig[] => {
    const allRegisteredTabs = tabRegistry.getAll();
    let allowedTabIds: TabType[];

    if (isVideo) {
      // 视频：显示字幕、翻译、总结、列表（不含内容Tab，视频在上方播放）
      allowedTabIds = ['subtitle', 'translate', 'summary', 'list'];
    } else if (isAudio) {
      // 音频：翻译、总结、列表（不含内容Tab，音频在上方播放）
      allowedTabIds = ['translate', 'summary', 'list'];
    } else if (isImage) {
      // 图片：总结、列表（不含内容Tab，图片在上方显示）
      allowedTabIds = ['summary', 'list'];
    } else if (isSubtitle) {
      // 字幕：内容、翻译、总结、列表（内容Tab显示字幕内容）
      allowedTabIds = ['content', 'translate', 'summary', 'list'];
    } else {
      // 其他文本（JSON、TXT、PDF等）：内容、翻译、总结、列表
      allowedTabIds = ['content', 'translate', 'summary', 'list'];
    }

    // 从注册表中获取可用的 tab，并转换为 TabConfig
    return allRegisteredTabs
      .filter((tab) => allowedTabIds.includes(tab.id as TabType))
      .map((tab) => ({
        id: tab.id as TabType,
        label: tab.name,
        Icon: TAB_ICONS[tab.id as TabType] || TbFileText
      }));
  }, [isVideo, isAudio, isImage, isSubtitle]);

  // 默认 Tab：文本类型选中 'content'，媒体类型选中 'subtitle'
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const initialIsTextType = !isVideoFile(resource?.filePath) && !isAudioFile(resource?.filePath) && !isImageFile(resource?.filePath);
    return initialIsTextType ? 'content' : 'subtitle';
  });

  // 当资源变化时，重置到合适的默认 Tab
  useEffect(() => {
    const newIsTextType = !isVideoFile(resource?.filePath) && !isAudioFile(resource?.filePath) && !isImageFile(resource?.filePath);
    const defaultTab = newIsTextType ? 'content' : 'subtitle';
    setActiveTab(defaultTab);
  }, [resource]);

  // 当可用标签变化时，确保当前选中的标签有效（防止选中不可用的 Tab）
  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.find((t) => t.id === activeTab)) {
      setActiveTab(availableTabs[0].id);
    }
  }, [availableTabs, activeTab]);

  // 渲染标签内容（从注册表动态获取组件）
  const renderTabContent = (tabId: TabType): React.ReactNode => {
    const tabComponent = tabRegistry.get(tabId);
    if (!tabComponent) {
      return <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Tab 组件未找到: {tabId}</div>;
    }

    const Component = tabComponent.component;
    return <Component />;
  };

  // 如果没有可用的标签，不渲染任何内容
  if (availableTabs.length === 0) {
    return null;
  }

  // Context 值
  const contextValue = {
    resource,
    currentTime,
    mediaPlayerRef,
    subtitleList,
    activeSubtitle,
    setActiveSubtitle,
    onResourceChange
  };

  return (
    <ResourceTabContextProvider value={contextValue}>
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)} className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* 标签栏 */}
        <TabsList className="w-full justify-start rounded-none border-y bg-muted/30 h-9 px-2 shrink-0">
          {availableTabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="text-xs gap-1.5 data-[state=active]:bg-background">
              <tab.Icon className="w-4 h-4" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* 标签内容 */}
        <div className="flex-1 overflow-hidden min-h-0">
          {availableTabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="h-full m-0 data-[state=inactive]:hidden">
              {renderTabContent(tab.id)}
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </ResourceTabContextProvider>
  );
};

export default ResourceTabs;
