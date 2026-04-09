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
  fallbackAction: string;
  sprite: {
    state: string;
    mood: PersonaState['mood'];
    moodIntensity: number;
    favor: number;
    level: number;
    idleDurationMs: number;
  };
}

export interface SpriteSpontaneousUtteranceDelivery {
  pace?: 'slow' | 'steady' | 'brisk';
  energy?: 'soft' | 'light' | 'lifted' | 'grounded';
  pauseHint?: 'none' | 'minor' | 'breath';
}

export type SpriteSpontaneousUtteranceActionSource = 'model' | 'style-map' | 'random-fallback';
export type SpriteSpontaneousUtteranceIntentCategory = 'philosophy' | 'encouragement' | 'playful' | 'reminder' | 'planning' | 'empathy' | 'reflection';
export type SpriteSpontaneousUtteranceTonePreference = 'auto' | 'gentle' | 'playful' | 'calm' | 'firm' | 'curious' | 'tender';
export type SpriteSpontaneousUtteranceHistoryStatus = 'spoken' | 'generated' | 'skipped' | 'failed';

export interface SpriteSpontaneousUtterancePreferences {
  enabled: boolean;
  cooldownMinutes: number;
  dailyLimit: number;
  preferredTone: SpriteSpontaneousUtteranceTonePreference;
  allowedIntentCategories: SpriteSpontaneousUtteranceIntentCategory[];
}

export interface SpriteSpontaneousUtteranceHistoryQuery {
  workspaceId?: string;
  limit?: number;
  query?: string;
  status?: SpriteSpontaneousUtteranceHistoryStatus | 'all';
  intentCategory?: SpriteSpontaneousUtteranceIntentCategory | 'all';
}

export interface SpriteSpontaneousUtteranceHistoryItem {
  utteranceId?: string;
  timestamp: number;
  workspaceId?: string;
  conversationId?: string;
  behaviorId?: string;
  status: SpriteSpontaneousUtteranceHistoryStatus;
  text?: string;
  intentCategory?: SpriteSpontaneousUtteranceIntentCategory;
  tone?: string;
  emotion?: string;
  delivery?: SpriteSpontaneousUtteranceDelivery;
  bubbleDurationMs?: number;
  whyThisFits?: string;
  executedAction?: string;
  fallbackAction?: string;
  actionSource?: SpriteSpontaneousUtteranceActionSource;
  spoken?: boolean;
  fallbackUsed?: boolean;
  skipped?: boolean;
  reason?: string;
  triggerReason?: string;
  providerId?: string;
  providerPresetId?: string;
  model?: string;
  latencyMs?: number;
}

export interface SpriteSpontaneousUtteranceResult {
  /** 关联生成与执行日志的内部 ID */
  utteranceId?: string;
  text: string;
  intentCategory?: string;
  tone?: string;
  emotion?: string;
  delivery?: SpriteSpontaneousUtteranceDelivery;
  recommendedAction?: string;
  actionSource?: SpriteSpontaneousUtteranceActionSource;
  bubbleDurationMs?: number;
  whyThisFits?: string;
}

export interface SpriteSpontaneousUtteranceExecutionReport {
  utteranceId?: string;
  behaviorId: string;
  triggeredAt: number;
  text?: string;
  intentCategory?: string;
  tone?: string;
  emotion?: string;
  delivery?: SpriteSpontaneousUtteranceDelivery;
  bubbleDurationMs?: number;
  whyThisFits?: string;
  executedAction: string;
  actionSource: SpriteSpontaneousUtteranceActionSource;
  spoken: boolean;
  fallbackUsed: boolean;
  error?: string;
}

export interface SpriteSpontaneousUtteranceExecutor {
  generateForIdleAction(input: SpriteSpontaneousUtteranceRequest): Promise<SpriteSpontaneousUtteranceResult | null>;
  reportIdleActionExecution?(report: SpriteSpontaneousUtteranceExecutionReport): Promise<void>;
  getSpontaneousUtterancePreferences?(): Promise<SpriteSpontaneousUtterancePreferences>;
  updateSpontaneousUtterancePreferences?(patch: Partial<SpriteSpontaneousUtterancePreferences>): Promise<SpriteSpontaneousUtterancePreferences>;
  listSpontaneousUtterances?(query?: SpriteSpontaneousUtteranceHistoryQuery): Promise<SpriteSpontaneousUtteranceHistoryItem[]>;
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
