export interface WorkflowClock {
  now(): number;
  sleep(delayMs: number, signal?: AbortSignal): Promise<void>;
}

export interface WorkflowIdFactory {
  createRunId(): string;
}

export interface WorkflowExecutionLease {
  release(): void | Promise<void>;
}

export interface WorkflowExecutionLimiter {
  acquire(group: string, signal?: AbortSignal): Promise<WorkflowExecutionLease>;
}
