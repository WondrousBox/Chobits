/**
 * Tab 面板管理器
 * 管理多个 ResourceTabs 面板的 tab 分配和互斥逻辑
 */

export type PanelTabChangeEvent = {
  type: 'pin' | 'unpin';
  panelId: string;
  tabId: string;
};

export type PanelTabChangeListener = (event: PanelTabChangeEvent) => void;

interface PanelState {
  /** 该面板启用的 tab ID 集合 */
  pinnedTabs: Set<string>;
}

class TabPanelManagerImpl {
  private readonly STORAGE_KEY = 'resource-tab-panel-settings';

  /** 面板状态映射 */
  private panels = new Map<string, PanelState>();

  /** 事件监听器 */
  private listeners = new Set<PanelTabChangeListener>();

  constructor() {
    this.loadFromStorage();
  }

  /**
   * 注册一个面板
   * @param panelId 面板ID
   * @param defaultPinnedTabs 默认启用的tab列表（仅在面板首次注册时生效）
   */
  registerPanel(panelId: string, defaultPinnedTabs?: string[]): void {
    if (!this.panels.has(panelId)) {
      // 检查默认tab是否被其他面板占用
      const availableTabs = defaultPinnedTabs?.filter((tabId) => !this.isTabPinnedByOther(panelId, tabId)) ?? [];
      this.panels.set(panelId, {
        pinnedTabs: new Set(availableTabs)
      });
      this.saveToStorage();
    }
  }

  /**
   * 注销一个面板
   */
  unregisterPanel(panelId: string): void {
    if (this.panels.has(panelId)) {
      this.panels.delete(panelId);
      this.saveToStorage();
    }
  }

  /**
   * 检查某个 tab 是否被其他面板 pin
   */
  isTabPinnedByOther(currentPanelId: string, tabId: string): boolean {
    for (const [panelId, state] of this.panels) {
      if (panelId !== currentPanelId && state.pinnedTabs.has(tabId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 获取某个 tab 被哪个面板 pin 了
   */
  getTabOwner(tabId: string): string | null {
    for (const [panelId, state] of this.panels) {
      if (state.pinnedTabs.has(tabId)) {
        return panelId;
      }
    }
    return null;
  }

  /**
   * 在指定面板中 pin 一个 tab
   * 如果该 tab 已被其他面板 pin，会先从其他面板 unpin
   */
  pinTab(panelId: string, tabId: string): void {
    // 先从其他面板中 unpin 这个 tab
    for (const [otherPanelId, state] of this.panels) {
      if (otherPanelId !== panelId && state.pinnedTabs.has(tabId)) {
        state.pinnedTabs.delete(tabId);
        this.emit({ type: 'unpin', panelId: otherPanelId, tabId });
      }
    }

    // 确保当前面板已注册
    if (!this.panels.has(panelId)) {
      this.panels.set(panelId, { pinnedTabs: new Set() });
    }

    // 在当前面板中 pin 这个 tab
    const panelState = this.panels.get(panelId)!;
    if (!panelState.pinnedTabs.has(tabId)) {
      panelState.pinnedTabs.add(tabId);
      this.emit({ type: 'pin', panelId, tabId });
    }

    this.saveToStorage();
  }

  /**
   * 在指定面板中 unpin 一个 tab
   */
  unpinTab(panelId: string, tabId: string): void {
    const panelState = this.panels.get(panelId);
    if (panelState && panelState.pinnedTabs.has(tabId)) {
      panelState.pinnedTabs.delete(tabId);
      this.emit({ type: 'unpin', panelId, tabId });
      this.saveToStorage();
    }
  }

  /**
   * 切换 tab 的 pin 状态
   */
  toggleTab(panelId: string, tabId: string): boolean {
    const isPinned = this.isTabPinned(panelId, tabId);
    if (isPinned) {
      this.unpinTab(panelId, tabId);
      return false;
    } else {
      this.pinTab(panelId, tabId);
      return true;
    }
  }

  /**
   * 检查某个 tab 是否在指定面板中 pin
   */
  isTabPinned(panelId: string, tabId: string): boolean {
    const panelState = this.panels.get(panelId);
    return panelState?.pinnedTabs.has(tabId) ?? false;
  }

  /**
   * 获取指定面板 pin 的所有 tab
   */
  getPinnedTabs(panelId: string): string[] {
    const panelState = this.panels.get(panelId);
    return panelState ? Array.from(panelState.pinnedTabs) : [];
  }

  /**
   * 获取所有已被 pin 的 tab（任意面板）
   */
  getAllPinnedTabs(): string[] {
    const allTabs = new Set<string>();
    for (const state of this.panels.values()) {
      for (const tabId of state.pinnedTabs) {
        allTabs.add(tabId);
      }
    }
    return Array.from(allTabs);
  }

  /**
   * 获取对于指定面板可用的 tab（未被其他面板 pin 的）
   */
  getAvailableTabs(panelId: string, allTabIds: string[]): string[] {
    return allTabIds.filter((tabId) => {
      const owner = this.getTabOwner(tabId);
      return owner === null || owner === panelId;
    });
  }

  /**
   * 添加事件监听器
   */
  addEventListener(listener: PanelTabChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.removeEventListener(listener);
  }

  /**
   * 移除事件监听器
   */
  removeEventListener(listener: PanelTabChangeListener): void {
    this.listeners.delete(listener);
  }

  private emit(event: PanelTabChangeEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in panel tab change listener:', error);
      }
    });
  }

  private saveToStorage(): void {
    try {
      const data: Record<string, string[]> = {};
      for (const [panelId, state] of this.panels) {
        data[panelId] = Array.from(state.pinnedTabs);
      }
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch {
      // 忽略存储失败
    }
  }

  private loadFromStorage(): void {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved) as Record<string, string[]>;
        for (const [panelId, tabIds] of Object.entries(data)) {
          this.panels.set(panelId, {
            pinnedTabs: new Set(tabIds)
          });
        }
      }
    } catch {
      // 忽略加载失败
    }
  }

  /**
   * 获取所有已注册的面板ID
   */
  getAllPanelIds(): string[] {
    return Array.from(this.panels.keys());
  }

  /**
   * 清除所有数据（用于测试或重置）
   */
  clear(): void {
    this.panels.clear();
    localStorage.removeItem(this.STORAGE_KEY);
  }
}

// 全局单例
export const tabPanelManager = new TabPanelManagerImpl();
