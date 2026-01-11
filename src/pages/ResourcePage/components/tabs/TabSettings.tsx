import React, { useEffect, useState } from 'react';
import { TbApps, TbPin, TbPinFilled } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

import type { TabType } from '../ResourceTabs';
import { tabRegistry } from './TabRegistry';
import type { TabComponent } from './types';

interface TabSettingsProps {
  /** 当前资源类型允许的 tab ID 列表 */
  allowedTabIds: (TabType | string)[];
}

/**
 * Tab 设置面板
 * 允许用户启用/禁用不同的 tab 组件（类似浏览器扩展管理）
 */
export const TabSettings: React.FC<TabSettingsProps> = ({ allowedTabIds }) => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [allAppsDialogOpen, setAllAppsDialogOpen] = useState(false);
  const [tabs, setTabs] = useState<TabComponent[]>([]);
  const [allTabs, setAllTabs] = useState<TabComponent[]>([]);
  const [enabledStates, setEnabledStates] = useState<Record<string, boolean>>({});

  // 加载所有已注册的 tab
  useEffect(() => {
    const updateTabs = (): void => {
      const allRegisteredTabs = tabRegistry.getAll();
      setAllTabs(allRegisteredTabs);

      // 只显示当前资源类型允许的 tab（用于 popover）
      const filteredTabs = allRegisteredTabs.filter((tab) => allowedTabIds.includes(tab.id));
      setTabs(filteredTabs);

      // 更新启用状态
      const states: Record<string, boolean> = {};
      allRegisteredTabs.forEach((tab) => {
        states[tab.id] = tabRegistry.isEnabled(tab.id);
      });
      setEnabledStates(states);
    };

    updateTabs();

    // 监听注册表变化
    const unsubscribe = tabRegistry.addEventListener((event) => {
      if (event.type === 'register' || event.type === 'unregister' || event.type === 'enable' || event.type === 'disable') {
        updateTabs();
      }
    });

    return unsubscribe;
  }, [allowedTabIds]);

  const handlePinToggle = (tabId: string, e: React.MouseEvent): void => {
    e.stopPropagation();
    const isEnabled = tabRegistry.isEnabled(tabId);
    if (isEnabled) {
      tabRegistry.disable(tabId);
    } else {
      tabRegistry.enable(tabId);
    }
    setEnabledStates((prev) => ({ ...prev, [tabId]: !isEnabled }));
  };

  // 将 tab 分为本地和远程
  const localTabs = tabs.filter((tab) => !tab.isDynamic);
  const remoteTabs = tabs.filter((tab) => tab.isDynamic);

  const allLocalTabs = allTabs.filter((tab) => !tab.isDynamic);
  const allRemoteTabs = allTabs.filter((tab) => tab.isDynamic);

  // 渲染组件列表项
  const renderTabItem = (tab: TabComponent, showType: boolean = false): React.ReactNode => {
    const isEnabled = enabledStates[tab.id] ?? true;
    return (
      <div key={tab.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/50 group">
        <div className="flex items-center space-x-2 flex-1 min-w-0">
          <span className="text-sm truncate">{tab.name}</span>
          {showType && <span className="text-xs text-muted-foreground shrink-0">{tab.isDynamic ? '远程' : '本地'}</span>}
        </div>
        <Button size="icon" variant="ghost" className="w-6 h-6 shrink-0" onClick={(e) => handlePinToggle(tab.id, e)} title={isEnabled ? '取消固定' : '固定'}>
          {isEnabled ? <TbPinFilled className="w-4 h-4 text-primary" /> : <TbPin className="w-4 h-4 text-muted-foreground" />}
        </Button>
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
            <DialogTitle>所有 Tab 组件</DialogTitle>
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
