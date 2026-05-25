import { SpritePurposeEventTimeoutError } from './purpose-event-waiter';
import type { SpritePurposeRuntimeEvent, SpriteRoutine, SpriteRoutineRunResult, SpriteRoutineStep, SpriteRoutineStepResult } from './types';

interface SpriteRoutineRunContext {
  results: SpriteRoutineStepResult[];
  variables: Record<string, unknown>;
  cooldowns: Record<string, number>;
}

export interface SpriteRoutineRunnerDeps {
  playAnimation: (step: Extract<SpriteRoutineStep, { type: 'playAnimation' }>, signal: AbortSignal, routine: SpriteRoutine) => Promise<unknown> | unknown;
  walkTo: (step: Extract<SpriteRoutineStep, { type: 'walkTo' }>, signal: AbortSignal, routine: SpriteRoutine) => Promise<unknown> | unknown;
  waitForEvent?: (step: Extract<SpriteRoutineStep, { type: 'waitForEvent' }>, signal: AbortSignal, routine: SpriteRoutine) => Promise<SpritePurposeRuntimeEvent> | SpritePurposeRuntimeEvent;
  speak: (step: Extract<SpriteRoutineStep, { type: 'speak' }>, signal: AbortSignal) => Promise<unknown> | unknown;
  showToast: (step: Extract<SpriteRoutineStep, { type: 'showToast' }>) => Promise<unknown> | unknown;
  showNotice?: (step: Extract<SpriteRoutineStep, { type: 'showNotice' }>) => Promise<unknown> | unknown;
  clearMessage?: (step: Extract<SpriteRoutineStep, { type: 'clearMessage' }>) => Promise<unknown> | unknown;
  showBusy?: (step: Extract<SpriteRoutineStep, { type: 'showBusy' }>) => Promise<unknown> | unknown;
  updateBusy?: (step: Extract<SpriteRoutineStep, { type: 'updateBusy' }>) => Promise<unknown> | unknown;
  clearBusy?: () => Promise<unknown> | unknown;
  openWindow?: (step: Extract<SpriteRoutineStep, { type: 'openWindow' }>, signal: AbortSignal, routine: SpriteRoutine) => Promise<unknown> | unknown;
  onStepStart?: (routine: SpriteRoutine, step: SpriteRoutineStep) => void | Promise<void>;
  onStepComplete?: (routine: SpriteRoutine, step: SpriteRoutineStep, result: SpriteRoutineStepResult) => void | Promise<void>;
  now?: () => number;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
}

export interface SpriteRoutineRunOptions {
  signal?: AbortSignal;
  onStepStart?: (routine: SpriteRoutine, step: SpriteRoutineStep) => void | Promise<void>;
  onStepComplete?: (routine: SpriteRoutine, step: SpriteRoutineStep, result: SpriteRoutineStepResult) => void | Promise<void>;
}

export class SpriteRoutineCancelledError extends Error {
  constructor() {
    super('Routine cancelled');
    this.name = 'SpriteRoutineCancelledError';
  }
}

function isCancelled(error: unknown): boolean {
  return error instanceof SpriteRoutineCancelledError || (error instanceof Error && error.name === 'AbortError');
}

function isTimeout(error: unknown): boolean {
  return error instanceof SpritePurposeEventTimeoutError;
}

export class SpriteRoutineRunner {
  private readonly now: () => number;
  private readonly scheduleTimeout: typeof globalThis.setTimeout;
  private readonly cancelTimeout: typeof globalThis.clearTimeout;

  constructor(private readonly deps: SpriteRoutineRunnerDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.scheduleTimeout = deps.setTimeout ?? globalThis.setTimeout;
    this.cancelTimeout = deps.clearTimeout ?? globalThis.clearTimeout;
  }

  async run(routine: SpriteRoutine, options?: SpriteRoutineRunOptions): Promise<SpriteRoutineRunResult> {
    const startedAt = this.now();
    const context: SpriteRoutineRunContext = {
      results: [],
      variables: {},
      cooldowns: {}
    };
    routine.status = 'running';
    routine.startedAt = startedAt;

    try {
      for (let index = routine.cursor; index < routine.steps.length; index += 1) {
        this.throwIfAborted(options?.signal);
        routine.cursor = index;
        const step = routine.steps[index];
        const result = await this.runStep(routine, step, context, options, true);
        if (!result.ok) {
          routine.status = result.status === 'cancelled' ? 'cancelled' : 'failed';
          routine.endedAt = this.now();
          return {
            ok: false,
            status: routine.status,
            purposeId: routine.purposeId,
            routineId: routine.id,
            currentStepId: step.id,
            error: result.error,
            elapsedMs: routine.endedAt - startedAt,
            steps: context.results
          };
        }
      }

      routine.status = 'completed';
      routine.cursor = routine.steps.length;
      routine.endedAt = this.now();
      return {
        ok: true,
        status: 'completed',
        purposeId: routine.purposeId,
        routineId: routine.id,
        elapsedMs: routine.endedAt - startedAt,
        steps: context.results
      };
    } catch (error) {
      routine.status = isCancelled(error) ? 'cancelled' : 'failed';
      routine.endedAt = this.now();
      return {
        ok: false,
        status: routine.status,
        purposeId: routine.purposeId,
        routineId: routine.id,
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: routine.endedAt - startedAt,
        steps: context.results
      };
    }
  }

  private async runStep(
    routine: SpriteRoutine,
    step: SpriteRoutineStep,
    context: SpriteRoutineRunContext,
    options?: SpriteRoutineRunOptions,
    updateCursor = false
  ): Promise<SpriteRoutineStepResult> {
    const startedAt = this.now();
    const effectiveOptions = options ?? { signal: new AbortController().signal };
    const signal = effectiveOptions.signal;
    await this.deps.onStepStart?.(routine, step);
    await effectiveOptions.onStepStart?.(routine, step);
    let result: SpriteRoutineStepResult;
    try {
      this.throwIfAborted(signal);
      const skipped = this.prepareStepSkip(step, context);
      if (skipped) {
        result = {
          ok: true,
          status: 'skipped',
          stepId: step.id,
          value: skipped,
          elapsedMs: this.now() - startedAt
        };
      } else {
        const value = await this.dispatchStep(routine, step, effectiveOptions, context);
        result = {
          ok: true,
          status: 'completed',
          stepId: step.id,
          value,
          elapsedMs: this.now() - startedAt
        };
        this.assignStepResult(step, value, context);
      }
    } catch (error) {
      const optionalTimeout = this.createOptionalTimeoutSkip(step, error);
      if (optionalTimeout) {
        result = {
          ok: true,
          status: 'skipped',
          stepId: step.id,
          value: optionalTimeout,
          elapsedMs: this.now() - startedAt
        };
        this.assignStepResult(step, optionalTimeout, context);
      } else {
        result = {
          ok: false,
          status: isCancelled(error) ? 'cancelled' : isTimeout(error) ? 'timeout' : 'failed',
          stepId: step.id,
          error: error instanceof Error ? error.message : String(error),
          elapsedMs: this.now() - startedAt
        };
      }
    } finally {
      if (updateCursor) {
        routine.cursor = Math.min(routine.cursor + 1, routine.steps.length);
      }
    }
    context.results.push(result);
    await this.deps.onStepComplete?.(routine, step, result);
    await effectiveOptions.onStepComplete?.(routine, step, result);
    return result;
  }

  private prepareStepSkip(step: SpriteRoutineStep, context: SpriteRoutineRunContext): Record<string, unknown> | null {
    if ((step.type !== 'speak' && step.type !== 'showNotice') || step.cooldownMs == null) {
      return null;
    }

    const cooldownKey = step.cooldownKey ?? `${step.type}:${step.id}`;
    const now = this.now();
    const nextAllowedAt = context.cooldowns[cooldownKey] ?? 0;
    if (now < nextAllowedAt) {
      return {
        reason: 'cooldown',
        cooldownKey,
        nextAllowedAt
      };
    }

    context.cooldowns[cooldownKey] = now + Math.max(0, step.cooldownMs);
    return null;
  }

  private dispatchStep(routine: SpriteRoutine, step: SpriteRoutineStep, options: SpriteRoutineRunOptions, context: SpriteRoutineRunContext): Promise<unknown> | unknown {
    const signal = options.signal ?? new AbortController().signal;
    switch (step.type) {
      case 'wait':
        return this.runWait(routine, step, signal);
      case 'waitForEvent':
        if (!this.deps.waitForEvent) {
          throw new Error('waitForEvent step is not supported by this runner');
        }
        return this.deps.waitForEvent(step, signal, routine);
      case 'playAnimation':
        return this.deps.playAnimation(step, signal, routine);
      case 'walkTo':
        return this.deps.walkTo(step, signal, routine);
      case 'speak':
        return this.deps.speak(step, signal);
      case 'showToast':
        return this.deps.showToast(step);
      case 'showNotice':
        return this.deps.showNotice?.(step);
      case 'clearMessage':
        return this.deps.clearMessage?.(step);
      case 'showBusy':
        return this.deps.showBusy?.(step);
      case 'updateBusy':
        return this.runUpdateBusy(step, context);
      case 'clearBusy':
        return this.deps.clearBusy?.();
      case 'openWindow':
        return this.runOpenWindow(routine, step, signal);
      case 'loopUntil':
        return this.runLoopUntil(routine, step, options, context);
      case 'branch':
        return this.runBranch(routine, step, options, context);
      default:
        return undefined;
    }
  }

  private async runWait(routine: SpriteRoutine, step: Extract<SpriteRoutineStep, { type: 'wait' }>, signal: AbortSignal): Promise<unknown> {
    if (!step.interruptEvent) {
      return this.delay(step.durationMs, signal);
    }
    if (!this.deps.waitForEvent) {
      return this.delay(step.durationMs, signal);
    }

    const controller = new AbortController();
    const onAbort = (): void => {
      controller.abort();
    };
    signal.addEventListener('abort', onAbort, { once: true });

    try {
      const delayPromise = this.delay(step.durationMs, controller.signal).then(() => ({ reason: 'timeout' }));
      const interruptPromise = Promise.resolve(
        this.deps.waitForEvent(
          {
            id: `${step.id}:interrupt`,
            type: 'waitForEvent',
            event: step.interruptEvent,
            source: step.interruptSource,
            match: step.interruptMatch,
            ignoreHistory: step.interruptIgnoreHistory,
            timeoutMs: step.durationMs
          },
          controller.signal,
          routine
        )
      )
        .then((event) => ({ reason: 'event', event }))
        .catch((error: unknown) => {
          if (isTimeout(error)) {
            return { reason: 'timeout' };
          }
          if (isCancelled(error) && controller.signal.aborted && !signal.aborted) {
            return { reason: 'cancelled' };
          }
          throw error;
        });
      const result = await Promise.race([delayPromise, interruptPromise]);
      controller.abort();
      return result;
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }

  private createOptionalTimeoutSkip(step: SpriteRoutineStep, error: unknown): Record<string, unknown> | null {
    if (step.type !== 'waitForEvent' || !step.optional || !isTimeout(error)) {
      return null;
    }

    return {
      reason: 'timeout',
      event: step.event,
      source: step.source
    };
  }

  private runUpdateBusy(step: Extract<SpriteRoutineStep, { type: 'updateBusy' }>, context: SpriteRoutineRunContext): Promise<unknown> | unknown {
    const resolved = this.resolveUpdateBusyStep(step, context);
    if (typeof resolved.progress !== 'number') {
      return {
        skipped: true,
        reason: 'missing-progress',
        content: resolved.content
      };
    }

    return this.deps.updateBusy?.(resolved) ?? {
      progress: resolved.progress,
      content: resolved.content
    };
  }

  private resolveUpdateBusyStep(step: Extract<SpriteRoutineStep, { type: 'updateBusy' }>, context: SpriteRoutineRunContext): Extract<SpriteRoutineStep, { type: 'updateBusy' }> {
    const progressValue = step.progressFrom ? this.readPath(context.variables, step.progressFrom) : undefined;
    const contentValue = step.contentFrom ? this.readPath(context.variables, step.contentFrom) : undefined;
    const progress = this.coerceNumber(progressValue) ?? step.progress;
    const content = this.coerceString(contentValue) ?? step.content;
    return {
      ...step,
      progress,
      content
    };
  }

  private coerceNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }

  private coerceString(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return value;
    }
    return undefined;
  }

  private async runOpenWindow(routine: SpriteRoutine, step: Extract<SpriteRoutineStep, { type: 'openWindow' }>, signal: AbortSignal): Promise<unknown> {
    if (!this.deps.openWindow) {
      throw new Error('openWindow step is not supported by this runner');
    }

    await this.deps.openWindow(step, signal, routine);
    if (!step.waitForEvent) {
      return undefined;
    }

    if (!this.deps.waitForEvent) {
      throw new Error('openWindow waitForEvent requires waitForEvent support');
    }

    return this.deps.waitForEvent(
      {
        id: `${step.id}:wait`,
        type: 'waitForEvent',
        event: step.waitForEvent,
        source: step.eventSource ?? 'purpose-event',
        match: step.match,
        timeoutMs: step.timeoutMs
      },
      signal,
      routine
    );
  }

  private async runLoopUntil(
    routine: SpriteRoutine,
    step: Extract<SpriteRoutineStep, { type: 'loopUntil' }>,
    options: SpriteRoutineRunOptions,
    context: SpriteRoutineRunContext
  ): Promise<{ event: SpritePurposeRuntimeEvent; iterations: number }> {
    if (!this.deps.waitForEvent) {
      throw new Error('loopUntil step requires waitForEvent support');
    }

    const startedAt = this.now();
    const signal = options.signal ?? new AbortController().signal;
    const untilEvents = Array.isArray(step.untilEvent) ? step.untilEvent : [step.untilEvent];
    const controller = new AbortController();
    let resolvedEvent: SpritePurposeRuntimeEvent | null = null;
    let waitError: unknown = null;
    let iterations = 0;

    const onAbort = (): void => {
      controller.abort();
    };
    signal.addEventListener('abort', onAbort, { once: true });
    const loopOptions: SpriteRoutineRunOptions = {
      ...options,
      signal: controller.signal
    };

    const waitPromises = untilEvents.map((event) =>
      Promise.resolve(
        this.deps.waitForEvent!(
          {
            id: `${step.id}:until:${event}`,
            type: 'waitForEvent',
            event,
            source: step.source,
            match: step.match,
            ignoreHistory: step.ignoreHistory,
            timeoutMs: step.maxDurationMs
          },
          controller.signal,
          routine
        )
      )
        .then((value: SpritePurposeRuntimeEvent) => {
          if (!resolvedEvent) {
            resolvedEvent = value;
            controller.abort();
          }
          return value;
        })
        .catch((error: unknown) => {
          if (!resolvedEvent || !isCancelled(error)) {
            waitError = error;
          }
          return null;
        })
    );

    try {
      await Promise.resolve();
      while (!resolvedEvent) {
        this.throwIfAborted(signal);
        if (waitError) {
          throw waitError;
        }
        if (step.maxDurationMs != null && this.now() - startedAt >= step.maxDurationMs) {
          throw new SpritePurposeEventTimeoutError(untilEvents.join('|'));
        }

        iterations += 1;
        if (step.body.length === 0) {
          try {
            await this.delay(100, controller.signal);
          } catch (error) {
            if (resolvedEvent && isCancelled(error)) {
              break;
            }
            throw error;
          }
          continue;
        }

        for (const child of step.body) {
          if (resolvedEvent) break;
          const result = await this.runStep(routine, child, context, loopOptions, false);
          if (!result.ok) {
            if (result.status === 'cancelled') {
              await Promise.resolve();
              if (resolvedEvent || (controller.signal.aborted && !signal.aborted)) {
                break;
              }
              throw new SpriteRoutineCancelledError();
            }
            throw new Error(result.error || `Loop step failed: ${child.id}`);
          }
        }

        if (controller.signal.aborted && !signal.aborted) {
          await Promise.resolve();
          if (resolvedEvent) {
            break;
          }
        }
      }

      return { event: resolvedEvent, iterations };
    } finally {
      signal.removeEventListener('abort', onAbort);
      controller.abort();
      await Promise.allSettled(waitPromises);
    }
  }

  private async runBranch(routine: SpriteRoutine, step: Extract<SpriteRoutineStep, { type: 'branch' }>, options: SpriteRoutineRunOptions, context: SpriteRoutineRunContext): Promise<{ caseKey: string; stepCount: number }> {
    const value = this.readPath(context.variables, step.by);
    const caseKey = value == null ? '' : String(value);
    const steps = step.cases[caseKey] ?? step.default ?? [];
    const signal = options.signal ?? new AbortController().signal;

    for (const child of steps) {
      this.throwIfAborted(signal);
      const result = await this.runStep(routine, child, context, options, false);
      if (!result.ok) {
        if (result.status === 'cancelled') {
          throw new SpriteRoutineCancelledError();
        }
        throw new Error(result.error || `Branch step failed: ${child.id}`);
      }
    }

    return { caseKey, stepCount: steps.length };
  }

  private assignStepResult(step: SpriteRoutineStep, value: unknown, context: SpriteRoutineRunContext): void {
    if (!('assignTo' in step) || !step.assignTo) {
      return;
    }
    if (step.type === 'waitForEvent' && value && typeof value === 'object' && (value as Record<string, unknown>).reason === 'timeout') {
      delete context.variables[step.assignTo];
      return;
    }
    context.variables[step.assignTo] = value;
  }

  private readPath(source: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((current, part) => {
      if (typeof current !== 'object' || current === null) return undefined;
      return (current as Record<string, unknown>)[part];
    }, source);
  }

  private delay(durationMs: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      this.throwIfAborted(signal);
      const timer = this.scheduleTimeout(
        () => {
          cleanup();
          resolve();
        },
        Math.max(0, durationMs)
      );

      const onAbort = (): void => {
        cleanup();
        reject(new SpriteRoutineCancelledError());
      };
      const cleanup = (): void => {
        this.cancelTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new SpriteRoutineCancelledError();
    }
  }
}
