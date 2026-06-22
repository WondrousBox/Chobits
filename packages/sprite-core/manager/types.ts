import type { PersonaState } from '../persona-state';
import type { SpritePurposeRoutinePlanner } from '../purpose';
import type { SpriteWindowAnimationPlayPosition } from '../types';

// ============================================================================
// 主进程调度器抽象（由 Electron main 注入，避免 sprite-core 反向依赖 Electron）
// ============================================================================

export type SpriteSchedulerRunTrigger = 'scheduled' | 'manual' | 'event' | 'misfire';

export type SpriteSchedulerScheduleSpec = { kind: 'interval'; everyMs: number } | { kind: 'randomInterval'; minMs: number; maxMs: number };

export interface SpriteSchedulerJobDefinition<TPayload = unknown> {
  id: string;
  owner: string;
  name: string;
  enabled: boolean;
  schedule: SpriteSchedulerScheduleSpec;
  payload?: TPayload;
  runPolicy?: {
    singletonKey?: string;
    maxConcurrent?: number;
    misfire?: 'skip' | 'run-once' | 'catch-up';
  };
  admission?: {
    customGate?: string;
  };
}

export type SpriteSchedulerRuntimeJob<TPayload = unknown> = Omit<SpriteSchedulerJobDefinition<TPayload>, 'schedule'> & {
  schedule: unknown;
};

export interface SpriteSchedulerRunContext<TPayload = unknown> {
  job: SpriteSchedulerRuntimeJob<TPayload>;
  payload: TPayload | undefined;
  scheduledFor: number;
  triggeredAt: number;
  trigger: SpriteSchedulerRunTrigger;
  force?: boolean;
}

export interface SpriteSchedulerGateContext<TPayload = unknown> {
  job: SpriteSchedulerRuntimeJob<TPayload>;
  payload: TPayload | undefined;
  scheduledFor: number;
  triggeredAt: number;
}

export type SpriteSchedulerGateResult = boolean | { accepted: boolean; reason?: string };

export type SpriteSchedulerJobHandlerResult = void | { status: 'success' | 'skipped' | 'failed'; reason?: string; error?: string };

export interface SpriteBehaviorScheduler {
  registerHandler<TPayload = unknown>(owner: string, handler: (context: SpriteSchedulerRunContext<TPayload>) => SpriteSchedulerJobHandlerResult | Promise<SpriteSchedulerJobHandlerResult>): () => void;
  registerGate<TPayload = unknown>(id: string, handler: (context: SpriteSchedulerGateContext<TPayload>) => SpriteSchedulerGateResult | Promise<SpriteSchedulerGateResult>): () => void;
  upsert<TPayload = unknown>(definition: SpriteSchedulerJobDefinition<TPayload>): unknown;
  remove(id: string): boolean;
  start(): void;
}

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

export interface SpritePurposeWindowAdapter {
  open(windowKey: string, payload?: Record<string, unknown>): Promise<void> | void;
  close?(windowKey: string): Promise<void> | void;
  getBounds?(windowKey: string): { x: number; y: number; width: number; height: number } | null;
}

export interface SpriteWindowAnimationPlaybackSize {
  width?: number;
  height?: number;
  padding?: number;
}

export interface SpriteWindowAnimationAdapter {
  playPreset(config: {
    presetId?: string;
    direction?: string;
    duration?: number;
    target?: string;
    playPosition?: SpriteWindowAnimationPlayPosition;
    playbackSize?: SpriteWindowAnimationPlaybackSize;
  }): Promise<void> | void;
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
  /** Adapter injected by Electron main for Purpose/Routine window actions. */
  purposeWindowAdapter?: SpritePurposeWindowAdapter;
  /** Adapter injected by Electron main for sprite animation triggered window presets. */
  windowAnimationAdapter?: SpriteWindowAnimationAdapter;
  /** Optional planner hook that can replace preset routines with validated AI routines. */
  purposeRoutinePlanner?: SpritePurposeRoutinePlanner;
  /** Shared main-process scheduler for autonomous sprite behaviors. */
  behaviorScheduler?: SpriteBehaviorScheduler;
  /** Suppresses autonomous chatter while a blocking onboarding flow needs focus. */
  shouldSuppressAmbientMessages?: (context: SpriteAmbientMessageContext) => boolean;
  /** 额外接收 `app:message:bridge` 广播的窗口，主要用于独立气泡窗口同步气泡消息。 */
  getMessageRecipients?: () => Array<SpriteWindow | null | undefined>;
  /** 发送消息前可异步确保目标消息窗口已创建并完成基础初始化。 */
  ensureMessageRecipients?: () => Promise<void> | void;
  /**
   * 额外接收 `sprite:config` 广播的窗口。
   * 主要用于独立气泡、特效等跟随窗口同步配置开关。
   */
  getConfigRecipients?: () => Array<SpriteWindow | null | undefined>;
}

export type SpriteAmbientMessageContext = 'behavior' | 'welcome' | 'interaction';

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
  recommendedAction?: string;
  actionSource?: SpriteSpontaneousUtteranceActionSource;
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
  claimedRewards?: PersonaState['claimedRewards'];
  createdAt: PersonaState['createdAt'];
  updatedAt: PersonaState['updatedAt'];
}
