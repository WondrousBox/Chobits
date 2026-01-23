import { closestCenter, DndContext, type DragEndEvent, DragOverlay, type DragStartEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TbFileText, TbFileTextAi, TbLanguage, TbList, TbNotebook, TbSparkles } from 'react-icons/tb';

import { Tabs, TabsContent } from '@/components/ui/tabs';

import type { ResourceItem } from '../types';
import { isAudioFile, isImageFile, isVideoFile } from '../utils/resourceProtocol';
import { isSubtitleFile } from '../utils/subtitleUtils';
import type { MediaPlayerRef } from './Players/MediaPlayer/MediaPlayer';
import { ResourceTabContextProvider, tabPanelManager, tabRegistry } from './tabs';
import { registerDefaultTabs } from './tabs/registerTabs';
import { SortableTabTrigger, TabPreview } from './tabs/SortableTabTrigger';
import { TabSettings } from './tabs/TabSettings';
import type { TabIcon } from './tabs/types';

// 功能标签类型
// 基础类型 + 动态扩展类型（支持远程组件注册的新 tab）
export type TabType = 'content' | 'subtitle' | 'translate' | 'summary' | 'notes' | 'list' | (string & {});

export interface TabConfig {
  id: TabType;
  label: string;
  icon: TabIcon;
}

// Tab 图标映射
const TAB_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  content: TbFileTextAi,
  translate: TbLanguage,
  subtitle: TbFileText,
  summary: TbSparkles,
  notes: TbNotebook,
  list: TbList
};

// 初始化默认 Tab（只执行一次）
let defaultTabsRegistered = false;
if (!defaultTabsRegistered) {
  registerDefaultTabs();
  // 加载保存的顺序
  tabRegistry.loadOrder();
  defaultTabsRegistered = true;
}

interface ResourceTabsProps {
  /** 面板ID（必须，用于区分不同的 ResourceTabs 实例） */
  panelId: string;
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
  /** 默认启用的 tab 列表（仅在面板首次注册时生效） */
  defaultPinnedTabs?: string[];
}

/**
 * 资源标签组件
 * 封装了资源预览面板中的所有 tab 相关功能
 *
 * @param panelId - 必须的面板ID，用于区分不同的 ResourceTabs 实例
 *                  同一个 tab 只能被一个面板 pin，实现多面板间的互斥
 */
const ResourceTabs: React.FC<ResourceTabsProps> = ({ panelId, resource, currentTime, mediaPlayerRef, subtitleList, activeSubtitle, setActiveSubtitle, onResourceChange, defaultPinnedTabs }) => {
  // 判断资源类型
  const isVideo = isVideoFile(resource?.filePath);
  const isAudio = isAudioFile(resource?.filePath);
  const isImage = isImageFile(resource?.filePath);
  const isSubtitle = isSubtitleFile(resource?.filePath);

  // 根据资源类型获取允许的 tab ID 列表
  const allowedTabIds = useMemo((): TabType[] => {
    if (isVideo) {
      return ['subtitle', 'translate', 'summary', 'notes', 'list'];
    } else if (isAudio) {
      return ['translate', 'summary', 'notes', 'list'];
    } else if (isImage) {
      return ['summary', 'notes', 'list'];
    } else if (isSubtitle) {
      return ['content', 'translate', 'summary', 'notes', 'list'];
    } else {
      return ['content', 'translate', 'summary', 'notes', 'list'];
    }
  }, [isVideo, isAudio, isImage, isSubtitle]);

  // 注册面板到 TabPanelManager
  useEffect(() => {
    // 确定默认 pin 的 tab（基于资源类型和传入的默认值）
    const defaultTabs = defaultPinnedTabs ?? allowedTabIds;
    tabPanelManager.registerPanel(panelId, defaultTabs);

    // 组件卸载时不注销面板，保留配置
    // return () => tabPanelManager.unregisterPanel(panelId);
  }, [panelId, allowedTabIds, defaultPinnedTabs]);

  // 监听注册表变化和面板管理器变化，动态更新可用的 tab
  const [registeredTabs, setRegisteredTabs] = useState(() => tabRegistry.getAll());
  const [pinnedTabIds, setPinnedTabIds] = useState<string[]>(() => tabPanelManager.getPinnedTabs(panelId));

  useEffect(() => {
    const updateTabs = (): void => {
      setRegisteredTabs(tabRegistry.getAll());
    };

    const updatePinnedTabs = (): void => {
      setPinnedTabIds(tabPanelManager.getPinnedTabs(panelId));
    };

    updateTabs();
    updatePinnedTabs();

    // 监听注册表变化事件（包括 reorder）
    const unsubscribeRegistry = tabRegistry.addEventListener((event) => {
      if (event.type === 'register' || event.type === 'unregister' || event.type === 'enable' || event.type === 'disable' || event.type === 'reorder') {
        updateTabs();
      }
    });

    // 监听面板管理器变化
    const unsubscribePanel = tabPanelManager.addEventListener((event) => {
      // 只响应与当前面板相关的事件
      if (event.panelId === panelId) {
        updatePinnedTabs();
      }
    });

    return () => {
      unsubscribeRegistry();
      unsubscribePanel();
    };
  }, [panelId]);

  // 拖拽传感器 - 增加激活距离避免误触
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  // 根据资源类型、启用状态和面板 pin 状态过滤可用的标签
  const availableTabs = useMemo((): TabConfig[] => {
    // 获取该面板 pin 的且在允许列表中的 tab
    return registeredTabs
      .filter((tab) => allowedTabIds.includes(tab.id) && pinnedTabIds.includes(tab.id))
      .map((tab) => ({
        id: tab.id as TabType,
        label: tab.name,
        icon: tab.icon || TAB_ICONS[tab.id] || TbFileText
      }));
  }, [registeredTabs, allowedTabIds, pinnedTabIds]);

  // 当前拖拽的 tab
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeTabConfig = activeId ? availableTabs.find((tab) => tab.id === activeId) : null;

  // 处理拖拽开始
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  // 处理拖拽结束
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (over && active.id !== over.id) {
        const oldIndex = availableTabs.findIndex((tab) => tab.id === active.id);
        const newIndex = availableTabs.findIndex((tab) => tab.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
          // 重新排序当前显示的 tab
          const newOrder = arrayMove(availableTabs, oldIndex, newIndex);
          const orderedIds = newOrder.map((tab) => tab.id);

          // 直接设置新顺序（简化逻辑）
          tabRegistry.setOrder(orderedIds);
        }
      }
    },
    [availableTabs]
  );

  // 处理拖拽取消
  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  // 默认 Tab：文本类型选中 'content'，媒体类型选中 'subtitle'
  const getDefaultTab = useCallback((): TabType => {
    const textType = !isVideoFile(resource?.filePath) && !isAudioFile(resource?.filePath) && !isImageFile(resource?.filePath);
    return textType ? 'content' : 'subtitle';
  }, [resource?.filePath]);

  const [activeTab, setActiveTab] = useState<TabType>(getDefaultTab);

  // 当资源变化时，重置到合适的默认 Tab
  useEffect(() => {
    setActiveTab(getDefaultTab());
  }, [getDefaultTab]);

  // 当可用标签变化时，确保当前选中的标签有效
  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.find((t) => t.id === activeTab)) {
      setActiveTab(availableTabs[0].id);
    }
  }, [availableTabs, activeTab]);

  // 渲染标签内容（从注册表动态获取组件）
  const renderTabContent = useCallback((tabId: TabType): React.ReactNode => {
    const tabComponent = tabRegistry.get(tabId);
    if (!tabComponent) {
      return <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Tab 组件未找到: {tabId}</div>;
    }

    const Component = tabComponent.component;
    return <Component />;
  }, []);

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
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* 标签栏 - 始终显示，即使没有可用的tab */}
        <div className="flex items-center border-y bg-muted/30 shrink-0 h-9">
          {availableTabs.length > 0 ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
              <div className="flex-1 flex items-center h-full px-1 gap-0.5 overflow-x-auto">
                <SortableContext items={availableTabs.map((tab) => tab.id)} strategy={horizontalListSortingStrategy}>
                  {availableTabs.map((tab) => (
                    <SortableTabTrigger key={tab.id} id={tab.id} value={tab.id} icon={tab.icon} label={tab.label} isActive={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} />
                  ))}
                </SortableContext>
              </div>
              {/* DragOverlay - Chrome 风格拖拽预览 */}
              <DragOverlay dropAnimation={null}>{activeTabConfig && <TabPreview icon={activeTabConfig.icon} label={activeTabConfig.label} isActive={activeTab === activeId} />}</DragOverlay>
            </DndContext>
          ) : (
            <div className="flex-1 flex items-center h-full px-2 text-xs text-muted-foreground">暂无 Tab，请点击右侧按钮添加</div>
          )}
          {/* 设置按钮 - 始终显示 */}
          <div className="px-2 border-l h-full flex items-center">
            <TabSettings panelId={panelId} allowedTabIds={allowedTabIds} />
          </div>
        </div>

        {/* 标签内容 */}
        {availableTabs.length > 0 ? (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)} className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="flex-1 overflow-hidden min-h-0">
              {availableTabs.map((tab) => (
                <TabsContent key={tab.id} value={tab.id} className="h-full m-0 data-[state=inactive]:hidden">
                  {renderTabContent(tab.id)}
                </TabsContent>
              ))}
            </div>
          </Tabs>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            <div className="text-center">
              <p>此面板尚未配置任何 Tab</p>
              <p className="text-xs mt-1">请点击右上角设置按钮添加 Tab</p>
            </div>
          </div>
        )}
      </div>
    </ResourceTabContextProvider>
  );
};

export default ResourceTabs;
