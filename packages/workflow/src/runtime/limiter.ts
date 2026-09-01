import type { WorkflowExecutionLease, WorkflowExecutionLimiter } from '../ports/control.js';

export interface WorkflowExecutionGroupLimits {
  defaultLimit?: number;
  groups?: Readonly<Record<string, number>>;
}

type Waiter = {
  resolve: (lease: WorkflowExecutionLease) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
};

function abortError(): Error {
  const error = new Error('Execution group acquisition aborted');
  error.name = 'AbortError';
  return error;
}

export class WorkflowExecutionGroupLimiter implements WorkflowExecutionLimiter {
  private readonly active = new Map<string, number>();
  private readonly waiting = new Map<string, Waiter[]>();
  private readonly defaultLimit: number;
  private readonly limits: Readonly<Record<string, number>>;

  constructor(options: WorkflowExecutionGroupLimits = {}) {
    this.defaultLimit = normalizeLimit(options.defaultLimit ?? Number.POSITIVE_INFINITY);
    this.limits = options.groups || {};
  }

  acquire(group: string, signal?: AbortSignal): Promise<WorkflowExecutionLease> {
    if (signal?.aborted) return Promise.reject(abortError());
    const limit = normalizeLimit(this.limits[group] ?? this.defaultLimit);
    if ((this.active.get(group) || 0) < limit) return Promise.resolve(this.createLease(group));

    return new Promise<WorkflowExecutionLease>((resolve, reject) => {
      const waiter: Waiter = { resolve, reject, signal };
      if (signal) {
        waiter.onAbort = () => {
          this.removeWaiter(group, waiter);
          reject(abortError());
        };
        signal.addEventListener('abort', waiter.onAbort, { once: true });
      }
      const queue = this.waiting.get(group) || [];
      queue.push(waiter);
      this.waiting.set(group, queue);
    });
  }

  getActiveCount(group: string): number {
    return this.active.get(group) || 0;
  }

  getWaitingCount(group: string): number {
    return this.waiting.get(group)?.length || 0;
  }

  private createLease(group: string): WorkflowExecutionLease {
    this.active.set(group, (this.active.get(group) || 0) + 1);
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        this.release(group);
      }
    };
  }

  private release(group: string): void {
    const nextActive = Math.max(0, (this.active.get(group) || 1) - 1);
    if (nextActive === 0) this.active.delete(group);
    else this.active.set(group, nextActive);

    const queue = this.waiting.get(group);
    while (queue?.length) {
      const waiter = queue.shift()!;
      if (waiter.onAbort) waiter.signal?.removeEventListener('abort', waiter.onAbort);
      if (waiter.signal?.aborted) continue;
      if (queue.length === 0) this.waiting.delete(group);
      waiter.resolve(this.createLease(group));
      break;
    }
    if (queue?.length === 0) this.waiting.delete(group);
  }

  private removeWaiter(group: string, waiter: Waiter): void {
    const queue = this.waiting.get(group);
    if (!queue) return;
    const index = queue.indexOf(waiter);
    if (index >= 0) queue.splice(index, 1);
    if (waiter.onAbort) waiter.signal?.removeEventListener('abort', waiter.onAbort);
    if (queue.length === 0) this.waiting.delete(group);
  }
}

function normalizeLimit(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : Number.POSITIVE_INFINITY;
}

export function createWorkflowExecutionLimiter(options?: WorkflowExecutionGroupLimits): WorkflowExecutionGroupLimiter {
  return new WorkflowExecutionGroupLimiter(options);
}

export const unlimitedWorkflowExecutionLimiter: WorkflowExecutionLimiter = {
  acquire: async () => ({ release: () => {} })
};
