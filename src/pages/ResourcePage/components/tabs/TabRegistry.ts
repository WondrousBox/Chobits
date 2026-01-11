import type { TabComponent, TabRegistry as ITabRegistry } from './types';

/**
 * Tab 组件注册表实现
 */
class TabRegistryImpl implements ITabRegistry {
  private tabs = new Map<string, TabComponent>();

  register(tab: TabComponent): void {
    if (this.tabs.has(tab.id)) {
      console.warn(`Tab component with id "${tab.id}" is already registered. Overwriting...`);
    }
    this.tabs.set(tab.id, tab);
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
}

// 全局单例
export const tabRegistry = new TabRegistryImpl();
