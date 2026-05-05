export interface SchedulerTimeWindow {
  start: string; // HH:mm
  end: string; // HH:mm
}

export interface CronScheduleSpec {
  kind: 'cron';
  expression: string;
  timezone?: string;
}

export interface DateScheduleSpec {
  kind: 'date';
  at: number;
  timezone?: string;
}

export interface IntervalScheduleSpec {
  kind: 'interval';
  everyMs: number;
  window?: SchedulerTimeWindow;
  daysOfWeek?: number[];
}

export interface RandomIntervalScheduleSpec {
  kind: 'randomInterval';
  minMs: number;
  maxMs: number;
  window?: SchedulerTimeWindow;
  daysOfWeek?: number[];
}

export interface ManualScheduleSpec {
  kind: 'manual';
}

export interface EventScheduleSpec {
  kind: 'event';
  eventType: string;
}

export type ScheduleSpec = CronScheduleSpec | DateScheduleSpec | IntervalScheduleSpec | RandomIntervalScheduleSpec | ManualScheduleSpec | EventScheduleSpec;

export type SchedulerMisfirePolicy = 'skip' | 'run-once' | 'catch-up';

export interface SchedulerRunPolicy {
  singletonKey?: string;
  cooldownMs?: number;
  dailyLimit?: number;
  maxConcurrent?: number;
  misfire?: SchedulerMisfirePolicy;
  retry?: {
    maxAttempts: number;
    backoffMs: number;
  };
}

export interface SchedulerAdmissionPolicy {
  customGate?: string;
}

export interface SchedulerJobDefinition<TPayload = unknown> {
  id: string;
  owner: string;
  name: string;
  enabled: boolean;
  schedule: ScheduleSpec;
  payload?: TPayload;
  runPolicy?: SchedulerRunPolicy;
  admission?: SchedulerAdmissionPolicy;
}

export type SchedulerRunTrigger = 'scheduled' | 'manual' | 'event' | 'misfire';

export interface SchedulerRunContext<TPayload = unknown> {
  job: SchedulerJobDefinition<TPayload>;
  payload: TPayload | undefined;
  scheduledFor: number;
  triggeredAt: number;
  trigger: SchedulerRunTrigger;
  force?: boolean;
}

export type SchedulerJobHandlerResult = void | { status: SchedulerLastStatus; reason?: string; error?: string };

export type SchedulerJobHandler<TPayload = unknown> = (context: SchedulerRunContext<TPayload>) => SchedulerJobHandlerResult | Promise<SchedulerJobHandlerResult>;

export interface SchedulerTriggerNowOptions {
  force?: boolean;
}

export interface SchedulerAdHocRunOptions<TPayload = unknown> {
  trigger?: SchedulerRunTrigger;
  payload?: TPayload;
  scheduledFor?: number;
  force?: boolean;
}

export interface SchedulerGateContext<TPayload = unknown> {
  job: SchedulerJobDefinition<TPayload>;
  payload: TPayload | undefined;
  scheduledFor: number;
  triggeredAt: number;
  force?: boolean;
}

export type SchedulerGateResult = boolean | { accepted: boolean; reason?: string };
export type SchedulerGateHandler<TPayload = unknown> = (context: SchedulerGateContext<TPayload>) => SchedulerGateResult | Promise<SchedulerGateResult>;

export type SchedulerLastStatus = 'success' | 'skipped' | 'failed';

export interface SchedulerRuntimeState {
  jobId: string;
  owner: string;
  enabled: boolean;
  paused?: boolean;
  pausedAt?: number;
  pauseReason?: string;
  lastRunAt?: number;
  lastFinishedAt?: number;
  nextRunAt?: number;
  lastStatus?: SchedulerLastStatus;
  lastSkipReason?: string;
  lastError?: string;
  dailyRunCount?: number;
  dailyResetDate?: string;
  consecutiveFailures?: number;
  updatedAt: number;
}

export interface SchedulerJobSnapshot<TPayload = unknown> {
  definition: SchedulerJobDefinition<TPayload>;
  runtime: SchedulerRuntimeState;
  active: boolean;
  runningCount: number;
  paused: boolean;
  pausedByOwner: boolean;
  pauseReason?: string;
}

export interface SchedulerStateStore {
  load(): Record<string, SchedulerRuntimeState>;
  save(state: Record<string, SchedulerRuntimeState>): void;
  loadOwnerPauseState?(): Record<string, SchedulerOwnerPauseState>;
  saveOwnerPauseState?(state: Record<string, SchedulerOwnerPauseState>): void;
}

export interface SchedulerOwnerPauseState {
  owner: string;
  paused: boolean;
  pausedAt: number;
  pauseReason?: string;
  updatedAt: number;
}

export type SchedulerAuditEventType = 'run' | 'control';
export type SchedulerAuditStatus = SchedulerLastStatus | 'paused' | 'resumed';
export type SchedulerControlAction = 'pause-job' | 'resume-job' | 'pause-owner' | 'resume-owner';

export interface SchedulerAuditLogEntry {
  id: string;
  eventType: SchedulerAuditEventType;
  owner: string;
  jobId?: string;
  jobName?: string;
  action?: SchedulerControlAction;
  trigger?: SchedulerRunTrigger;
  force?: boolean;
  scheduledFor?: number;
  startedAt: number;
  finishedAt: number;
  status: SchedulerAuditStatus;
  reason?: string;
  error?: string;
}

export interface SchedulerAuditLogQuery {
  jobId?: string;
  owner?: string;
  eventType?: SchedulerAuditEventType;
  status?: SchedulerAuditStatus;
  since?: number;
  until?: number;
  limit?: number;
}

export interface SchedulerAuditLogStore {
  append(entry: SchedulerAuditLogEntry): void;
  list(query?: SchedulerAuditLogQuery): SchedulerAuditLogEntry[];
  cleanup?(options?: SchedulerAuditLogCleanupOptions): SchedulerAuditLogCleanupResult;
}

export interface SchedulerAuditLogCleanupOptions {
  retentionDays?: number;
  maxFiles?: number;
  now?: number;
}

export interface SchedulerAuditLogCleanupResult {
  deletedFiles: string[];
}

export const SCHEDULER_UPDATED_CHANNEL = 'scheduler:updated';

export type SchedulerUpdateReason = 'jobs' | 'runtime' | 'control' | 'audit';

export interface SchedulerUpdatedEvent {
  reason: SchedulerUpdateReason;
  jobId?: string;
  owner?: string;
  at: number;
}
