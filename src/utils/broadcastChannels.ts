/**
 * BroadcastChannel 管理器
 * 统一管理跨窗口通信的 channel 实例，避免频繁创建/销毁导致的内存泄漏
 */

// 偏好设置消息类型
export type PreferencesMessage = {
  type: 'previewModeChanged';
  previewMode: 'window' | 'panel';
};

// 媒体播放同步消息类型
export type MediaSyncMessage =
  | {
      type: 'playbackProgress';
      resourceId: string;
      currentTime: number;
    }
  | {
      type: 'playStarted';
      source: 'window' | 'panel';
      resourceId: string;
    }
  | {
      type: 'pause';
      source: 'window' | 'panel';
      resourceId: string;
    }
  | {
      type: 'stop';
      source: 'window' | 'panel';
      resourceId: string;
    };

// 工作流事件消息类型
export type WorkflowEventMessage =
  | {
      type: 'definition-upserted';
      def?: unknown;
      id?: string;
    }
  | {
      type: 'run-started';
      defId: string;
      resourceId?: string;
    };

// Channel 名称常量
export const CHANNEL_NAMES = {
  PREFERENCES: 'preferences',
  MEDIA_SYNC: 'media-playback-sync',
  WF_EVENTS: 'wf-events'
} as const;

type ChannelName = (typeof CHANNEL_NAMES)[keyof typeof CHANNEL_NAMES];

/**
 * BroadcastChannel 管理器
 * 使用单例模式管理 channel 实例
 */
class BroadcastChannelManagerClass {
  private channels = new Map<string, BroadcastChannel>();
  private refCounts = new Map<string, number>();

  /**
   * 获取或创建 channel 实例
   * 使用引用计数管理生命周期
   */
  acquire(name: ChannelName): BroadcastChannel {
    if (!this.channels.has(name)) {
      this.channels.set(name, new BroadcastChannel(name));
      this.refCounts.set(name, 0);
    }
    this.refCounts.set(name, (this.refCounts.get(name) || 0) + 1);
    return this.channels.get(name)!;
  }

  /**
   * 释放 channel 引用
   * 当引用计数归零时关闭 channel
   */
  release(name: ChannelName): void {
    const count = (this.refCounts.get(name) || 0) - 1;
    if (count <= 0) {
      const channel = this.channels.get(name);
      if (channel) {
        channel.close();
        this.channels.delete(name);
        this.refCounts.delete(name);
      }
    } else {
      this.refCounts.set(name, count);
    }
  }

  /**
   * 发送消息（一次性，不需要持有引用）
   * 适用于只需要发送消息而不需要监听的场景
   */
  postMessage(name: ChannelName, message: PreferencesMessage | MediaSyncMessage | WorkflowEventMessage): void {
    const channel = this.acquire(name);
    channel.postMessage(message);
    this.release(name);
  }

  /**
   * 关闭所有 channel
   * 通常在应用退出时调用
   */
  closeAll(): void {
    this.channels.forEach((channel) => channel.close());
    this.channels.clear();
    this.refCounts.clear();
  }
}

// 导出单例实例
export const BroadcastChannelManager = new BroadcastChannelManagerClass();
