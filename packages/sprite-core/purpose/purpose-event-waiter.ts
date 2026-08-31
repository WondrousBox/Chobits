import type { SpritePurposeRuntimeEvent, SpritePurposeRuntimeEventInput, SpriteRoutine, SpriteRoutineStep } from './types';

type WaitForEventStep = Extract<SpriteRoutineStep, { type: 'waitForEvent' }>;

interface PurposeEventWaiterEntry {
  step: WaitForEventStep;
  routine: SpriteRoutine;
  resolve: (event: SpritePurposeRuntimeEvent) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
  cleanup: () => void;
}

export class SpritePurposeEventTimeoutError extends Error {
  constructor(event: string) {
    super(`Timed out waiting for purpose event: ${event}`);
    this.name = 'SpritePurposeEventTimeoutError';
  }
}

export class SpritePurposeEventWaiter {
  private waiters = new Set<PurposeEventWaiterEntry>();
  private history: SpritePurposeRuntimeEvent[] = [];

  constructor(
    private readonly options: {
      maxHistory?: number;
      now?: () => number;
      setTimeout?: typeof globalThis.setTimeout;
      clearTimeout?: typeof globalThis.clearTimeout;
    } = {}
  ) {}

  emit(input: SpritePurposeRuntimeEventInput): number {
    const event: SpritePurposeRuntimeEvent = {
      ...input,
      source: input.source ?? 'purpose-event',
      timestamp: input.timestamp ?? this.now()
    };

    this.history.push(event);
    if (this.history.length > (this.options.maxHistory ?? 100)) {
      this.history.shift();
    }

    let matched = 0;
    for (const waiter of Array.from(this.waiters)) {
      const matchResult = this.getMatchResult(waiter.step, waiter.routine, event);
      if (!matchResult.matched) {
        this.logChatApiConfigMatchMiss(waiter.step, waiter.routine, event, matchResult.reason);
        continue;
      }
      matched += 1;
      this.logChatApiConfigMatchHit(waiter.step, waiter.routine, event);
      waiter.cleanup();
      waiter.resolve(event);
    }
    return matched;
  }

  wait(step: WaitForEventStep, routine: SpriteRoutine, signal?: AbortSignal): Promise<SpritePurposeRuntimeEvent> {
    this.logChatApiConfigWaitStart(step, routine);
    if (!step.ignoreHistory) {
      const existing = this.history.find((event) => this.matches(step, routine, event));
      if (existing) {
        return Promise.resolve(existing);
      }
    }

    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Routine cancelled', 'AbortError'));
        return;
      }

      const onAbort = (): void => {
        entry.cleanup();
        reject(new DOMException('Routine cancelled', 'AbortError'));
      };
      const entry: PurposeEventWaiterEntry = {
        step,
        routine,
        resolve,
        reject,
        cleanup: () => {
          if (entry.timer) {
            this.clearTimeout(entry.timer);
          }
          this.waiters.delete(entry);
          signal?.removeEventListener('abort', onAbort);
        }
      };

      if (step.timeoutMs != null) {
        entry.timer = this.setTimeout(() => {
          entry.cleanup();
          reject(new SpritePurposeEventTimeoutError(step.event));
        }, Math.max(0, step.timeoutMs));
      }

      signal?.addEventListener('abort', onAbort, { once: true });
      this.waiters.add(entry);
    });
  }

  clear(): void {
    for (const waiter of Array.from(this.waiters)) {
      waiter.cleanup();
      waiter.reject(new DOMException('Purpose event waiter cleared', 'AbortError'));
    }
    this.history = [];
  }

  private matches(step: WaitForEventStep, routine: SpriteRoutine, event: SpritePurposeRuntimeEvent): boolean {
    return this.getMatchResult(step, routine, event).matched;
  }

  private getMatchResult(
    step: WaitForEventStep,
    routine: SpriteRoutine,
    event: SpritePurposeRuntimeEvent
  ): { matched: true } | { matched: false; reason: string } {
    if (step.source && event.source !== step.source) {
      return { matched: false, reason: `source expected=${step.source} actual=${event.source}` };
    }
    if (event.event !== step.event) {
      return { matched: false, reason: `event expected=${step.event} actual=${event.event}` };
    }

    const expected = step.match ?? {};
    for (const [key, value] of Object.entries(expected)) {
      const actual = this.readMatchValue(event, key);
      if (!this.matchesExpectedValue(actual, value)) {
        return { matched: false, reason: `payload.${key} expected=${this.formatLogValue(value)} actual=${this.formatLogValue(actual)}` };
      }
    }

    if (event.routineId && event.routineId !== routine.id) {
      return { matched: false, reason: `routineId expected=${routine.id} actual=${event.routineId}` };
    }
    if (event.purposeId && event.purposeId !== routine.purposeId) {
      return { matched: false, reason: `purposeId expected=${routine.purposeId} actual=${event.purposeId}` };
    }
    return { matched: true };
  }

  private readMatchValue(event: SpritePurposeRuntimeEvent, key: string): unknown {
    if (key.startsWith('payload.')) {
      return this.readPath(event.payload, key.slice('payload.'.length));
    }

    if (key in event) {
      return event[key as keyof SpritePurposeRuntimeEvent];
    }

    return this.readPath(event.payload, key);
  }

  private readPath(value: unknown, path: string): unknown {
    if (!path) return value;
    return path.split('.').reduce<unknown>((current, part) => {
      if (typeof current !== 'object' || current === null) return undefined;
      return (current as Record<string, unknown>)[part];
    }, value);
  }

  private matchesExpectedValue(actual: unknown, expected: unknown): boolean {
    if (Array.isArray(expected)) {
      return expected.includes(actual);
    }
    return actual === expected;
  }

  private isChatApiConfigWait(step: WaitForEventStep, routine: SpriteRoutine): boolean {
    return (
      routine.presetId === 'chat.api-config-guide' ||
      step.id.includes('chat-api-config')
    );
  }

  private logChatApiConfigMatchMiss(step: WaitForEventStep, routine: SpriteRoutine, event: SpritePurposeRuntimeEvent, reason: string): void {
    if (!this.isChatApiConfigWait(step, routine)) return;
    if (event.event !== step.event && event.event !== 'AI_PROVIDER_CONFIG_UPDATED' && event.event !== 'APP_WINDOW_CLOSED') return;
    console.info('[SpritePurposeEventWaiter] chat api config event miss', {
      stepId: step.id,
      waitingFor: step.event,
      match: step.match,
      routineId: routine.id,
      purposeId: routine.purposeId,
      presetId: routine.presetId,
      event: event.event,
      source: event.source,
      payload: event.payload,
      reason
    });
  }

  private logChatApiConfigWaitStart(step: WaitForEventStep, routine: SpriteRoutine): void {
    if (!this.isChatApiConfigWait(step, routine)) return;
    console.info('[SpritePurposeEventWaiter] chat api config wait start', {
      stepId: step.id,
      waitingFor: step.event,
      source: step.source,
      match: step.match,
      ignoreHistory: step.ignoreHistory,
      timeoutMs: step.timeoutMs,
      routineId: routine.id,
      purposeId: routine.purposeId,
      presetId: routine.presetId
    });
  }

  private logChatApiConfigMatchHit(step: WaitForEventStep, routine: SpriteRoutine, event: SpritePurposeRuntimeEvent): void {
    if (!this.isChatApiConfigWait(step, routine)) return;
    console.info('[SpritePurposeEventWaiter] chat api config event matched', {
      stepId: step.id,
      waitingFor: step.event,
      match: step.match,
      routineId: routine.id,
      purposeId: routine.purposeId,
      presetId: routine.presetId,
      event: event.event,
      source: event.source,
      payload: event.payload
    });
  }

  private formatLogValue(value: unknown): string {
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private setTimeout(handler: () => void, timeout: number): ReturnType<typeof setTimeout> {
    return (this.options.setTimeout ?? globalThis.setTimeout)(handler, timeout);
  }

  private clearTimeout(timer: ReturnType<typeof setTimeout>): void {
    (this.options.clearTimeout ?? globalThis.clearTimeout)(timer);
  }
}
