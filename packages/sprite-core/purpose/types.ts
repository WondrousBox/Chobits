import type { SpriteAnimationTrigger } from '../types';

export type SpritePurposeSource = 'behavior' | 'user-event' | 'system-event' | 'app-event' | 'ai' | 'manual';

export type SpritePurposeStatus = 'queued' | 'active' | 'paused' | 'completed' | 'cancelled' | 'superseded' | 'failed' | 'rejected';

export type SpritePurposeInterruptPolicy = 'never' | 'cooperative' | 'interruptible' | 'urgent';

export type SpriteRoutineSource = 'preset' | 'ai' | 'system' | 'user';

export type SpriteRoutineStatus = 'queued' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';

export type SpritePurposeRuntimeEventSource = 'sprite-event-bus' | 'app-event' | 'purpose-event';

export interface SpritePurposeRuntimeEvent {
  source: SpritePurposeRuntimeEventSource;
  event: string;
  payload?: Record<string, unknown>;
  timestamp: number;
  purposeId?: string;
  routineId?: string;
  correlationId?: string;
}

export type SpritePurposeRuntimeEventInput = Omit<SpritePurposeRuntimeEvent, 'timestamp' | 'source'> & {
  source?: SpritePurposeRuntimeEventSource;
  timestamp?: number;
};

export interface StartSpritePurposeRequest {
  kind: string;
  reason: string;
  source: SpritePurposeSource;
  title?: string;
  priority?: number;
  interruptPolicy?: SpritePurposeInterruptPolicy;
  presetId?: string;
  context?: Record<string, unknown>;
  correlationId?: string;
  coalesceKey?: string;
  /** Fixed routines such as onboarding quests can force preset execution and bypass the AI routine planner. */
  plannerMode?: 'auto' | 'preset-only';
}

export interface SpritePurpose {
  id: string;
  kind: string;
  title: string;
  reason: string;
  source: SpritePurposeSource;
  status: SpritePurposeStatus;
  priority: number;
  interruptPolicy: SpritePurposeInterruptPolicy;
  presetId?: string;
  correlationId?: string;
  coalesceKey?: string;
  startedAt?: number;
  endedAt?: number;
  parentPurposeId?: string;
  supersededBy?: string;
  context?: Record<string, unknown>;
  expectedOutcome?: string;
  plannerMode?: 'auto' | 'preset-only';
}

export type SpriteRoutineStep =
  | {
    id: string;
    type: 'playAnimation';
    trigger?: SpriteAnimationTrigger;
    animationId?: string;
    durationMs?: number;
    waitFor?: 'complete' | 'duration' | 'none';
    silent?: boolean;
    timeoutMs?: number;
    interruptible?: boolean;
  }
  | {
    id: string;
    type: 'walkTo';
    target:
      | 'center'
      | 'corner'
      | 'previous'
      | { x: number; y: number }
      | {
          window: string;
          placement?: 'left' | 'right' | 'top' | 'bottom' | 'center';
          offset?: number;
        };
    speed?: number;
    timeoutMs?: number;
    interruptible?: boolean;
  }
  | { id: string; type: 'wait'; durationMs: number; interruptible?: boolean }
  | {
    id: string;
    type: 'waitForEvent';
    event: string;
    source?: SpritePurposeRuntimeEventSource;
    timeoutMs?: number;
    match?: Record<string, unknown>;
    assignTo?: string;
    optional?: boolean;
    ignoreHistory?: boolean;
    interruptible?: boolean;
  }
  | { id: string; type: 'speak'; text: string; bubbleDuration?: number; timeoutMs?: number; cooldownMs?: number; cooldownKey?: string }
  | { id: string; type: 'showToast'; content?: string; category?: string; duration?: number }
  | {
    id: string;
    type: 'showNotice';
    messageId?: string;
    content: string;
    level?: 'info' | 'success' | 'warning' | 'error';
    /** 按钮：button.action 以 'purpose:' 开头时点击会派发 purpose-event 'bubble:action' */
    buttons?: Array<{
      id: string;
      label: string;
      variant?: 'default' | 'secondary' | 'destructive';
      /** 点击后触发 purpose-event 的 action 标识（不填则只关闭气泡） */
      purposeAction?: string;
    }>;
    duration?: number;
    persistent?: boolean;
    /** 用于按钮回填 routineId 的关联键，会作为 routineId 透传给消息层 */
    routineId?: string;
    cooldownMs?: number;
    cooldownKey?: string;
    speak?: boolean;
  }
  | { id: string; type: 'clearMessage'; messageType?: 'toast' | 'notice' | 'busy' | 'all'; messageId?: string }
  | { id: string; type: 'showBusy'; content?: string; progress?: number }
  | { id: string; type: 'updateBusy'; content?: string; progress?: number; contentFrom?: string; progressFrom?: string }
  | { id: string; type: 'clearBusy' }
  | {
    id: string;
    type: 'openWindow';
    window: string;
    payload?: Record<string, unknown>;
    waitForEvent?: string;
    eventSource?: SpritePurposeRuntimeEventSource;
    match?: Record<string, unknown>;
    timeoutMs?: number;
    assignTo?: string;
    interruptible?: boolean;
  }
  | {
    id: string;
    type: 'loopUntil';
    untilEvent: string | string[];
    source?: SpritePurposeRuntimeEventSource;
    match?: Record<string, unknown>;
    ignoreHistory?: boolean;
    body: SpriteRoutineStep[];
    maxDurationMs?: number;
    assignTo?: string;
    interruptible?: boolean;
  }
  | {
    id: string;
    type: 'branch';
    by: string;
    cases: Record<string, SpriteRoutineStep[]>;
    default?: SpriteRoutineStep[];
    interruptible?: boolean;
  };

export interface SpriteRoutine {
  id: string;
  purposeId: string;
  presetId?: string;
  priority?: number;
  source: SpriteRoutineSource;
  status: SpriteRoutineStatus;
  steps: SpriteRoutineStep[];
  cursor: number;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
}

export interface SpriteRoutineStepResult {
  ok: boolean;
  status: 'completed' | 'timeout' | 'cancelled' | 'failed' | 'skipped';
  stepId: string;
  value?: unknown;
  error?: string;
  elapsedMs: number;
}

export interface SpriteRoutineRunResult {
  ok: boolean;
  status: 'completed' | 'cancelled' | 'failed';
  purposeId: string;
  routineId: string;
  currentStepId?: string;
  error?: string;
  elapsedMs: number;
  steps: SpriteRoutineStepResult[];
}

export interface SpritePurposeStartResult {
  accepted: boolean;
  purpose: SpritePurpose;
  routine?: SpriteRoutine;
  status: 'started' | 'queued' | 'coalesced' | 'rejected' | 'superseded';
  reason?: string;
}

export interface SpritePurposeSnapshot {
  current: SpritePurpose | null;
  routine: SpriteRoutine | null;
  queue: SpritePurpose[];
}

export type SpritePurposeEventType =
  | 'purpose:created'
  | 'purpose:started'
  | 'purpose:completed'
  | 'purpose:cancelled'
  | 'purpose:coalesced'
  | 'purpose:rejected'
  | 'purpose:superseded'
  | 'purpose:failed'
  | 'planner:planned'
  | 'planner:fallback'
  | 'routine:started'
  | 'routine:completed'
  | 'routine:cancelled'
  | 'routine:failed'
  | 'step:started'
  | 'step:completed'
  | 'step:timeout'
  | 'step:cancelled'
  | 'step:skipped'
  | 'step:failed';

export interface SpritePurposeHistoryEntry {
  timestamp: number;
  eventType: SpritePurposeEventType;
  purposeId: string;
  routineId?: string;
  stepId?: string;
  purposeKind?: string;
  priority?: number;
  source?: SpritePurposeSource | SpriteRoutineSource;
  status?: string;
  summary?: string;
  contextDigest?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
}

export interface SpritePurposeHistoryWriter {
  append(entry: SpritePurposeHistoryEntry): void | Promise<void>;
}

export interface SpritePurposeHistoryReader {
  list(query?: SpritePurposeHistoryQuery): Promise<SpritePurposeHistoryEntry[]>;
}

export interface SpritePurposeHistoryQuery {
  limit?: number;
  kind?: string;
  status?: SpritePurposeStatus | 'all';
  eventType?: SpritePurposeEventType | SpritePurposeEventType[];
  date?: string;
  since?: number;
  until?: number;
}

export interface SpritePurposeRetrospectiveItem {
  purposeId: string;
  purposeKind: string;
  status: string;
  source?: SpritePurposeSource | SpriteRoutineSource;
  priority?: number;
  startedAt?: number;
  endedAt: number;
  durationMs?: number;
  summary?: string;
  outcome: string;
  stepCount: number;
  completedStepIds: string[];
  failedStepIds: string[];
  plannerFallbackReason?: string;
  memoryWorthiness: number;
  memoryCandidate: boolean;
  recallCue?: string;
}

export interface SpritePurposeDailyRetrospective {
  date: string;
  generatedAt: number;
  totalPurposeCount: number;
  terminalPurposeCount: number;
  completedCount: number;
  cancelledCount: number;
  failedCount: number;
  kindCounts: Record<string, number>;
  memoryCandidateCount: number;
  recallCues: string[];
  items: SpritePurposeRetrospectiveItem[];
}

export interface SpritePurposeRetrospectiveQuery {
  date?: string;
  limit?: number;
  includeIdle?: boolean;
  minMemoryWorthiness?: number;
}
