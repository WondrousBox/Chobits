import schedule from 'node-schedule';

import { FileSchedulerAuditLogStore, FileSchedulerStateStore } from './storage';
import type {
  SchedulerAdHocRunOptions,
  SchedulerAuditLogCleanupOptions,
  SchedulerAuditLogCleanupResult,
  SchedulerAuditLogEntry,
  SchedulerAuditLogQuery,
  SchedulerAuditLogStore,
  SchedulerAuditStatus,
  SchedulerControlAction,
  SchedulerGateHandler,
  SchedulerJobDefinition,
  SchedulerJobHandler,
  SchedulerJobHandlerResult,
  SchedulerJobSnapshot,
  SchedulerOwnerPauseState,
  SchedulerRuntimeState,
  SchedulerRunTrigger,
  SchedulerStateStore,
  SchedulerTriggerNowOptions,
  SchedulerUpdatedEvent,
  SchedulerUpdateReason
} from './types';

type TimerHandle = ReturnType<typeof setTimeout>;

type ScheduledHandle = { kind: 'node'; job: schedule.Job } | { kind: 'timeout'; timer: TimerHandle };

interface SchedulerEntry<TPayload = unknown> {
  definition: SchedulerJobDefinition<TPayload>;
  handle: ScheduledHandle | null;
  runningCount: number;
}

export interface MainSchedulerServiceOptions {
  stateStore?: SchedulerStateStore;
  auditLogStore?: SchedulerAuditLogStore;
  auditLogCleanup?: SchedulerAuditLogCleanupOptions;
  now?: () => number;
  random?: () => number;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
  scheduleJob?: typeof schedule.scheduleJob;
}

const DEFAULT_MISFIRE = 'skip';

function todayKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function clampDelay(ms: number): number {
  return Math.max(0, Math.min(ms, 2_147_483_647));
}

export class MainSchedulerService {
  private readonly stateStore: SchedulerStateStore;
  private readonly auditLogStore: SchedulerAuditLogStore;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly scheduleTimeout: typeof globalThis.setTimeout;
  private readonly cancelTimeout: typeof globalThis.clearTimeout;
  private readonly scheduleNodeJob: typeof schedule.scheduleJob;
  private readonly entries = new Map<string, SchedulerEntry>();
  private readonly handlers = new Map<string, SchedulerJobHandler>();
  private readonly gateHandlers = new Map<string, SchedulerGateHandler>();
  private readonly changeListeners = new Set<(event: SchedulerUpdatedEvent) => void>();
  private readonly ownerPauseState = new Map<string, SchedulerOwnerPauseState>();
  private readonly runningSingletons = new Set<string>();
  private runtimeState: Record<string, SchedulerRuntimeState>;
  private started = false;
  private auditSequence = 0;

  constructor(options?: MainSchedulerServiceOptions) {
    this.stateStore = options?.stateStore ?? new FileSchedulerStateStore();
    this.auditLogStore = options?.auditLogStore ?? new FileSchedulerAuditLogStore();
    this.now = options?.now ?? (() => Date.now());
    this.random = options?.random ?? Math.random;
    this.scheduleTimeout = options?.setTimeout ?? globalThis.setTimeout;
    this.cancelTimeout = options?.clearTimeout ?? globalThis.clearTimeout;
    this.scheduleNodeJob = options?.scheduleJob ?? schedule.scheduleJob;
    this.runtimeState = this.stateStore.load();
    this.loadOwnerPauseState();
    this.auditLogStore.cleanup?.({ ...options?.auditLogCleanup, now: this.now() });
  }

  registerHandler<TPayload = unknown>(owner: string, handler: SchedulerJobHandler<TPayload>): () => void {
    this.handlers.set(owner, handler as SchedulerJobHandler);
    return () => {
      if (this.handlers.get(owner) === handler) {
        this.handlers.delete(owner);
      }
    };
  }

  registerGate<TPayload = unknown>(id: string, handler: SchedulerGateHandler<TPayload>): () => void {
    this.gateHandlers.set(id, handler as SchedulerGateHandler);
    return () => {
      if (this.gateHandlers.get(id) === handler) {
        this.gateHandlers.delete(id);
      }
    };
  }

  onChanged(listener: (event: SchedulerUpdatedEvent) => void): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  upsert<TPayload = unknown>(definition: SchedulerJobDefinition<TPayload>): SchedulerJobSnapshot<TPayload> {
    this.cancelJob(definition.id);
    const entry: SchedulerEntry<TPayload> = {
      definition,
      handle: null,
      runningCount: this.entries.get(definition.id)?.runningCount ?? 0
    };
    this.entries.set(definition.id, entry as SchedulerEntry);
    const state = this.ensureState(definition);
    state.enabled = definition.enabled;
    state.owner = definition.owner;
    state.updatedAt = this.now();

    if (!definition.enabled) {
      state.nextRunAt = undefined;
      this.persist();
      this.emitChanged('jobs', definition);
      return this.snapshotEntry(entry);
    }

    this.scheduleEntry(entry);
    this.persist();
    this.emitChanged('jobs', definition);
    return this.snapshotEntry(entry);
  }

  remove(id: string): boolean {
    const existed = this.entries.has(id) || Boolean(this.runtimeState[id]);
    this.cancelJob(id);
    this.entries.delete(id);
    delete this.runtimeState[id];
    this.persist();
    this.emitChanged('jobs', { id });
    return existed;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    for (const entry of this.entries.values()) {
      this.scheduleEntry(entry);
    }
    this.persist();
    this.emitChanged('jobs');
  }

  stop(): void {
    if (!this.started) return;
    for (const id of this.entries.keys()) {
      this.cancelJob(id);
    }
    this.started = false;
    this.emitChanged('jobs');
  }

  async triggerNow(id: string, options: SchedulerTriggerNowOptions = {}): Promise<SchedulerRuntimeState | null> {
    const entry = this.entries.get(id);
    if (!entry) return null;
    await this.runEntry(entry, this.now(), 'manual', undefined, { force: options.force === true });
    return this.runtimeState[id] ? { ...this.runtimeState[id] } : null;
  }

  async runAdHoc<TPayload = unknown>(definition: SchedulerJobDefinition<TPayload>, options: SchedulerAdHocRunOptions<TPayload> = {}): Promise<SchedulerRuntimeState> {
    let entry = this.entries.get(definition.id) as SchedulerEntry<TPayload> | undefined;
    if (entry) {
      entry.definition = {
        ...definition,
        schedule: entry.definition.schedule,
        payload: entry.definition.payload
      };
    } else {
      entry = {
        definition,
        handle: null,
        runningCount: 0
      };
      this.entries.set(definition.id, entry as SchedulerEntry);
    }

    const state = this.ensureState(entry.definition);
    state.enabled = definition.enabled;
    state.owner = definition.owner;
    state.updatedAt = this.now();
    await this.runEntry(entry, options.scheduledFor ?? this.now(), options.trigger ?? 'manual', options.payload, { force: options.force === true });
    return { ...this.ensureState(entry.definition) };
  }

  pauseJob(id: string, reason = 'manual-pause'): SchedulerJobSnapshot | null {
    const entry = this.entries.get(id);
    if (!entry) return null;

    const updatedAt = this.now();
    const state = this.ensureState(entry.definition);
    state.paused = true;
    state.pausedAt = updatedAt;
    state.pauseReason = reason;
    state.nextRunAt = undefined;
    state.updatedAt = updatedAt;
    this.cancelEntryHandle(entry);
    this.appendControlAudit(entry.definition, 'pause-job', 'paused', reason, updatedAt, updatedAt);
    this.persist();
    this.emitChanged('control', entry.definition);
    return this.snapshotEntry(entry);
  }

  resumeJob(id: string): SchedulerJobSnapshot | null {
    const entry = this.entries.get(id);
    if (!entry) return null;

    const updatedAt = this.now();
    const state = this.ensureState(entry.definition);
    const reason = state.pauseReason;
    state.paused = false;
    state.pausedAt = undefined;
    state.pauseReason = undefined;
    state.updatedAt = updatedAt;
    if (entry.definition.enabled && !this.isOwnerPaused(entry.definition.owner)) {
      this.scheduleEntry(entry);
    }
    this.appendControlAudit(entry.definition, 'resume-job', 'resumed', reason, updatedAt, this.now());
    this.persist();
    this.emitChanged('control', entry.definition);
    return this.snapshotEntry(entry);
  }

  pauseOwner(owner: string, reason = 'manual-pause'): SchedulerJobSnapshot[] {
    const updatedAt = this.now();
    this.ownerPauseState.set(owner, {
      owner,
      paused: true,
      pausedAt: updatedAt,
      pauseReason: reason,
      updatedAt
    });

    const snapshots: SchedulerJobSnapshot[] = [];
    for (const entry of this.entries.values()) {
      if (entry.definition.owner !== owner) continue;
      this.cancelEntryHandle(entry);
      const state = this.ensureState(entry.definition);
      state.nextRunAt = undefined;
      state.updatedAt = updatedAt;
      snapshots.push(this.snapshotEntry(entry));
    }

    this.appendOwnerControlAudit(owner, 'pause-owner', 'paused', reason, updatedAt, this.now());
    this.persist();
    this.emitChanged('control', { owner });
    return snapshots;
  }

  resumeOwner(owner: string): SchedulerJobSnapshot[] {
    const updatedAt = this.now();
    const previous = this.ownerPauseState.get(owner);
    this.ownerPauseState.delete(owner);

    const snapshots: SchedulerJobSnapshot[] = [];
    for (const entry of this.entries.values()) {
      if (entry.definition.owner !== owner) continue;
      if (entry.definition.enabled && !this.ensureState(entry.definition).paused) {
        this.scheduleEntry(entry);
      }
      snapshots.push(this.snapshotEntry(entry));
    }

    this.appendOwnerControlAudit(owner, 'resume-owner', 'resumed', previous?.pauseReason, updatedAt, this.now());
    this.persist();
    this.emitChanged('control', { owner });
    return snapshots;
  }

  getJob<TPayload = unknown>(id: string): SchedulerJobSnapshot<TPayload> | null {
    const entry = this.entries.get(id);
    return entry ? this.snapshotEntry(entry as SchedulerEntry<TPayload>) : null;
  }

  listJobs(): SchedulerJobSnapshot[] {
    return Array.from(this.entries.values()).map((entry) => this.snapshotEntry(entry));
  }

  getRuntimeState(): Record<string, SchedulerRuntimeState> {
    return Object.fromEntries(Object.entries(this.runtimeState).map(([key, value]) => [key, { ...value }]));
  }

  getOwnerPauseState(): Record<string, SchedulerOwnerPauseState> {
    return Object.fromEntries(Array.from(this.ownerPauseState.entries()).map(([key, value]) => [key, { ...value }]));
  }

  listAuditLog(query?: SchedulerAuditLogQuery): SchedulerAuditLogEntry[] {
    return this.auditLogStore.list(query);
  }

  cleanupAuditLog(options?: SchedulerAuditLogCleanupOptions): SchedulerAuditLogCleanupResult {
    const result = this.auditLogStore.cleanup?.({ ...options, now: options?.now ?? this.now() }) ?? { deletedFiles: [] };
    this.emitChanged('audit');
    return result;
  }

  private snapshotEntry<TPayload>(entry: SchedulerEntry<TPayload>): SchedulerJobSnapshot<TPayload> {
    const state = this.ensureState(entry.definition);
    const ownerPause = this.ownerPauseState.get(entry.definition.owner);
    const pausedByOwner = ownerPause?.paused === true;
    return {
      definition: entry.definition,
      runtime: { ...state },
      active: Boolean(entry.handle),
      runningCount: entry.runningCount,
      paused: state.paused === true || pausedByOwner,
      pausedByOwner,
      pauseReason: state.paused === true ? state.pauseReason : ownerPause?.pauseReason
    };
  }

  private ensureState(definition: SchedulerJobDefinition): SchedulerRuntimeState {
    const existing = this.runtimeState[definition.id];
    if (existing) return existing;

    const state: SchedulerRuntimeState = {
      jobId: definition.id,
      owner: definition.owner,
      enabled: definition.enabled,
      dailyRunCount: 0,
      dailyResetDate: todayKey(this.now()),
      consecutiveFailures: 0,
      updatedAt: this.now()
    };
    this.runtimeState[definition.id] = state;
    return state;
  }

  private scheduleEntry(entry: SchedulerEntry): void {
    if (!this.started || !entry.definition.enabled) return;
    this.cancelEntryHandle(entry);

    const state = this.ensureState(entry.definition);
    if (this.isEntryPaused(entry)) {
      state.nextRunAt = undefined;
      state.updatedAt = this.now();
      return;
    }

    const spec = entry.definition.schedule;
    if (spec.kind === 'manual' || spec.kind === 'event') {
      state.nextRunAt = undefined;
      state.updatedAt = this.now();
      return;
    }

    if (spec.kind === 'cron') {
      const cronSpec: schedule.Spec = spec.timezone ? { rule: spec.expression, tz: spec.timezone } : spec.expression;
      const job = this.scheduleNodeJob(cronSpec, async (fireDate) => {
        await this.runScheduled(entry.definition.id, fireDate.getTime(), 'scheduled');
      });
      if (job) {
        entry.handle = { kind: 'node', job };
        state.nextRunAt = this.getNodeJobNextRunAt(job);
        state.updatedAt = this.now();
      } else {
        state.nextRunAt = undefined;
        state.lastStatus = 'failed';
        state.lastError = 'invalid-cron';
        state.updatedAt = this.now();
      }
      return;
    }

    const nextRunAt = this.resolveNextRunAt(entry.definition, state);
    state.nextRunAt = nextRunAt;
    state.updatedAt = this.now();

    if (nextRunAt == null) {
      return;
    }

    if (spec.kind === 'date' && nextRunAt <= this.now()) {
      entry.handle = {
        kind: 'timeout',
        timer: this.scheduleTimeout(() => {
          void this.runScheduled(entry.definition.id, nextRunAt, 'misfire');
        }, 0)
      };
      return;
    }

    entry.handle = {
      kind: 'timeout',
      timer: this.scheduleTimeout(
        () => {
          void this.runScheduled(entry.definition.id, nextRunAt, 'scheduled');
        },
        clampDelay(nextRunAt - this.now())
      )
    };
  }

  private resolveNextRunAt(definition: SchedulerJobDefinition, state: SchedulerRuntimeState): number | undefined {
    const spec = definition.schedule;
    const now = this.now();
    if (spec.kind === 'cron') {
      return state.nextRunAt;
    }

    if (spec.kind === 'date') {
      if (spec.at > now) return spec.at;
      const misfire = definition.runPolicy?.misfire ?? DEFAULT_MISFIRE;
      return misfire === 'run-once' || misfire === 'catch-up' ? now : undefined;
    }

    if (state.nextRunAt && state.nextRunAt > now) {
      return state.nextRunAt;
    }

    if (state.nextRunAt && state.nextRunAt <= now) {
      const misfire = definition.runPolicy?.misfire ?? DEFAULT_MISFIRE;
      if (misfire === 'run-once' || misfire === 'catch-up') {
        return now;
      }
    }

    return this.computeNextRun(definition, now);
  }

  private computeNextRun(definition: SchedulerJobDefinition, base: number): number | undefined {
    const spec = definition.schedule;
    switch (spec.kind) {
      case 'date':
        return spec.at > base ? spec.at : undefined;
      case 'interval':
        return base + Math.max(1, spec.everyMs);
      case 'randomInterval': {
        const min = Math.max(1, spec.minMs);
        const max = Math.max(min, spec.maxMs);
        return base + min + this.random() * (max - min);
      }
      case 'cron':
      case 'manual':
      case 'event':
        return undefined;
      default:
        return undefined;
    }
  }

  private async runScheduled(id: string, scheduledFor: number, trigger: SchedulerRunTrigger): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) return;

    if (entry.handle?.kind === 'timeout') {
      entry.handle = null;
    }

    await this.runEntry(entry, scheduledFor, trigger);

    const current = this.entries.get(id);
    if (!current || current !== entry || !this.started || !entry.definition.enabled || this.isEntryPaused(entry)) {
      return;
    }

    if (entry.definition.schedule.kind === 'cron') {
      const state = this.ensureState(entry.definition);
      const job = entry.handle?.kind === 'node' ? entry.handle.job : null;
      state.nextRunAt = job ? this.getNodeJobNextRunAt(job) : undefined;
      state.updatedAt = this.now();
      this.persist();
      this.emitChanged('runtime', entry.definition);
      return;
    }

    const state = this.ensureState(entry.definition);
    state.nextRunAt = this.computeNextRun(entry.definition, this.now());
    state.updatedAt = this.now();
    this.scheduleEntry(entry);
    this.persist();
    this.emitChanged('runtime', entry.definition);
  }

  private async runEntry(entry: SchedulerEntry, scheduledFor: number, trigger: SchedulerRunTrigger, payloadOverride?: unknown, options: { force?: boolean } = {}): Promise<void> {
    const definition = entry.definition;
    const state = this.ensureState(definition);
    const startedAt = this.now();
    const force = options.force === true;
    const skipReason = await this.getSkipReason(entry, scheduledFor, startedAt, { force });
    if (skipReason) {
      state.lastStatus = 'skipped';
      state.lastSkipReason = skipReason;
      state.updatedAt = this.now();
      this.appendRunAudit(definition, trigger, scheduledFor, startedAt, state.updatedAt, 'skipped', skipReason, undefined, force);
      this.persist();
      this.emitChanged('runtime', definition);
      return;
    }

    const handler = this.handlers.get(definition.owner);
    if (!handler) {
      state.lastStatus = 'skipped';
      state.lastSkipReason = 'no-handler';
      state.updatedAt = this.now();
      this.appendRunAudit(definition, trigger, scheduledFor, startedAt, state.updatedAt, 'skipped', 'no-handler', undefined, force);
      this.persist();
      this.emitChanged('runtime', definition);
      return;
    }

    entry.runningCount += 1;
    const singletonKey = definition.runPolicy?.singletonKey;
    if (singletonKey) {
      this.runningSingletons.add(singletonKey);
    }
    state.lastRunAt = startedAt;
    state.lastSkipReason = undefined;
    state.lastError = undefined;
    state.updatedAt = startedAt;
    this.persist();

    try {
      const result = await handler({
        job: definition,
        payload: payloadOverride ?? definition.payload,
        scheduledFor,
        triggeredAt: startedAt,
        trigger,
        force
      });
      this.applyHandlerResult(state, result);
    } catch (error) {
      state.lastStatus = 'failed';
      state.lastError = error instanceof Error ? error.message : String(error);
      state.consecutiveFailures = (state.consecutiveFailures ?? 0) + 1;
      console.error(`[scheduler] Job failed: ${definition.id}`, error);
    } finally {
      entry.runningCount = Math.max(0, entry.runningCount - 1);
      if (singletonKey) {
        this.runningSingletons.delete(singletonKey);
      }
      state.lastFinishedAt = this.now();
      state.updatedAt = state.lastFinishedAt;
      this.appendRunAudit(definition, trigger, scheduledFor, startedAt, state.lastFinishedAt, state.lastStatus ?? 'failed', state.lastSkipReason, state.lastError, force);
      this.persist();
      this.emitChanged('runtime', definition);
    }
  }

  private applyHandlerResult(state: SchedulerRuntimeState, result: SchedulerJobHandlerResult): void {
    if (!result || result.status === 'success') {
      state.lastStatus = 'success';
      state.lastSkipReason = undefined;
      state.lastError = undefined;
      state.dailyRunCount = (state.dailyRunCount ?? 0) + 1;
      state.consecutiveFailures = 0;
      return;
    }

    if (result.status === 'skipped') {
      state.lastStatus = 'skipped';
      state.lastSkipReason = result.reason ?? 'handler-skipped';
      state.lastError = undefined;
      state.consecutiveFailures = 0;
      return;
    }

    state.lastStatus = 'failed';
    state.lastError = result.error ?? result.reason ?? 'handler-failed';
    state.consecutiveFailures = (state.consecutiveFailures ?? 0) + 1;
  }

  private async getSkipReason(entry: SchedulerEntry, scheduledFor: number, triggeredAt: number, options: { force?: boolean } = {}): Promise<string | null> {
    const definition = entry.definition;
    const state = this.ensureState(definition);
    if (!definition.enabled) return 'disabled';
    if (state.paused) return state.pauseReason ? `paused:${state.pauseReason}` : 'paused';
    const ownerPause = this.ownerPauseState.get(definition.owner);
    if (ownerPause?.paused) return ownerPause.pauseReason ? `owner-paused:${ownerPause.pauseReason}` : 'owner-paused';

    const resetDate = todayKey(triggeredAt);
    if (state.dailyResetDate !== resetDate) {
      state.dailyResetDate = resetDate;
      state.dailyRunCount = 0;
    }

    const policy = definition.runPolicy;
    if (policy?.dailyLimit != null && (state.dailyRunCount ?? 0) >= policy.dailyLimit) return 'daily-limit';
    if (policy?.cooldownMs && state.lastRunAt != null && triggeredAt - state.lastRunAt < policy.cooldownMs) return 'cooldown';
    if (entry.runningCount >= (policy?.maxConcurrent ?? 1)) return 'max-concurrent';
    if (policy?.singletonKey && this.runningSingletons.has(policy.singletonKey)) return 'singleton-running';

    const gateId = definition.admission?.customGate;
    if (gateId) {
      if (options.force) return null;
      const gate = this.gateHandlers.get(gateId);
      if (!gate) return `missing-gate:${gateId}`;
      const result = await gate({
        job: definition,
        payload: definition.payload,
        scheduledFor,
        triggeredAt
      });
      if (typeof result === 'boolean') {
        return result ? null : `gate:${gateId}`;
      }
      if (!result.accepted) {
        return result.reason ?? `gate:${gateId}`;
      }
    }

    return null;
  }

  private cancelJob(id: string): void {
    const entry = this.entries.get(id);
    if (entry) {
      this.cancelEntryHandle(entry);
    }
  }

  private cancelEntryHandle(entry: SchedulerEntry): void {
    const handle = entry.handle;
    if (!handle) return;

    if (handle.kind === 'node') {
      handle.job.cancel();
    } else {
      this.cancelTimeout(handle.timer);
    }
    entry.handle = null;
  }

  private getNodeJobNextRunAt(job: schedule.Job): number | undefined {
    if (typeof job.nextInvocation !== 'function') return undefined;
    return job.nextInvocation()?.getTime() ?? undefined;
  }

  private isOwnerPaused(owner: string): boolean {
    return this.ownerPauseState.get(owner)?.paused === true;
  }

  private isEntryPaused(entry: SchedulerEntry): boolean {
    const state = this.ensureState(entry.definition);
    return state.paused === true || this.isOwnerPaused(entry.definition.owner);
  }

  private appendRunAudit(
    definition: SchedulerJobDefinition,
    trigger: SchedulerRunTrigger,
    scheduledFor: number,
    startedAt: number,
    finishedAt: number,
    status: SchedulerAuditStatus,
    reason?: string,
    error?: string,
    force?: boolean
  ): void {
    this.auditLogStore.append({
      id: this.createAuditId(finishedAt),
      eventType: 'run',
      owner: definition.owner,
      jobId: definition.id,
      jobName: definition.name,
      trigger,
      force: force === true ? true : undefined,
      scheduledFor,
      startedAt,
      finishedAt,
      status,
      reason,
      error
    });
  }

  private appendControlAudit(
    definition: SchedulerJobDefinition,
    action: SchedulerControlAction,
    status: SchedulerAuditStatus,
    reason: string | undefined,
    startedAt: number,
    finishedAt: number
  ): void {
    this.auditLogStore.append({
      id: this.createAuditId(finishedAt),
      eventType: 'control',
      owner: definition.owner,
      jobId: definition.id,
      jobName: definition.name,
      action,
      startedAt,
      finishedAt,
      status,
      reason
    });
  }

  private appendOwnerControlAudit(owner: string, action: SchedulerControlAction, status: SchedulerAuditStatus, reason: string | undefined, startedAt: number, finishedAt: number): void {
    this.auditLogStore.append({
      id: this.createAuditId(finishedAt),
      eventType: 'control',
      owner,
      action,
      startedAt,
      finishedAt,
      status,
      reason
    });
  }

  private createAuditId(timestamp: number): string {
    this.auditSequence += 1;
    return `${timestamp}-${this.auditSequence}`;
  }

  private emitChanged(reason: SchedulerUpdateReason, target?: { id?: string; owner?: string }): void {
    const event: SchedulerUpdatedEvent = {
      reason,
      jobId: target?.id,
      owner: target?.owner,
      at: this.now()
    };
    for (const listener of this.changeListeners) {
      try {
        listener(event);
      } catch (error) {
        console.warn('[scheduler] Change listener failed', error);
      }
    }
  }

  private persist(): void {
    this.stateStore.save(this.runtimeState);
    this.persistOwnerPauseState();
  }

  private loadOwnerPauseState(): void {
    const state = this.stateStore.loadOwnerPauseState?.() ?? {};
    for (const pauseState of Object.values(state)) {
      if (pauseState.paused) {
        this.ownerPauseState.set(pauseState.owner, { ...pauseState });
      }
    }
  }

  private persistOwnerPauseState(): void {
    this.stateStore.saveOwnerPauseState?.(this.getOwnerPauseState());
  }
}
