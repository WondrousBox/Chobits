import { closestCenter, DndContext, DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React, { useEffect, useState } from 'react';
import { TbApps, TbGripVertical, TbPlus } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';

import type { TabType } from '../ResourceTabs';
import { tabPanelManager } from './TabPanelManager';
import { tabRegistry } from './TabRegistry';
import type { TabComponent } from './types';

interface TabSettingsProps {
  /** 面板ID（必须，每个面板需要唯一标识） */
  panelId: string;
  /** 当前资源类型允许的 tab ID 列表 */
  allowedTabIds: (TabType | string)[];
}

/** 可排序的列表项组件 */
interface SortableItemProps {
  tab: TabComponent;
  isPinned: boolean;
  isPinnedByOther: boolean;
  onToggle: () => void;
}

/** 渲染 Tab 图标 */
const renderTabIcon = (icon: TabComponent['icon'], className: string): React.ReactNode => {
  if (!icon) return null;

  // React 组件
  if (typeof icon === 'function') {
    const IconComponent = icon;
    return <IconComponent className={className} />;
  }

  // SVG 字符串
  if (typeof icon === 'string' && icon.trim().startsWith('<svg')) {
    return <span className={className} dangerouslySetInnerHTML={{ __html: icon }} />;
  }

  // URL 字符串
  if (typeof icon === 'string') {
    return <img src={icon} alt="" className={className} />;
  }

  return null;
};

const SortableItem: React.FC<SortableItemProps> = ({ tab, isPinned, isPinnedByOther, onToggle }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tab.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-center gap-2 px-2 py-2 hover:bg-accent/50 transition-colors first:rounded-t-md last:rounded-b-md"
    >
      {/* 图标/拖拽手柄区域 */}
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0 relative w-4 h-4">
        {/* 默认显示 tab icon */}
        <span className="absolute inset-0 flex items-center justify-center group-hover:opacity-0 transition-opacity">
          {tab.icon ? renderTabIcon(tab.icon, 'w-4 h-4') : <TbGripVertical className="w-4 h-4" />}
        </span>
        {/* hover 时显示拖拽 icon */}
        <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <TbGripVertical className="w-4 h-4" />
        </span>
      </div>

      {/* 内容区域 */}
      <div
        className="flex items-center justify-between flex-1 min-w-0 cursor-pointer"
        onClick={() => !isPinnedByOther && onToggle()}
      >
        <span className={`text-[13px] font-medium truncate ${isPinnedByOther ? 'text-muted-foreground' : 'text-foreground'}`}>
          {tab.name}
        </span>

        <Switch
          checked={isPinned}
          disabled={isPinnedByOther}
          onCheckedChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 ml-2 h-4 w-7 [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-3"
        />
      </div>
    </div>
  );
};

/**
 * Tab 设置面板
 * 允许用户启用/禁用不同的 tab 组件（类似浏览器扩展管理）
 * 支持拖拽排序
 */
export const TabSettings: React.FC<TabSettingsProps> = ({ panelId, allowedTabIds }) => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [tabs, setTabs] = useState<TabComponent[]>([]);
  const [pinnedStates, setPinnedStates] = useState<Record<string, boolean>>({});
  const [tabOwners, setTabOwners] = useState<Record<string, string | null>>({});

  // 拖拽传感器
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // 更新 tab 状态
  const updateTabStates = (): void => {
    const allRegisteredTabs = tabRegistry.getAll();

    // 本地扩展：只显示当前资源类型允许的 tab
    // 远程扩展：始终显示所有远程扩展
    const filteredTabs = allRegisteredTabs.filter((tab) => tab.isDynamic || allowedTabIds.includes(tab.id));
    setTabs(filteredTabs);

    // 更新 pin 状态和所有者
    const pinStates: Record<string, boolean> = {};
    const owners: Record<string, string | null> = {};
    allRegisteredTabs.forEach((tab) => {
      pinStates[tab.id] = tabPanelManager.isTabPinned(panelId, tab.id);
      owners[tab.id] = tabPanelManager.getTabOwner(tab.id);
    });
    setPinnedStates(pinStates);
    setTabOwners(owners);
  };

  // 加载所有已注册的 tab
  useEffect(() => {
    updateTabStates();

    // 监听注册表变化
    const unsubscribeRegistry = tabRegistry.addEventListener((event) => {
      if (event.type === 'register' || event.type === 'unregister') {
        updateTabStates();
      }
    });

    // 监听面板管理器变化
    const unsubscribePanel = tabPanelManager.addEventListener(() => {
      updateTabStates();
    });

    return () => {
      unsubscribeRegistry();
      unsubscribePanel();
    };
  }, [panelId, allowedTabIds]);

  // 将 tab 分为本地和远程
  const localTabs = tabs.filter((tab) => !tab.isDynamic);
  const remoteTabs = tabs.filter((tab) => tab.isDynamic);

  // 处理拖拽结束
  const handleDragEnd = (event: DragEndEvent, items: TabComponent[], isRemote: boolean): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newItems = arrayMove(items, oldIndex, newIndex);
      // 更新顺序到 registry
      const newOrder = [
        ...(isRemote ? localTabs : newItems).map((t) => t.id),
        ...(isRemote ? newItems : remoteTabs).map((t) => t.id)
      ];
      tabRegistry.setOrder(newOrder);
    }
  };

  // 处理添加更多扩展
  const handleAddMore = (): void => {
    setPopoverOpen(false);
    // TODO: 打开扩展市场
    console.log('打开更多扩展');
  };

  // 渲染可排序的设置组
  const renderSortableGroup = (title: string, items: TabComponent[], isRemote: boolean): React.ReactNode => {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-medium text-muted-foreground">{title}</span>
        </div>
        <div className="bg-card border border-border rounded-md divide-y divide-border/50 relative overflow-hidden">
          {items.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, items, isRemote)}>
              <SortableContext items={items.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <>
                  {items.map((tab) => (
                    <SortableItem
                      key={tab.id}
                      tab={tab}
                      isPinned={pinnedStates[tab.id] ?? false}
                      isPinnedByOther={tabOwners[tab.id] !== null && tabOwners[tab.id] !== panelId}
                      onToggle={() => tabPanelManager.toggleTab(panelId, tab.id)}
                    />
                  ))}
                </>
              </SortableContext>
            </DndContext>
          )}
          {/* 三方应用列表末尾的添加按钮 */}
          {isRemote && (
            <button
              className="flex items-center gap-1.5 px-2 py-1.5 w-full text-left hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
              onClick={handleAddMore}
            >
              <TbPlus className="w-3.5 h-3.5" />
              <span className="text-xs">添加更多</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className="w-8 h-8" title="扩展管理">
          <TbApps className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2 overflow-hidden shadow-none" side="bottom">
        <div className="space-y-3 max-h-[360px] overflow-y-auto overflow-x-hidden">
          {renderSortableGroup('本地扩展', localTabs, false)}
          {renderSortableGroup('三方应用', remoteTabs, true)}
        </div>
      </PopoverContent>
    </Popover>
  );
};
