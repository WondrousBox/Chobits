import React, { useEffect, useState } from 'react';
import { TbApps, TbPin, TbPinFilled } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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

/**
 * Tab 设置面板
 * 允许用户启用/禁用不同的 tab 组件（类似浏览器扩展管理）
 * 不同面板的 tab 设置互斥，一个 tab 只能被一个面板 pin
 */
export const TabSettings: React.FC<TabSettingsProps> = ({ panelId, allowedTabIds }) => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [allAppsDialogOpen, setAllAppsDialogOpen] = useState(false);
  const [tabs, setTabs] = useState<TabComponent[]>([]);
  const [allTabs, setAllTabs] = useState<TabComponent[]>([]);
  const [pinnedStates, setPinnedStates] = useState<Record<string, boolean>>({});
  const [tabOwners, setTabOwners] = useState<Record<string, string | null>>({});

  // 更新 tab 状态
  const updateTabStates = (): void => {
    const allRegisteredTabs = tabRegistry.getAll();
    setAllTabs(allRegisteredTabs);

    // 只显示当前资源类型允许的 tab（用于 popover）
    const filteredTabs = allRegisteredTabs.filter((tab) => allowedTabIds.includes(tab.id));
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

  const handlePinToggle = (tabId: string, e: React.MouseEvent): void => {
    e.stopPropagation();
    tabPanelManager.toggleTab(panelId, tabId);
  };

  // 将 tab 分为本地和远程
  const localTabs = tabs.filter((tab) => !tab.isDynamic);
  const remoteTabs = tabs.filter((tab) => tab.isDynamic);

  const allLocalTabs = allTabs.filter((tab) => !tab.isDynamic);
  const allRemoteTabs = allTabs.filter((tab) => tab.isDynamic);

  // 渲染组件列表项
  const renderTabItem = (tab: TabComponent, showType: boolean = false): React.ReactNode => {
    const isPinned = pinnedStates[tab.id] ?? false;
    const owner = tabOwners[tab.id];
    const isPinnedByOther = owner !== null && owner !== panelId;

    return (
      <div key={tab.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/50 group">
        <div className="flex items-center space-x-2 flex-1 min-w-0">
          <span className={`text-sm truncate ${isPinnedByOther ? 'text-muted-foreground' : ''}`}>{tab.name}</span>
          {showType && <span className="text-xs text-muted-foreground shrink-0">{tab.isDynamic ? '远程' : '本地'}</span>}
          {isPinnedByOther && <span className="text-xs text-amber-500 shrink-0">({owner})</span>}
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="w-6 h-6 shrink-0"
                onClick={(e) => handlePinToggle(tab.id, e)}
                title={isPinned ? '取消固定' : isPinnedByOther ? `从 ${owner} 面板抢占` : '固定'}
              >
                {isPinned ? <TbPinFilled className="w-4 h-4 text-primary" /> : isPinnedByOther ? <TbPin className="w-4 h-4 text-amber-500" /> : <TbPin className="w-4 h-4 text-muted-foreground" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isPinned ? '取消固定' : isPinnedByOther ? `从 "${owner}" 面板抢占` : '固定到此面板'}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  };

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button size="icon" variant="ghost" className="w-8 h-8" title="Tab 组件">
            <TbApps className="w-4 h-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-0" side="bottom">
          <ScrollArea className="max-h-[400px]">
            <div className="p-2">
              {/* 面板标识 */}
              <div className="px-2 py-1 text-xs text-muted-foreground mb-2">面板: {panelId}</div>

              {/* 本地组件 */}
              {localTabs.length > 0 && <div className="space-y-1">{localTabs.map((tab) => renderTabItem(tab))}</div>}

              {/* 远程组件 */}
              {remoteTabs.length > 0 && (
                <>
                  {localTabs.length > 0 && <Separator className="my-2" />}
                  <div className="space-y-1">{remoteTabs.map((tab) => renderTabItem(tab))}</div>
                </>
              )}

              {tabs.length === 0 && <div className="text-center text-sm text-muted-foreground py-4">暂无可用的 Tab 组件</div>}
            </div>
          </ScrollArea>
          <Separator />
          <div className="p-2">
            <Button
              variant="ghost"
              className="w-full justify-start text-sm"
              onClick={() => {
                setPopoverOpen(false);
                setAllAppsDialogOpen(true);
              }}
            >
              查看所有扩展
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* 查看所有扩展对话框 */}
      <Dialog open={allAppsDialogOpen} onOpenChange={setAllAppsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>所有 Tab 组件 (面板: {panelId})</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-4">
              {/* 本地组件 */}
              {allLocalTabs.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-2">本地组件</div>
                  <div className="space-y-1">{allLocalTabs.map((tab) => renderTabItem(tab, true))}</div>
                </div>
              )}

              {/* 远程组件 */}
              {allRemoteTabs.length > 0 && (
                <>
                  {allLocalTabs.length > 0 && <Separator className="my-4" />}
                  <div>
                    <div className="text-sm font-medium mb-2">远程组件</div>
                    <div className="space-y-1">{allRemoteTabs.map((tab) => renderTabItem(tab, true))}</div>
                  </div>
                </>
              )}

              {allTabs.length === 0 && <div className="text-center text-sm text-muted-foreground py-8">暂无可用的 Tab 组件</div>}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
};
