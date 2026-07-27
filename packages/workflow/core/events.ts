import { EventEmitter } from 'node:events';

import type { NodeRunState, WorkflowRunLogEntry, WorkflowRunRecord } from '../types';

export interface WorkflowEngineEvents {
  'run:status': (record: WorkflowRunRecord) => void;
  'node:status': (record: WorkflowRunRecord, node: NodeRunState) => void;
  'node:progress': (runId: string, nodeId: string, progress: number, message?: string, detail?: any) => void;
  'run:log': (runId: string, entry: WorkflowRunLogEntry) => void;
}

export class EngineEmitter extends EventEmitter {
  emitTyped<K extends keyof WorkflowEngineEvents>(event: K, ...args: Parameters<WorkflowEngineEvents[K]>): boolean {
    return super.emit(event as string, ...(args as any[]));
  }

  onTyped<K extends keyof WorkflowEngineEvents>(event: K, listener: WorkflowEngineEvents[K]): this {
    super.on(event as string, listener as (...args: any[]) => void);
    return this;
  }
}
