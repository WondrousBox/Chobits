// ============================================================================
// 平台抽象接口（由 Electron main process 注入）
// ============================================================================

/** BrowserWindow 的最小接口 */
export interface SpriteWindow {
  webContents: {
    send(channel: string, ...args: any[]): void;
  };
  getBounds(): { x: number; y: number; width: number; height: number };
  setPosition(x: number, y: number, animate?: boolean): void;
  setSize(width: number, height: number, animate?: boolean): void;
  isDestroyed(): boolean;
}

/** SpriteManager 初始化选项 */
export interface SpriteManagerOptions {
  /** 主窗口 */
  win: SpriteWindow;
  /** 用户数据目录（用于持久化），通常为 app.getPath('userData') */
  dataDir: string;
  /** 获取主屏幕工作区尺寸 */
  getScreenSize: () => { width: number; height: number };
  /** 应用名称 */
  appName?: string;
}

/** 持久化状态行 */
export interface PersonaStatePersistenceRow {
  id: string;
  name: string;
  description?: string;
  xp: number;
  level: number;
  favor: number;
  mood: string;
  moodIntensity: number;
  totalInteractions: number;
  totalSessionTime: number;
  loginStreak: number;
  lastLoginDate: string;
  achievements: string;
  createdAt: number;
  updatedAt: number;
}
