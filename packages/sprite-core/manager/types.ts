import type { PersonaState } from '../persona-state';

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
  /** AI 自发说话执行器（可选） */
  spontaneousUtteranceExecutor?: SpriteSpontaneousUtteranceExecutor;
}

export interface SpriteSpontaneousUtteranceRequest {
  behaviorId: string;
  triggeredAt: number;
  actionCandidates: string[];
  sprite: {
    state: string;
    mood: PersonaState['mood'];
    moodIntensity: number;
    favor: number;
    level: number;
    idleDurationMs: number;
  };
}

export interface SpriteSpontaneousUtteranceResult {
  text: string;
  intentCategory?: string;
  tone?: string;
  emotion?: string;
  recommendedAction?: string;
  bubbleDurationMs?: number;
  whyThisFits?: string;
}

export interface SpriteSpontaneousUtteranceExecutor {
  generateForIdleAction(input: SpriteSpontaneousUtteranceRequest): Promise<SpriteSpontaneousUtteranceResult | null>;
}

/** 人格状态持久化快照（JSON 文件） */
export interface PersonaStatePersistenceRow {
  id: string;
  version: 2;
  name: PersonaState['name'];
  description?: PersonaState['description'];
  xp: PersonaState['xp'];
  level: PersonaState['level'];
  favor: PersonaState['favor'];
  mood: PersonaState['mood'];
  moodIntensity: PersonaState['moodIntensity'];
  totalInteractions: PersonaState['totalInteractions'];
  totalSessionTime: PersonaState['totalSessionTime'];
  loginStreak: PersonaState['loginStreak'];
  lastLoginDate: PersonaState['lastLoginDate'];
  achievements: PersonaState['achievements'];
  dimensions: PersonaState['dimensions'];
  createdAt: PersonaState['createdAt'];
  updatedAt: PersonaState['updatedAt'];
}
