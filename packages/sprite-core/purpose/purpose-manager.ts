import { SpriteRoutinePresetRegistry, type SpriteRoutinePresetDefinition } from './routine-presets';
import { SpriteRoutineRunner } from './routine-runner';
import type {
  SpritePurpose,
  SpritePurposeHistoryEntry,
  SpritePurposeHistoryWriter,
  SpritePurposeSnapshot,
  SpritePurposeSource,
  SpritePurposeStartResult,
  SpriteRoutine,
  SpriteRoutineRunResult,
  SpriteRoutineStep,
  StartSpritePurposeRequest
} from './types';

export interface SpritePurposeIdlePresenceOptions {
  enabled?: boolean;
  title?: string;
  reason?: string;
  source?: SpritePurposeSource;
}

export interface SpritePurposeQueuePolicyOptions {
  maxQueueSize?: number;
  minQueuedPriority?: number;
  replaceLowerPriorityWhenFull?: boolean;
}

export interface SpritePurposeRoutinePlannerContext {
  preset?: SpriteRoutinePresetDefinition;
  now: number;
  createPresetRoutine: () => SpriteRoutine | undefined;
}

export type SpritePurposeRoutinePlanner = (purpose: SpritePurpose, context: SpritePurposeRoutinePlannerContext) => SpriteRoutine | undefined | Promise<SpriteRoutine | undefined>;

export interface SpritePurposeManagerDeps {
  runner: SpriteRoutineRunner;
  presets?: SpriteRoutinePresetRegistry;
  history?: SpritePurposeHistoryWriter;
  idlePresence?: SpritePurposeIdlePresenceOptions;
  queuePolicy?: SpritePurposeQueuePolicyOptions;
  routinePlanner?: SpritePurposeRoutinePlanner;
  now?: () => number;
  idFactory?: () => string;
  onSnapshot?: (snapshot: SpritePurposeSnapshot) => void;
  onRoutineStart?: (purpose: SpritePurpose, routine: SpriteRoutine) => void | Promise<void>;
  onRoutineFinish?: (purpose: SpritePurpose, routine: SpriteRoutine, result: SpriteRoutineRunResult) => void | Promise<void>;
}

const DEFAULT_PRIORITY_BY_KIND: Record<string, number> = {
  'idle.presence': 10,
  'daily.rest-reminder': 60
};

const DEFAULT_QUEUE_POLICY: Required<SpritePurposeQueuePolicyOptions> = {
  maxQueueSize: 8,
  minQueuedPriority: 20,
  replaceLowerPriorityWhenFull: true
};

const SINGLETON_PURPOSE_KINDS = new Set(['idle.presence', 'daily.rest-reminder']);
const CONTEXT_COALESCE_KEYS = ['correlationId', 'workflowRunId', 'runId', 'dropId'];

interface CurrentRoutineStepState {
  purposeId: string;
  routineId: string;
  step: SpriteRoutineStep;
}

export class SpritePurposeManager {
  private readonly presets: SpriteRoutinePresetRegistry;
  private readonly now: () => number;
  private readonly idFactory: () => string;
  private readonly idlePresence: Required<SpritePurposeIdlePresenceOptions>;
  private readonly queuePolicy: Required<SpritePurposeQueuePolicyOptions>;
  private current: SpritePurpose | null = null;
  private currentRoutine: SpriteRoutine | null = null;
  private currentStep: CurrentRoutineStepState | null = null;
  private queue: SpritePurpose[] = [];
  private activeAbort: AbortController | null = null;
  private idlePresenceReady: Promise<SpritePurpose | null> = Promise.resolve(null);

  constructor(private readonly deps: SpritePurposeManagerDeps) {
    this.presets = deps.presets ?? new SpriteRoutinePresetRegistry();
    this.now = deps.now ?? (() => Date.now());
    this.idFactory = deps.idFactory ?? (() => `purpose-${this.now()}-${Math.random().toString(36).slice(2, 8)}`);
    this.idlePresence = {
      enabled: deps.idlePresence?.enabled ?? false,
      title: deps.idlePresence?.title ?? '安静陪伴',
      reason: deps.idlePresence?.reason ?? '应用启动后维持低打扰陪伴状态，等待用户或系统事件。',
      source: deps.idlePresence?.source ?? 'system-event'
    };
    this.queuePolicy = this.normalizeQueuePolicy(deps.queuePolicy);

    if (this.idlePresence.enabled) {
      void this.ensureIdlePresence();
    }
  }

  getSnapshot(): SpritePurposeSnapshot {
    return {
      current: this.current ? { ...this.current } : null,
      routine: this.currentRoutine ? { ...this.currentRoutine, steps: this.currentRoutine.steps.map((step) => ({ ...step })) } : null,
      queue: this.queue.map((purpose) => ({ ...purpose }))
    };
  }

  async start(request: StartSpritePurposeRequest): Promise<SpritePurposeStartResult> {
    const now = this.now();
    const preset = this.presets.findForRequest(request);
    const purpose: SpritePurpose = {
      id: this.idFactory(),
      kind: request.kind,
      title: request.title ?? preset?.title ?? request.kind,
      reason: request.reason,
      source: request.source,
      status: 'queued',
      priority: request.priority ?? preset?.defaultPriority ?? DEFAULT_PRIORITY_BY_KIND[request.kind] ?? 50,
      interruptPolicy: request.interruptPolicy ?? 'interruptible',
      presetId: request.presetId ?? preset?.id,
      correlationId: request.correlationId,
      coalesceKey: request.coalesceKey,
      plannerMode: request.plannerMode,
      context: request.context
    };

    const coalescedPurpose = this.findCoalescedPurpose(purpose);
    if (coalescedPurpose) {
      await this.record({
        timestamp: now,
        eventType: 'purpose:coalesced',
        purposeId: coalescedPurpose.id,
        purposeKind: coalescedPurpose.kind,
        priority: coalescedPurpose.priority,
        source: purpose.source,
        status: coalescedPurpose.status,
        summary: purpose.reason,
        result: { coalescedPurposeId: coalescedPurpose.id }
      });
      return {
        accepted: true,
        purpose: { ...coalescedPurpose },
        status: 'coalesced',
        reason: coalescedPurpose.status === 'queued' ? 'same-kind-purpose-already-queued' : 'same-kind-purpose-already-active'
      };
    }

    await this.record({
      timestamp: now,
      eventType: 'purpose:created',
      purposeId: purpose.id,
      purposeKind: purpose.kind,
      priority: purpose.priority,
      source: purpose.source,
      status: purpose.status,
      summary: purpose.reason
    });

    const queueReason = this.getQueueReason(purpose);
    if (this.current && queueReason) {
      const admission = await this.admitQueuedPurpose(purpose);
      if (!admission.accepted) {
        purpose.status = 'rejected';
        await this.recordRejectedPurpose(purpose, admission.reason);
        this.emitSnapshot();
        return {
          accepted: false,
          purpose,
          status: 'rejected',
          reason: admission.reason
        };
      }

      this.queue.push(purpose);
      this.sortQueue();
      this.emitSnapshot();
      return {
        accepted: true,
        purpose,
        status: 'queued',
        reason: queueReason
      };
    }

    if (this.current) {
      await this.supersedeCurrent(purpose.id);
    }

    const routine = await this.activatePurpose(purpose, preset, now);

    return {
      accepted: true,
      purpose: this.current ?? purpose,
      routine,
      status: 'started'
    };
  }

  private normalizeQueuePolicy(policy?: SpritePurposeQueuePolicyOptions): Required<SpritePurposeQueuePolicyOptions> {
    const maxQueueSize = policy?.maxQueueSize ?? DEFAULT_QUEUE_POLICY.maxQueueSize;
    return {
      maxQueueSize: Number.isFinite(maxQueueSize) ? Math.max(0, Math.floor(maxQueueSize)) : DEFAULT_QUEUE_POLICY.maxQueueSize,
      minQueuedPriority: policy?.minQueuedPriority ?? DEFAULT_QUEUE_POLICY.minQueuedPriority,
      replaceLowerPriorityWhenFull: policy?.replaceLowerPriorityWhenFull ?? DEFAULT_QUEUE_POLICY.replaceLowerPriorityWhenFull
    };
  }

  async cancel(purposeId?: string, reason = 'cancelled'): Promise<boolean> {
    if (!this.current || (purposeId && this.current.id !== purposeId)) {
      const before = this.queue.length;
      this.queue = this.queue.filter((purpose) => purpose.id !== purposeId);
      this.emitSnapshot();
      return before !== this.queue.length;
    }

    this.activeAbort?.abort();
    await this.completeCurrent('cancelled', reason);
    await this.startNextQueued();
    return true;
  }

  async ensureIdlePresence(reason = this.idlePresence.reason): Promise<SpritePurpose | null> {
    const previous = this.idlePresenceReady.catch(() => null);
    const task = this.activateIdlePresence(reason);
    this.idlePresenceReady = Promise.all([previous, task.catch(() => null)]).then(([, purpose]) => purpose);
    return task;
  }

  async waitForIdlePresence(): Promise<void> {
    await this.idlePresenceReady;
  }

  private async activateIdlePresence(reason = this.idlePresence.reason): Promise<SpritePurpose | null> {
    if (!this.idlePresence.enabled) {
      return null;
    }

    if (this.current) {
      return { ...this.current };
    }

    if (this.queue.length > 0) {
      return null;
    }

    const now = this.now();
    const preset = this.presets.findForRequest({
      kind: 'idle.presence',
      reason,
      source: this.idlePresence.source,
      presetId: 'idle.presence'
    });
    const purpose: SpritePurpose = {
      id: this.idFactory(),
      kind: 'idle.presence',
      title: this.idlePresence.title ?? preset?.title ?? '安静陪伴',
      reason,
      source: this.idlePresence.source,
      status: 'active',
      priority: preset?.defaultPriority ?? DEFAULT_PRIORITY_BY_KIND['idle.presence'],
      interruptPolicy: 'interruptible',
      presetId: preset?.id ?? 'idle.presence',
      startedAt: now
    };

    this.current = purpose;
    this.currentRoutine = null;
    this.activeAbort = null;
    this.emitSnapshot();

    await this.record({
      timestamp: now,
      eventType: 'purpose:created',
      purposeId: purpose.id,
      purposeKind: purpose.kind,
      priority: purpose.priority,
      source: purpose.source,
      status: 'queued',
      summary: purpose.reason
    });
    await this.record({
      timestamp: now,
      eventType: 'purpose:started',
      purposeId: purpose.id,
      purposeKind: purpose.kind,
      priority: purpose.priority,
      source: purpose.source,
      status: 'active',
      summary: purpose.reason
    });

    return { ...purpose };
  }

  private async runRoutine(purpose: SpritePurpose, routine: SpriteRoutine, fallbackPreset?: SpriteRoutinePresetDefinition): Promise<void> {
    const controller = new AbortController();
    this.activeAbort = controller;

    await this.record({
      timestamp: this.now(),
      eventType: 'routine:started',
      purposeId: purpose.id,
      routineId: routine.id,
      purposeKind: purpose.kind,
      source: routine.source,
      status: 'running'
    });

    await this.deps.onRoutineStart?.(purpose, routine);
    const result = await this.deps.runner.run(routine, {
      signal: controller.signal,
      onStepStart: (_routine, step) => this.handleRoutineStepStart(purpose, routine, step),
      onStepComplete: (_routine, step) => this.handleRoutineStepComplete(purpose, routine, step)
    });
    await this.deps.onRoutineFinish?.(purpose, routine, result);
    if (purpose.supersededBy || this.current?.id !== purpose.id) {
      return;
    }

    if (result.ok) {
      await this.recordRoutineResult('routine:completed', purpose, routine, result);
      await this.completeCurrent('completed');
    } else if (result.status === 'cancelled') {
      await this.recordRoutineResult('routine:cancelled', purpose, routine, result);
      await this.completeCurrent('cancelled', result.error);
    } else {
      await this.recordRoutineResult('routine:failed', purpose, routine, result);
      if (routine.source === 'ai') {
        const fallbackRoutine = await this.createExecutionFallbackRoutine(purpose, routine, result, fallbackPreset);
        if (fallbackRoutine && this.current?.id === purpose.id && !purpose.supersededBy) {
          this.currentRoutine = fallbackRoutine;
          this.currentStep = null;
          this.emitSnapshot();
          await this.runRoutine(purpose, fallbackRoutine);
          return;
        }
      }
      await this.completeCurrent('failed', result.error);
    }
    await this.startNextQueued();
  }

  private async createExecutionFallbackRoutine(
    purpose: SpritePurpose,
    failedRoutine: SpriteRoutine,
    result: SpriteRoutineRunResult,
    preset?: SpriteRoutinePresetDefinition
  ): Promise<SpriteRoutine | undefined> {
    if (!preset) {
      return undefined;
    }

    const fallbackRoutine = this.presets.createRoutine(purpose, preset, this.now());
    await this.record({
      timestamp: this.now(),
      eventType: 'planner:fallback',
      purposeId: purpose.id,
      routineId: failedRoutine.id,
      purposeKind: purpose.kind,
      priority: purpose.priority,
      source: purpose.source,
      status: 'fallback',
      summary: 'ai-routine-execution-failed',
      result: {
        reason: 'ai-routine-execution-failed',
        fallbackPresetId: preset.id,
        failedRoutineId: failedRoutine.id,
        failedStepId: result.currentStepId,
        failedStatus: result.status,
        stepCount: failedRoutine.steps.length
      },
      error: result.error
    });
    return fallbackRoutine;
  }

  private handleRoutineStepStart(purpose: SpritePurpose, routine: SpriteRoutine, step: SpriteRoutineStep): void {
    if (this.current?.id !== purpose.id) {
      return;
    }

    this.currentStep = {
      purposeId: purpose.id,
      routineId: routine.id,
      step
    };
  }

  private async handleRoutineStepComplete(purpose: SpritePurpose, routine: SpriteRoutine, step: SpriteRoutineStep): Promise<void> {
    if (this.currentStep?.purposeId === purpose.id && this.currentStep.routineId === routine.id && this.currentStep.step.id === step.id) {
      this.currentStep = null;
    }

    if (this.current?.id !== purpose.id) {
      return;
    }

    await this.startQueuedInterruptIfReady();
  }

  private async completeCurrent(status: 'completed' | 'cancelled' | 'failed', error?: string): Promise<void> {
    if (!this.current) return;
    const purpose = this.current;
    purpose.status = status;
    purpose.endedAt = this.now();
    await this.record({
      timestamp: purpose.endedAt,
      eventType: status === 'completed' ? 'purpose:completed' : status === 'cancelled' ? 'purpose:cancelled' : 'purpose:failed',
      purposeId: purpose.id,
      purposeKind: purpose.kind,
      priority: purpose.priority,
      source: purpose.source,
      status,
      summary: purpose.reason,
      contextDigest: this.createPurposeContextDigest(purpose),
      result: {
        durationMs: purpose.startedAt ? purpose.endedAt - purpose.startedAt : undefined,
        expectedOutcome: purpose.expectedOutcome
      },
      error
    });
    this.current = null;
    this.currentRoutine = null;
    this.currentStep = null;
    this.activeAbort = null;
    this.emitSnapshot();
  }

  private async supersedeCurrent(nextPurposeId: string): Promise<void> {
    if (!this.current) return;
    const purpose = this.current;
    purpose.supersededBy = nextPurposeId;
    this.activeAbort?.abort();
    this.current = null;
    this.currentRoutine = null;
    this.currentStep = null;
    this.activeAbort = null;
    await this.record({
      timestamp: this.now(),
      eventType: 'purpose:superseded',
      purposeId: purpose.id,
      purposeKind: purpose.kind,
      priority: purpose.priority,
      source: purpose.source,
      status: 'superseded',
      result: { supersededBy: nextPurposeId }
    });
  }

  private async admitQueuedPurpose(purpose: SpritePurpose): Promise<{ accepted: true } | { accepted: false; reason: string }> {
    if (!this.isSemanticIdlePurpose(purpose) && purpose.priority < this.queuePolicy.minQueuedPriority) {
      return { accepted: false, reason: 'queued-purpose-priority-too-low' };
    }

    if (this.queue.length < this.queuePolicy.maxQueueSize) {
      return { accepted: true };
    }

    if (!this.queuePolicy.replaceLowerPriorityWhenFull) {
      return { accepted: false, reason: 'purpose-queue-limit-reached' };
    }

    const lowestIndex = this.findLowestPriorityQueuedIndex();
    const lowest = lowestIndex >= 0 ? this.queue[lowestIndex] : undefined;
    if (!lowest || lowest.priority >= purpose.priority) {
      return { accepted: false, reason: 'purpose-queue-limit-reached' };
    }

    const [evicted] = this.queue.splice(lowestIndex, 1);
    if (evicted) {
      evicted.status = 'rejected';
      await this.recordRejectedPurpose(evicted, 'queue-limit-evicted-by-higher-priority', { replacedBy: purpose.id });
    }

    return { accepted: true };
  }

  private findLowestPriorityQueuedIndex(): number {
    let lowestIndex = -1;
    let lowestPriority = Number.POSITIVE_INFINITY;
    for (let index = 0; index < this.queue.length; index += 1) {
      const priority = this.queue[index]?.priority ?? Number.POSITIVE_INFINITY;
      if (priority < lowestPriority) {
        lowestIndex = index;
        lowestPriority = priority;
      }
    }
    return lowestIndex;
  }

  private async recordRejectedPurpose(purpose: SpritePurpose, reason: string, result?: Record<string, unknown>): Promise<void> {
    await this.record({
      timestamp: this.now(),
      eventType: 'purpose:rejected',
      purposeId: purpose.id,
      purposeKind: purpose.kind,
      priority: purpose.priority,
      source: purpose.source,
      status: 'rejected',
      summary: purpose.reason,
      result: { reason, ...result }
    });
  }

  private canInterruptCurrent(next: SpritePurpose, options: { respectCriticalStep?: boolean } = {}): boolean {
    if (!this.current) return true;
    if (this.current.interruptPolicy === 'never') return false;
    if (next.interruptPolicy === 'urgent') return true;
    if ((options.respectCriticalStep ?? true) && this.isCurrentStepCritical()) return false;
    return next.priority > this.current.priority;
  }

  private getQueueReason(next: SpritePurpose): string | null {
    if (!this.current) return null;
    if (this.current.interruptPolicy === 'never') return 'current-purpose-never-interrupts';
    if (next.interruptPolicy === 'urgent') return null;
    if (next.priority <= this.current.priority) return 'current-purpose-has-higher-priority';
    if (this.isCurrentStepCritical()) return 'current-purpose-step-is-critical';
    return null;
  }

  private isCurrentStepCritical(): boolean {
    return !!this.currentStep && this.isRoutineStepCritical(this.currentStep.step);
  }

  private isRoutineStepCritical(step: SpriteRoutineStep): boolean {
    return 'interruptible' in step && step.interruptible === false;
  }

  private isSemanticIdlePurpose(purpose: SpritePurpose): boolean {
    return this.idlePresence.enabled && purpose.kind === 'idle.presence';
  }

  private findCoalescedPurpose(next: SpritePurpose): SpritePurpose | undefined {
    if (next.interruptPolicy === 'urgent') {
      return undefined;
    }

    const nextKey = this.getCoalesceKey(next);
    if (!nextKey) {
      return undefined;
    }

    if (this.current && this.getCoalesceKey(this.current) === nextKey) {
      return this.current;
    }

    return this.queue.find((purpose) => this.getCoalesceKey(purpose) === nextKey);
  }

  private getCoalesceKey(purpose: SpritePurpose): string | undefined {
    const explicitKey = this.getStringValue(purpose.coalesceKey);
    if (explicitKey) {
      return `${purpose.kind}:explicit:${explicitKey}`;
    }

    const correlationId = this.getStringValue(purpose.correlationId);
    if (correlationId) {
      return `${purpose.kind}:correlation:${correlationId}`;
    }

    for (const key of CONTEXT_COALESCE_KEYS) {
      const value = this.getStringValue(purpose.context?.[key]);
      if (value) {
        return `${purpose.kind}:${key}:${value}`;
      }
    }

    return SINGLETON_PURPOSE_KINDS.has(purpose.kind) ? `${purpose.kind}:singleton` : undefined;
  }

  private getStringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => b.priority - a.priority);
  }

  private async startNextQueued(): Promise<void> {
    const next = this.queue.shift();
    if (!next) {
      if (this.idlePresence.enabled) {
        await this.ensureIdlePresence();
      } else {
        this.emitSnapshot();
      }
      return;
    }

    const preset = this.presets.findForRequest({
      kind: next.kind,
      reason: next.reason,
      source: next.source,
      presetId: next.presetId
    });
    await this.activatePurpose(next, preset, this.now());
  }

  private async activatePurpose(purpose: SpritePurpose, preset: SpriteRoutinePresetDefinition | undefined, now = this.now()): Promise<SpriteRoutine | undefined> {
    const semanticPurpose = this.isSemanticIdlePurpose(purpose);
    const routine = semanticPurpose ? undefined : await this.resolveRoutineForPurpose(purpose, preset, now);
    this.current = {
      ...purpose,
      status: 'active',
      startedAt: now
    };
    this.currentRoutine = routine ?? null;
    this.currentStep = null;
    this.emitSnapshot();

    await this.record({
      timestamp: now,
      eventType: 'purpose:started',
      purposeId: purpose.id,
      purposeKind: purpose.kind,
      priority: purpose.priority,
      source: purpose.source,
      status: 'active',
      summary: purpose.reason
    });

    const activePurpose = this.current;
    if (semanticPurpose) {
      // idle.presence remains active until a higher priority purpose supersedes it.
    } else if (routine && activePurpose) {
      void this.runRoutine(activePurpose, routine, preset);
    } else {
      await this.completeCurrent('completed');
      await this.startNextQueued();
    }

    return routine;
  }

  private async resolveRoutineForPurpose(purpose: SpritePurpose, preset: SpriteRoutinePresetDefinition | undefined, now: number): Promise<SpriteRoutine | undefined> {
    const createPresetRoutine = (): SpriteRoutine | undefined => (preset ? this.presets.createRoutine(purpose, preset, now) : undefined);
    if (!this.deps.routinePlanner || purpose.plannerMode === 'preset-only') {
      return createPresetRoutine();
    }

    try {
      const planned = await this.deps.routinePlanner(purpose, {
        preset,
        now,
        createPresetRoutine
      });
      if (planned) {
        return {
          ...planned,
          purposeId: purpose.id,
          priority: planned.priority ?? purpose.priority,
          steps: planned.steps.map((step) => ({ ...step }))
        };
      }
    } catch (error) {
      await this.record({
        timestamp: now,
        eventType: 'planner:fallback',
        purposeId: purpose.id,
        purposeKind: purpose.kind,
        priority: purpose.priority,
        source: purpose.source,
        status: 'fallback',
        summary: 'routine-planner-error',
        result: {
          reason: 'routine-planner-error',
          fallbackPresetId: preset?.id
        },
        error: error instanceof Error ? error.message : String(error)
      });
    }

    return createPresetRoutine();
  }

  private async startQueuedInterruptIfReady(): Promise<void> {
    if (!this.current || this.isCurrentStepCritical()) {
      return;
    }

    const nextIndex = this.queue.findIndex((purpose) => this.canInterruptCurrent(purpose, { respectCriticalStep: false }));
    if (nextIndex < 0) {
      return;
    }

    const [next] = this.queue.splice(nextIndex, 1);
    if (!next) {
      return;
    }

    const preset = this.presets.findForRequest({
      kind: next.kind,
      reason: next.reason,
      source: next.source,
      presetId: next.presetId
    });
    await this.supersedeCurrent(next.id);
    await this.activatePurpose(next, preset, this.now());
  }

  private async recordRoutineResult(
    eventType: 'routine:completed' | 'routine:cancelled' | 'routine:failed',
    purpose: SpritePurpose,
    routine: SpriteRoutine,
    result: SpriteRoutineRunResult
  ): Promise<void> {
    await this.record({
      timestamp: this.now(),
      eventType,
      purposeId: purpose.id,
      routineId: routine.id,
      purposeKind: purpose.kind,
      source: routine.source,
      status: result.status,
      error: result.error,
      result: { elapsedMs: result.elapsedMs, stepCount: result.steps.length }
    });
  }

  private async record(entry: SpritePurposeHistoryEntry): Promise<void> {
    await this.deps.history?.append(entry);
  }

  private createPurposeContextDigest(purpose: SpritePurpose): Record<string, unknown> | undefined {
    const context = purpose.context;
    if (!context) return undefined;

    const digest: Record<string, unknown> = {};
    const includeKeys = [
      'source',
      'fileCount',
      'fileNames',
      'resourceIds',
      'primaryResourceName',
      'workflowRunId',
      'runId',
      'workflowId',
      'workflowName',
      'resourceId',
      'routineKind',
      'severity'
    ];
    for (const key of includeKeys) {
      const value = context[key];
      if (value == null) continue;
      digest[key] = this.compactPurposeContextValue(value);
    }

    return Object.keys(digest).length > 0 ? digest : undefined;
  }

  private compactPurposeContextValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.slice(0, 8).map((item) => this.compactPurposeContextValue(item));
    }
    if (typeof value === 'string') {
      return value.length > 120 ? `${value.slice(0, 117)}...` : value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    return undefined;
  }

  private emitSnapshot(): void {
    this.deps.onSnapshot?.(this.getSnapshot());
  }
}
