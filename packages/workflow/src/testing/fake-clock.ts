import type { WorkflowClock } from '../ports/control.js';

type ClockWaiter = {
  at: number;
  resolve: () => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
};

function abortError(): Error {
  const error = new Error('Fake clock sleep aborted');
  error.name = 'AbortError';
  return error;
}

export class FakeWorkflowClock implements WorkflowClock {
  private currentTime: number;
  private readonly waiters = new Set<ClockWaiter>();

  constructor(initialTime = 0) {
    this.currentTime = initialTime;
  }

  now(): number {
    return this.currentTime;
  }

  sleep(delayMs: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(abortError());
    const at = this.currentTime + Math.max(0, delayMs);
    if (at <= this.currentTime) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      const waiter: ClockWaiter = { at, resolve, reject, signal };
      if (signal) {
        waiter.onAbort = () => {
          this.waiters.delete(waiter);
          reject(abortError());
        };
        signal.addEventListener('abort', waiter.onAbort, { once: true });
      }
      this.waiters.add(waiter);
    });
  }

  advanceBy(delayMs: number): void {
    this.advanceTo(this.currentTime + Math.max(0, delayMs));
  }

  advanceTo(timestamp: number): void {
    if (timestamp < this.currentTime) throw new Error('Fake workflow clock cannot move backwards');
    this.currentTime = timestamp;
    for (const waiter of [...this.waiters].sort((left, right) => left.at - right.at)) {
      if (waiter.at > timestamp) continue;
      this.waiters.delete(waiter);
      if (waiter.onAbort) waiter.signal?.removeEventListener('abort', waiter.onAbort);
      waiter.resolve();
    }
  }

  get pendingSleeps(): number {
    return this.waiters.size;
  }
}
