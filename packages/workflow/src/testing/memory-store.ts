import type { WorkflowDefinition } from '../contracts/definition.js';
import type { WorkflowRunRecord } from '../contracts/run.js';
import type { WorkflowApplicationStore } from '../ports/store.js';

export interface InMemoryWorkflowStoreOptions {
  defaultWorkspaceId?: string;
  presets?: readonly WorkflowDefinition[];
  definitions?: readonly WorkflowDefinition[];
  runs?: readonly WorkflowRunRecord[];
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function definitionKey(workspaceId: string, definitionId: string): string {
  return `${workspaceId}\u0000${definitionId}`;
}

function runResourceId(run: WorkflowRunRecord): string | undefined {
  if (typeof run.metadata?.resourceId === 'string') return run.metadata.resourceId;
  if (typeof run.input?.resourceId === 'string') return run.input.resourceId;
  const resource = run.input?.resource as Record<string, unknown> | undefined;
  return typeof resource?.id === 'string' ? resource.id : undefined;
}

export class InMemoryWorkflowApplicationStore implements WorkflowApplicationStore {
  private readonly defaultWorkspaceId: string;
  private readonly presets = new Map<string, WorkflowDefinition>();
  private readonly definitions = new Map<string, WorkflowDefinition>();
  private readonly runs = new Map<string, WorkflowRunRecord>();

  constructor(options: InMemoryWorkflowStoreOptions = {}) {
    this.defaultWorkspaceId = options.defaultWorkspaceId || 'default';
    for (const definition of options.presets || []) this.presets.set(definition.id, clone(definition));
    for (const definition of options.definitions || []) {
      const workspaceId = definition.workspaceId || this.defaultWorkspaceId;
      this.definitions.set(definitionKey(workspaceId, definition.id), clone({ ...definition, workspaceId }));
    }
    for (const run of options.runs || []) this.runs.set(run.runId, clone(run));
  }

  async listPresets(): Promise<WorkflowDefinition[]> {
    return [...this.presets.values()].map(clone);
  }

  async listDefinitions(workspaceId: string): Promise<WorkflowDefinition[]> {
    return [...this.definitions.values()].filter((definition) => definition.workspaceId === workspaceId).map(clone);
  }

  async getDefinition(id: string, workspaceId: string): Promise<WorkflowDefinition | undefined> {
    const definition = this.definitions.get(definitionKey(workspaceId, id));
    return definition ? clone(definition) : undefined;
  }

  async saveDefinition(definition: WorkflowDefinition): Promise<void> {
    const workspaceId = definition.workspaceId || this.defaultWorkspaceId;
    this.definitions.set(definitionKey(workspaceId, definition.id), clone({ ...definition, workspaceId }));
  }

  async deleteDefinition(id: string, workspaceId: string): Promise<void> {
    this.definitions.delete(definitionKey(workspaceId, id));
  }

  async listRuns(workspaceId: string, workflowId?: string, limit?: number, resourceId?: string): Promise<WorkflowRunRecord[]> {
    const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit as number)) : Number.POSITIVE_INFINITY;
    return [...this.runs.values()]
      .filter((run) => run.workspaceId === workspaceId)
      .filter((run) => !workflowId || run.workflowId === workflowId)
      .filter((run) => !resourceId || runResourceId(run) === resourceId)
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, safeLimit)
      .map(clone);
  }

  async getRun(runId: string, workspaceId: string): Promise<WorkflowRunRecord | undefined> {
    const run = this.runs.get(runId);
    return run?.workspaceId === workspaceId ? clone(run) : undefined;
  }

  async deleteRun(runId: string, workspaceId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (run?.workspaceId === workspaceId) this.runs.delete(runId);
  }

  saveRun(run: WorkflowRunRecord): void {
    this.runs.set(run.runId, clone(run));
  }

  clear(): void {
    this.presets.clear();
    this.definitions.clear();
    this.runs.clear();
  }
}
