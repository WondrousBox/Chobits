/**
 * 跨面板拖拽上下文
 * 当多个 ResourceTabs 面板共存时，提供共享的 DndContext 实现跨面板拖拽
 *
 * 功能：
 * - 同面板内拖拽排序
 * - 跨面板拖拽：从一个面板拖到另一个面板，自动 unpin/pin + 调整全局排序
 */
import { closestCenter, DndContext, type DragEndEvent, DragOverlay, type DragStartEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

import { TabPreview } from './SortableTabTrigger';
import { tabPanelManager } from './TabPanelManager';
import { tabRegistry } from './TabRegistry';
import type { TabIcon } from './types';

/** 面板注册信息 */
interface PanelRegistration {
  tabIds: string[];
  allowedTabIds: string[];
}

/** 当前拖拽中的 tab 信息 */
interface ActiveTabInfo {
  id: string;
  panelId: string;
  icon?: TabIcon;
  label: string;
  isActive: boolean;
}

/** CrossPanelDnd 上下文值 */
export interface CrossPanelDndContextValue {
  /** 是否处于共享 DndContext 中 */
  isProvided: boolean;
  /** 注册面板 */
  registerPanel: (panelId: string, tabIds: string[], allowedTabIds: string[]) => void;
  /** 注销面板 */
  unregisterPanel: (panelId: string) => void;
  /** 当前拖拽中的 tab 信息 */
  activeTab: ActiveTabInfo | null;
}

const CrossPanelDndContext = createContext<CrossPanelDndContextValue>({
  isProvided: false,
  registerPanel: () => { },
  unregisterPanel: () => { },
  activeTab: null
});

/**
 * 获取跨面板拖拽上下文
 */
export const useCrossPanelDnd = (): CrossPanelDndContextValue => useContext(CrossPanelDndContext);

interface CrossPanelDndProviderProps {
  children: React.ReactNode;
}

/**
 * 跨面板拖拽提供者
 * 包裹多个 ResourceTabs 实例，提供共享的 DndContext
 */
export const CrossPanelDndProvider: React.FC<CrossPanelDndProviderProps> = ({ children }) => {
  const panelsRef = useRef(new Map<string, PanelRegistration>());
  const [activeTab, setActiveTab] = useState<ActiveTabInfo | null>(null);

  // 拖拽传感器
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  /** 查找 tab 所属的面板 */
  const findPanelForTab = useCallback((tabId: string): string | null => {
    for (const [panelId, data] of panelsRef.current) {
      if (data.tabIds.includes(tabId)) return panelId;
    }
    return null;
  }, []);

  /** 注册面板 */
  const registerPanel = useCallback((panelId: string, tabIds: string[], allowedTabIds: string[]) => {
    panelsRef.current.set(panelId, { tabIds, allowedTabIds });
  }, []);

  /** 注销面板 */
  const unregisterPanel = useCallback((panelId: string) => {
    panelsRef.current.delete(panelId);
  }, []);

  /** 拖拽开始 */
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const tabId = event.active.id as string;
      const panelId = findPanelForTab(tabId);
      if (!panelId) return;

      const tab = tabRegistry.get(tabId);
      setActiveTab({
        id: tabId,
        panelId,
        icon: tab?.icon,
        label: tab?.name || tabId,
        isActive: false
      });
    },
    [findPanelForTab]
  );

  /** 拖拽结束 */
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const sourcePanelId = activeTab?.panelId;
      setActiveTab(null);

      if (!over || !sourcePanelId) return;

      const draggedTabId = active.id as string;
      const overItemId = over.id as string;

      // 判断目标面板
      let targetPanelId: string | null = null;
      let overTabId: string | null = null;

      // 检查 overItemId 是否是面板 droppable ID（格式: panel-drop-{panelId}）
      if (overItemId.startsWith('panel-drop-')) {
        targetPanelId = overItemId.replace('panel-drop-', '');
      } else {
        // 查找 over tab 所属面板
        targetPanelId = findPanelForTab(overItemId);
        overTabId = overItemId;
      }

      if (!targetPanelId) return;

      if (sourcePanelId === targetPanelId) {
        // 同面板排序
        if (overTabId && draggedTabId !== overTabId) {
          const panelData = panelsRef.current.get(sourcePanelId);
          if (panelData) {
            const tabIds = [...panelData.tabIds];
            const oldIndex = tabIds.indexOf(draggedTabId);
            const newIndex = tabIds.indexOf(overTabId);
            if (oldIndex !== -1 && newIndex !== -1) {
              const newOrder = arrayMove(tabIds, oldIndex, newIndex);
              tabRegistry.setOrder(newOrder);
            }
          }
        }
      } else {
        // 跨面板拖拽
        const targetData = panelsRef.current.get(targetPanelId);
        if (!targetData) return;

        // 检查目标面板是否允许此 tab（本地扩展需要在 allowedTabIds 中，动态扩展始终允许）
        const tab = tabRegistry.get(draggedTabId);
        if (!tab?.isDynamic && !targetData.allowedTabIds.includes(draggedTabId)) {
          return;
        }

        // 执行跨面板移动：从源面板 unpin，在目标面板 pin
        tabPanelManager.unpinTab(sourcePanelId, draggedTabId);
        tabPanelManager.pinTab(targetPanelId, draggedTabId);

        // 更新全局排序：将被拖拽的 tab 插入到目标位置附近
        const currentOrder = tabRegistry.getOrder();
        const withoutDragged = currentOrder.filter((id) => id !== draggedTabId);

        if (overTabId) {
          // 插入到 over tab 之后
          const overIndex = withoutDragged.indexOf(overTabId);
          if (overIndex >= 0) {
            withoutDragged.splice(overIndex + 1, 0, draggedTabId);
          } else {
            withoutDragged.push(draggedTabId);
          }
        } else {
          // 落在面板空白区域，追加到目标面板最后一个 tab 之后
          const targetTabIds = targetData.tabIds;
          const lastTabId = targetTabIds[targetTabIds.length - 1];
          const lastIndex = lastTabId ? withoutDragged.indexOf(lastTabId) : -1;
          if (lastIndex >= 0) {
            withoutDragged.splice(lastIndex + 1, 0, draggedTabId);
          } else {
            withoutDragged.push(draggedTabId);
          }
        }

        tabRegistry.setOrder(withoutDragged);
      }
    },
    [activeTab, findPanelForTab]
  );

  /** 拖拽取消 */
  const handleDragCancel = useCallback(() => {
    setActiveTab(null);
  }, []);

  const contextValue: CrossPanelDndContextValue = {
    isProvided: true,
    registerPanel,
    unregisterPanel,
    activeTab
  };

  return (
    <CrossPanelDndContext.Provider value={contextValue}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
        {children}
        <DragOverlay dropAnimation={null}>{activeTab && <TabPreview icon={activeTab.icon} label={activeTab.label} isActive={false} />}</DragOverlay>
      </DndContext>
    </CrossPanelDndContext.Provider>
  );
};
