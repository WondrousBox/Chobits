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
      if (!this.matches(waiter.step, waiter.routine, event)) continue;
      matched += 1;
      waiter.cleanup();
      waiter.resolve(event);
    }
    return matched;
  }

  wait(step: WaitForEventStep, routine: SpriteRoutine, signal?: AbortSignal): Promise<SpritePurposeRuntimeEvent> {
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
    if (step.source && event.source !== step.source) return false;
    if (event.event !== step.event) return false;

    const expected = step.match ?? {};
    for (const [key, value] of Object.entries(expected)) {
      if (!this.matchesExpectedValue(this.readMatchValue(event, key), value)) {
        return false;
      }
    }

    if (event.routineId && event.routineId !== routine.id) return false;
    if (event.purposeId && event.purposeId !== routine.purposeId) return false;
    return true;
  }

  private readMatchValue(event: SpritePurposeRuntimeEvent, key: string): unknown {
    if (key in event) {
      return event[key as keyof SpritePurposeRuntimeEvent];
    }

    const payload = event.payload;
    if (!payload) return undefined;
    return key.split('.').reduce<unknown>((current, part) => {
      if (typeof current !== 'object' || current === null) return undefined;
      return (current as Record<string, unknown>)[part];
    }, payload);
  }

  private matchesExpectedValue(actual: unknown, expected: unknown): boolean {
    if (Array.isArray(expected)) {
      return expected.includes(actual);
    }
    return actual === expected;
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
