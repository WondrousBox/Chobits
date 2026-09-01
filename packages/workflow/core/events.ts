import { EventEmitter } from 'node:events';

import type { WorkflowEngineEvents } from '../src/contracts/events.js';

export type { WorkflowEngineEvents } from '../src/contracts/events.js';

export class EngineEmitter extends EventEmitter {
  emitTyped<K extends keyof WorkflowEngineEvents>(event: K, ...args: Parameters<WorkflowEngineEvents[K]>): boolean {
    return super.emit(event as string, ...(args as any[]));
  }

  onTyped<K extends keyof WorkflowEngineEvents>(event: K, listener: WorkflowEngineEvents[K]): this {
    super.on(event as string, listener as (...args: any[]) => void);
    return this;
  }
}
