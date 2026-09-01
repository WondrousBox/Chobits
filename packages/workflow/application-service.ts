import type { WorkflowEngine } from './engine.js';
import { calculateWorkflowProgress } from './progress.js';
import type { WorkflowApplicationStore } from './src/ports/store.js';
import type { ExecutionStatus, NodeRunState, ValidateResult, WorkflowDefinition, WorkflowRunLogEntry, WorkflowRunRecord } from './types.js';

export type { WorkflowApplicationStore } from './src/ports/store.js';

export interface WorkflowRunHandle {
  runId: string;
  workflowId: string;
  completionPromise: Promise<WorkflowRunRecord>;
}

export interface WorkflowExecutionResult {
  ok: boolean;
  runId?: string;
  status?: ExecutionStatus;
  error?: string;
  validation?: ValidateResult;
  missingConfigs?: Awaited<ReturnType<WorkflowEngine['checkMissingConfigs']>>;
  record?: WorkflowRunRecord;
}

export type WorkflowDefinitionSaveResult = { ok: true; definition: WorkflowDefinition } | { ok: false; error: 'Workflow definition is invalid'; validation: ValidateResult };

type PreparedExecution = { definition: WorkflowDefinition; failure?: never } | { definition?: never; failure: WorkflowExecutionResult };

function applyConfigOverrides(definition: WorkflowDefinition, input: Record<string, any>): WorkflowDefinition {
  const overrides = input.__configOverrides__;
  if (!overrides || typeof overrides !== 'object') return definition;

  return {
    ...definition,
    nodes: definition.nodes.map((node) => ({
      ...node,
      config: overrides[node.id] ? { ...node.config, ...overrides[node.id] } : node.config
    }))
  };
}

function withoutConfigOverrides(input: Record<string, any>): Record<string, any> {
  if (!Object.prototype.hasOwnProperty.call(input, '__configOverrides__')) return input;
  const executionInput = { ...input };
  delete executionInput.__configOverrides__;
  return executionInput;
}

function executionWorkspaceId(input: Record<string, any>, metadata?: Record<string, any>): string | undefined {
  if (typeof metadata?.workspaceId === 'string') return metadata.workspaceId;
  if (typeof input.workspaceId === 'string') return input.workspaceId;
  const resource = input.resource as Record<string, unknown> | undefined;
  return typeof resource?.workspaceId === 'string' ? resource.workspaceId : undefined;
}

export class WorkflowApplicationService {
  constructor(
    private readonly engine: WorkflowEngine,
    private readonly store: WorkflowApplicationStore,
    private readonly resolveWorkspaceId: (workspaceId?: string) => Promise<string>
  ) {}

  private async prepareExecution(definition: WorkflowDefinition, input: Record<string, any>): Promise<PreparedExecution> {
    const executionDefinition = applyConfigOverrides(definition, input);
    const validation = await this.engine.validate(executionDefinition);
    if (!validation.ok) {
      return { failure: { ok: false, error: 'validation-failed', validation } };
    }

    const missingConfigs = await this.engine.checkMissingConfigs(executionDefinition, input);
    if (missingConfigs.length > 0) {
      return { failure: { ok: false, error: 'input-required', missingConfigs } };
    }

    return { definition: executionDefinition };
  }

  async executeDefinition(definition: WorkflowDefinition, input: Record<string, any> = {}, metadata?: Record<string, any>): Promise<WorkflowExecutionResult> {
    const preparation = await this.prepareExecution(definition, input);
    if (preparation.failure) return preparation.failure;

    const record = await this.engine.run(preparation.definition, withoutConfigOverrides(input), metadata);
    if (record.status === 'completed') {
      return { ok: true, runId: record.runId, status: record.status, record };
    }

    return {
      ok: false,
      runId: record.runId,
      status: record.status,
      error: record.status === 'canceled' ? 'canceled' : record.error || 'workflow-execution-failed',
      record
    };
  }

  async executeById(definitionId: string, input: Record<string, any> = {}, metadata?: Record<string, any>): Promise<WorkflowExecutionResult> {
    const workspaceId = await this.resolveWorkspaceId(executionWorkspaceId(input, metadata));
    const definition = await this.getDefinition(definitionId, workspaceId);
    if (!definition) return { ok: false, error: 'Workflow not found' };
    return this.executeDefinition(definition, input, { ...metadata, workspaceId });
  }

  async startValidatedDefinition(
    definition: WorkflowDefinition,
    input: Record<string, any> = {},
    metadata?: Record<string, any>,
    onProgress?: (progress: number, message?: string) => void
  ): Promise<WorkflowRunHandle> {
    const preparation = await this.prepareExecution(definition, input);
    if (preparation.failure) {
      const detail = preparation.failure.validation?.errors?.join('; ');
      const error = new Error(detail || preparation.failure.error || 'workflow-preparation-failed');
      Object.assign(error, { code: preparation.failure.error, details: preparation.failure });
      throw error;
    }
    return this.startDefinition(preparation.definition, input, metadata, onProgress);
  }

  async runDefinition(
    definition: WorkflowDefinition,
    input: Record<string, any> = {},
    metadata?: Record<string, any>,
    onProgress?: (progress: number, message?: string) => void
  ): Promise<WorkflowRunRecord> {
    if (onProgress) {
      const handle = await this.startValidatedDefinition(definition, input, metadata, onProgress);
      return handle.completionPromise;
    }

    const result = await this.executeDefinition(definition, input, metadata);
    if (!result.record) throw new Error(result.error || 'workflow-execution-failed');
    return result.record;
  }

  startDefinition(definition: WorkflowDefinition, input: Record<string, any> = {}, metadata?: Record<string, any>, onProgress?: (progress: number, message?: string) => void): WorkflowRunHandle {
    const handle = this.engine.start(definition, withoutConfigOverrides(input), metadata);
    if (!onProgress) return { ...handle, workflowId: definition.id };

    const progressHandler = (record: WorkflowRunRecord, node: NodeRunState): void => {
      if (record.runId !== handle.runId) return;
      onProgress(calculateWorkflowProgress(record.nodes), node.progressMessage);
    };
    this.engine.onTyped('node:status', progressHandler);

    return {
      runId: handle.runId,
      workflowId: definition.id,
      completionPromise: handle.completionPromise.finally(() => {
        this.engine.off('node:status', progressHandler);
      })
    };
  }

  async getDefinition(id: string, workspaceId?: string): Promise<WorkflowDefinition | undefined> {
    const resolvedWorkspaceId = await this.resolveWorkspaceId(workspaceId);
    const preset = (await this.store.listPresets()).find((definition) => definition.id === id);
    if (preset) return { ...preset, workspaceId: resolvedWorkspaceId };
    return this.store.getDefinition(id, resolvedWorkspaceId);
  }

  async listDefinitions(workspaceId?: string): Promise<WorkflowDefinition[]> {
    const resolvedWorkspaceId = await this.resolveWorkspaceId(workspaceId);
    const [preset, custom] = await Promise.all([this.store.listPresets(), this.store.listDefinitions(resolvedWorkspaceId)]);
    return [...preset.map((definition) => ({ ...definition, workspaceId: resolvedWorkspaceId })), ...custom];
  }

  listPresetDefinitions(): Promise<WorkflowDefinition[]> {
    return this.store.listPresets();
  }

  async isPresetDefinition(id: string): Promise<boolean> {
    return (await this.store.listPresets()).some((definition) => definition.id === id);
  }

  validateDefinition(definition: WorkflowDefinition): Promise<ValidateResult> {
    return this.engine.validate(definition);
  }

  async saveDefinition(definition: WorkflowDefinition, workspaceId?: string): Promise<WorkflowDefinitionSaveResult> {
    const resolvedWorkspaceId = await this.resolveWorkspaceId(workspaceId || definition.workspaceId);
    const scopedDefinition = { ...definition, workspaceId: resolvedWorkspaceId };
    const validation = await this.engine.validate(scopedDefinition, { checkRuntimeDependencies: false });
    if (!validation.ok) return { ok: false, error: 'Workflow definition is invalid', validation };
    await this.store.saveDefinition(scopedDefinition);
    return { ok: true, definition: scopedDefinition };
  }

  async deleteDefinition(id: string, workspaceId?: string): Promise<void> {
    await this.store.deleteDefinition(id, await this.resolveWorkspaceId(workspaceId));
  }

  async getRun(runId: string, workspaceId?: string): Promise<WorkflowRunRecord | undefined> {
    const resolvedWorkspaceId = await this.resolveWorkspaceId(workspaceId);
    const run = this.engine.getRun(runId);
    if (run?.workspaceId === resolvedWorkspaceId) return run;
    return this.store.getRun(runId, resolvedWorkspaceId);
  }

  async listRuns(workspaceId?: string, workflowId?: string, limit?: number, resourceId?: string): Promise<WorkflowRunRecord[]> {
    return this.store.listRuns(await this.resolveWorkspaceId(workspaceId), workflowId, limit, resourceId);
  }

  async deleteRun(runId: string, workspaceId?: string): Promise<void> {
    await this.store.deleteRun(runId, await this.resolveWorkspaceId(workspaceId));
  }

  async cancelRun(runId: string, workspaceId?: string): Promise<boolean> {
    const resolvedWorkspaceId = await this.resolveWorkspaceId(workspaceId);
    const run = this.engine.getRun(runId);
    if (!run || run.workspaceId !== resolvedWorkspaceId) return false;
    await this.engine.cancel(runId);
    return true;
  }

  async getRunLogs(runId: string, workspaceId?: string): Promise<WorkflowRunLogEntry[]> {
    const resolvedWorkspaceId = await this.resolveWorkspaceId(workspaceId);
    const run = this.engine.getRun(runId);
    return run?.workspaceId === resolvedWorkspaceId ? this.engine.getRunLogs(runId) : [];
  }
}
