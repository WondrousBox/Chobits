export type WorkflowNodeExecutionResult = 'completed' | 'failed' | 'skipped' | 'canceled';

export interface WorkflowExecutionScheduleOptions {
  levels: readonly (readonly string[])[];
  concurrency: number;
  errorStrategy?: 'fail-fast' | 'continue';
  shouldStop: () => boolean;
  executeNode: (nodeId: string) => Promise<WorkflowNodeExecutionResult>;
}

export interface WorkflowExecutionScheduleResult {
  canceled: boolean;
  failedFast: boolean;
}

export async function executeWorkflowSchedule({ levels, concurrency, errorStrategy, shouldStop, executeNode }: WorkflowExecutionScheduleOptions): Promise<WorkflowExecutionScheduleResult> {
  const batchSize = Number.isFinite(concurrency) ? Math.max(1, Math.floor(concurrency)) : 1;
  let canceled = false;
  let failedFast = false;

  for (const level of levels) {
    for (let offset = 0; offset < level.length; offset += batchSize) {
      if (shouldStop()) {
        canceled = true;
        break;
      }

      const results = await Promise.all(level.slice(offset, offset + batchSize).map((nodeId) => executeNode(nodeId)));
      if (results.includes('canceled') || shouldStop()) {
        canceled = true;
        break;
      }
      if (errorStrategy !== 'continue' && results.includes('failed')) {
        failedFast = true;
        break;
      }
    }
    if (canceled || failedFast) break;
  }

  return { canceled, failedFast };
}
