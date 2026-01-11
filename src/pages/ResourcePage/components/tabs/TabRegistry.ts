import type { TabComponent, TabRegistry as ITabRegistry, TabRegistryEvent, TabRegistryEventListener } from './types';

/**
 * Tab 组件注册表实现
 */
class TabRegistryImpl implements ITabRegistry {
  private tabs = new Map<string, TabComponent>();
  private enabledTabs = new Set<string>(); // 默认所有 tab 都是启用的
  private tabOrder: string[] = []; // Tab 显示顺序
  private listeners = new Set<TabRegistryEventListener>();

  register(tab: TabComponent): void {
    const wasRegistered = this.tabs.has(tab.id);
    this.tabs.set(tab.id, tab);

    // 新注册的 tab 默认启用，并添加到顺序列表末尾
    if (!wasRegistered) {
      this.enabledTabs.add(tab.id);
      this.tabOrder.push(tab.id);
    }

    this.emit({ type: 'register', tabId: tab.id, tab });
  }

  unregister(id: string): void {
    const tab = this.tabs.get(id);
    if (tab) {
      this.tabs.delete(id);
      this.enabledTabs.delete(id);
      // 从顺序列表中移除
      this.tabOrder = this.tabOrder.filter((tabId) => tabId !== id);
      this.emit({ type: 'unregister', tabId: id, tab });
    }
  }

  get(id: string): TabComponent | undefined {
    return this.tabs.get(id);
  }

  getAll(): TabComponent[] {
    return Array.from(this.tabs.values());
  }

  has(id: string): boolean {
    return this.tabs.has(id);
  }

  enable(id: string): void {
    if (this.tabs.has(id) && !this.enabledTabs.has(id)) {
      this.enabledTabs.add(id);
      this.emit({ type: 'enable', tabId: id, tab: this.tabs.get(id) });
    }
  }

  disable(id: string): void {
    if (this.enabledTabs.has(id)) {
      this.enabledTabs.delete(id);
      this.emit({ type: 'disable', tabId: id, tab: this.tabs.get(id) });
    }
  }

  isEnabled(id: string): boolean {
    return this.enabledTabs.has(id);
  }

  getEnabled(): TabComponent[] {
    // 按照保存的顺序返回启用的 tab
    return this.tabOrder.map((id) => this.tabs.get(id)).filter((tab): tab is TabComponent => tab !== undefined && this.enabledTabs.has(tab.id));
  }

  private readonly STORAGE_KEY = 'resource-tab-order';

  /**
   * 设置 tab 顺序
   */
  setOrder(orderedIds: string[]): void {
    // 只保留已注册的 tab ID，并添加新注册但不在列表中的 tab
    const validIds = orderedIds.filter((id) => this.tabs.has(id));
    const missingIds = this.tabOrder.filter((id) => !orderedIds.includes(id) && this.tabs.has(id));
    this.tabOrder = [...validIds, ...missingIds];

    // 持久化到 localStorage
    this.saveOrder();

    // 触发 reorder 事件通知 UI 更新
    this.emit({ type: 'reorder', tabId: '' });
  }

  /**
   * 保存顺序到 localStorage
   */
  private saveOrder(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.tabOrder));
    } catch {
      // 忽略存储失败
    }
  }

  /**
   * 从 localStorage 加载顺序
   */
  loadOrder(): void {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        const savedOrder = JSON.parse(saved) as string[];
        // 合并保存的顺序和当前注册的 tab
        const validIds = savedOrder.filter((id) => this.tabs.has(id));
        const newIds = this.tabOrder.filter((id) => !savedOrder.includes(id));
        this.tabOrder = [...validIds, ...newIds];
      }
    } catch {
      // 忽略加载失败
    }
  }

  /**
   * 获取当前 tab 顺序
   */
  getOrder(): string[] {
    return [...this.tabOrder];
  }

  addEventListener(listener: TabRegistryEventListener): () => void {
    this.listeners.add(listener);
    return () => this.removeEventListener(listener);
  }

  removeEventListener(listener: TabRegistryEventListener): void {
    this.listeners.delete(listener);
  }

  private emit(event: TabRegistryEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in tab registry event listener:', error);
      }
    });
  }
}

// 全局单例
export const tabRegistry = new TabRegistryImpl();
