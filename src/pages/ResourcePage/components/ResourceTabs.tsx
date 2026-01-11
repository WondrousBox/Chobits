import { closestCenter, DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import React, { useEffect, useMemo, useState } from 'react';
import { TbFileText, TbFileTextAi, TbLanguage, TbList, TbSparkles } from 'react-icons/tb';

import { Tabs, TabsContent, TabsList } from '@/components/ui/tabs';

import type { ResourceItem } from '../types';
import { isAudioFile, isImageFile, isVideoFile } from '../utils/resourceProtocol';
import { isSubtitleFile } from '../utils/subtitleUtils';
import type { MediaPlayerRef } from './Players/MediaPlayer/MediaPlayer';
import { ResourceTabContextProvider, tabRegistry } from './tabs';
import { registerDefaultTabs } from './tabs/registerTabs';
import { SortableTabTrigger } from './tabs/SortableTabTrigger';
import { TabSettings } from './tabs/TabSettings';

// 功能标签类型
// 基础类型 + 动态扩展类型（支持远程组件注册的新 tab）
export type TabType = 'content' | 'subtitle' | 'translate' | 'summary' | 'list' | (string & {});

export interface TabConfig {
  id: TabType;
  label: string;
  icon: React.ComponentType<{ className?: string }> | string;
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

  // 根据资源类型获取允许的 tab ID 列表
  const allowedTabIds = useMemo((): TabType[] => {
    if (isVideo) {
      // 视频：显示字幕、翻译、总结、列表（不含内容Tab，视频在上方播放）
      return ['subtitle', 'translate', 'summary', 'list'];
    } else if (isAudio) {
      // 音频：翻译、总结、列表（不含内容Tab，音频在上方播放）
      return ['translate', 'summary', 'list'];
    } else if (isImage) {
      // 图片：总结、列表（不含内容Tab，图片在上方显示）
      return ['summary', 'list'];
    } else if (isSubtitle) {
      // 字幕：内容、翻译、总结、列表（内容Tab显示字幕内容）
      return ['content', 'translate', 'summary', 'list'];
    } else {
      // 其他文本（JSON、TXT、PDF等）：内容、翻译、总结、列表
      return ['content', 'translate', 'summary', 'list'];
    }
  }, [isVideo, isAudio, isImage, isSubtitle]);

  // 监听注册表变化，动态更新可用的 tab
  const [registeredTabs, setRegisteredTabs] = useState(() => tabRegistry.getEnabled());

  useEffect(() => {
    const updateTabs = (): void => {
      setRegisteredTabs(tabRegistry.getEnabled());
    };

    updateTabs();

    // 监听注册表变化事件
    const unsubscribe = tabRegistry.addEventListener((event) => {
      if (event.type === 'register' || event.type === 'unregister' || event.type === 'enable' || event.type === 'disable') {
        updateTabs();
      }
    });

    return unsubscribe;
  }, []);

  // 拖拽传感器
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  // 根据资源类型和启用状态过滤可用的标签
  const availableTabs = useMemo((): TabConfig[] => {
    return registeredTabs
      .filter((tab) => allowedTabIds.includes(tab.id))
      .map((tab) => ({
        id: tab.id as TabType,
        label: tab.name,
        // 优先使用 tab 自定义图标，否则使用预设图标
        icon: tab.icon || TAB_ICONS[tab.id as TabType] || TbFileText
      }));
  }, [registeredTabs, allowedTabIds]);

  // 处理拖拽结束
  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = availableTabs.findIndex((tab) => tab.id === active.id);
      const newIndex = availableTabs.findIndex((tab) => tab.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        // 重新排序当前显示的 tab
        const newOrder = arrayMove(availableTabs, oldIndex, newIndex);
        const orderedIds = newOrder.map((tab) => tab.id);

        // 获取所有 tab 的完整顺序
        const allOrder = tabRegistry.getOrder();

        // 找出当前资源类型允许的所有 tab（包括未启用的）
        const allAllowedTabs = tabRegistry.getAll().filter((tab) => allowedTabIds.includes(tab.id));
        const allAllowedIds = allAllowedTabs.map((tab) => tab.id);

        // 从完整顺序中分离：当前资源类型的 tab 和其他 tab
        const currentTypeTabs: string[] = [];
        const otherTabs: string[] = [];

        allOrder.forEach((id) => {
          if (allAllowedIds.includes(id)) {
            currentTypeTabs.push(id);
          } else {
            otherTabs.push(id);
          }
        });

        // 更新当前资源类型的 tab 顺序：已启用的按新顺序，未启用的保持原位置
        const updatedCurrentTypeTabs: string[] = [];
        const reorderedSet = new Set(orderedIds);

        // 先添加重新排序的 tab
        orderedIds.forEach((id) => {
          if (currentTypeTabs.includes(id)) {
            updatedCurrentTypeTabs.push(id);
          }
        });

        // 再添加未重新排序的当前类型 tab（保持原顺序）
        currentTypeTabs.forEach((id) => {
          if (!reorderedSet.has(id)) {
            updatedCurrentTypeTabs.push(id);
          }
        });

        // 合并：更新后的当前类型 tab + 其他 tab
        const finalOrder = [...updatedCurrentTypeTabs, ...otherTabs];
        tabRegistry.setOrder(finalOrder);
      }
    }
  };

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
        <div className="flex items-center border-y bg-muted/30 shrink-0">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <TabsList className="flex-1 justify-start rounded-none border-0 bg-transparent h-9 px-2 group">
              <SortableContext items={availableTabs.map((tab) => tab.id)} strategy={horizontalListSortingStrategy}>
                {availableTabs.map((tab) => (
                  <SortableTabTrigger
                    key={tab.id}
                    id={tab.id}
                    value={tab.id}
                    icon={tab.icon}
                    label={tab.label}
                    className="text-xs gap-1 rounded-none border-b-2 border-t-0 border-l-0 border-r-0 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none h-9 px-3 min-w-[40px] max-w-[200px] flex-shrink flex-grow basis-0"
                  />
                ))}
              </SortableContext>
            </TabsList>
          </DndContext>
          {/* 应用按钮 */}
          <div className="px-2 border-l">
            <TabSettings allowedTabIds={allowedTabIds} />
          </div>
        </div>

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
