/**
 * 推送卡片工具上下文管理器
 *
 * 提供一个全局的方式来管理推送卡片工具所需的依赖
 * 这样工具在执行时可以访问到 conversationId 等必要的上下文
 */

/**
 * 推送卡片工具执行上下文
 */
export interface PushCardToolExecutionContext {
  /** 当前会话 ID */
  conversationId?: string;
  /** 目标窗口 ID */
  targetWindowId?: number;
}

/**
 * 推送卡片工具上下文管理器
 */
class PushCardToolContextManager {
  private currentContext: PushCardToolExecutionContext | null = null;

  /**
   * 设置当前执行上下文
   */
  setContext(context: PushCardToolExecutionContext): void {
    this.currentContext = context;
  }

  /**
   * 获取当前执行上下文
   */
  getContext(): PushCardToolExecutionContext | null {
    return this.currentContext;
  }

  /**
   * 清除上下文
   */
  clearContext(): void {
    this.currentContext = null;
  }

  /**
   * 在上下文中执行函数
   * 自动设置和清理上下文
   */
  async withContext<T>(context: PushCardToolExecutionContext, fn: () => Promise<T>): Promise<T> {
    this.setContext(context);
    try {
      return await fn();
    } finally {
      this.clearContext();
    }
  }
}

/**
 * 全局单例实例
 */
export const pushCardToolContext = new PushCardToolContextManager();
