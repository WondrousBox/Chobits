import { randomUUID } from 'node:crypto';

import type { WorkflowClock, WorkflowIdFactory } from '../ports/control.js';

function abortError(): Error {
  const error = new Error('Operation aborted');
  error.name = 'AbortError';
  return error;
}

export const systemWorkflowClock: WorkflowClock = {
  now: () => Date.now(),
  sleep(delayMs, signal) {
    if (signal?.aborted) return Promise.reject(abortError());
    const normalizedDelay = Math.max(0, delayMs);
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(finish, normalizedDelay);
      const onAbort = (): void => finish(abortError());

      function finish(error?: Error): void {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        if (error) reject(error);
        else resolve();
      }

      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
};

export const randomWorkflowIdFactory: WorkflowIdFactory = {
  createRunId: () => randomUUID()
};
