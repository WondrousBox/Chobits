import type { WorkflowExecutionResult, WorkflowRunHandle } from '../../application-service.js';
import { WorkflowApplicationService } from '../../application-service.js';
import { createWorkflowRegistry, type WorkflowRegistry } from '../../core/registry.js';
import type { WorkflowEngineOptions } from '../../engine.js';
import { createEngine, WorkflowEngine } from '../../engine.js';
import { parseWorkflowRuntimeRunRequest } from '../../schema.js';
import type { WorkflowValidationIssue } from '../contracts/errors.js';
import type { WorkflowEngineEvents } from '../contracts/events.js';
import type { WorkflowLegacyRunRequest, WorkflowRunRequest, WorkflowRunScope } from '../contracts/request.js';
import type { WorkflowRunRecord } from '../contracts/run.js';
import type { ValidateResult } from '../contracts/validation.js';
import type { WorkflowClock, WorkflowExecutionLimiter, WorkflowIdFactory } from '../ports/control.js';
import type { ExecutionContext } from '../ports/runtime.js';
import type { WorkflowApplicationStore } from '../ports/store.js';
import type { WorkflowCapabilityResolver } from '../sdk/capability.js';
import { createWorkflowCapabilities } from './capabilities.js';
import { randomWorkflowIdFactory, systemWorkflowClock } from './control.js';
import { createWorkflowExecutionLimiter, type WorkflowExecutionGroupLimits } from './limiter.js';
import { normalizeWorkflowRunRequest } from './request.js';

export interface WorkflowRuntimeOptions {
  store: WorkflowApplicationStore;
  registry?: WorkflowRegistry;
  capabilities?: WorkflowCapabilityResolver;
  baseContext?: Omit<ExecutionContext, 'tmpDir'>;
  resolveWorkspaceId?: (workspaceId?: string) => Promise<string>;
  defaultWorkspaceId?: string;
  clock?: WorkflowClock;
  idFactory?: WorkflowIdFactory;
  limiter?: WorkflowExecutionLimiter;
  executionGroups?: WorkflowExecutionGroupLimits;
  engineOptions?: Omit<WorkflowEngineOptions, 'registry' | 'capabilities' | 'clock' | 'idFactory' | 'limiter'>;
}

type PreparedRuntimeRequest = {
  definition: NonNullable<WorkflowRunRequest['definition']>;
  input: Record<string, unknown>;
  metadata: Record<string, unknown>;
  workspaceId: string;
};

export class WorkflowRuntimeRequestError extends Error {
  constructor(
    readonly code: 'invalid-run-request' | 'workflow-not-found' | 'runtime-disposed',
    message: string,
    readonly issues?: WorkflowValidationIssue[]
  ) {
    super(message);
    this.name = 'WorkflowRuntimeRequestError';
  }
}

export class WorkflowRuntimeEvents {
  constructor(private readonly engine: WorkflowEngine) {}

  subscribe<K extends keyof WorkflowEngineEvents>(event: K, listener: WorkflowEngineEvents[K]): () => void {
    this.engine.onTyped(event, listener);
    return () => this.engine.off(event, listener as (...args: unknown[]) => void);
  }
}

export class WorkflowRuntime {
  readonly registry: WorkflowRegistry;
  readonly capabilities: WorkflowCapabilityResolver;
  readonly engine: WorkflowEngine;
  readonly application: WorkflowApplicationService;
  readonly events: WorkflowRuntimeEvents;

  private readonly resolveWorkspaceId: (workspaceId?: string) => Promise<string>;
  private readonly activeRuns = new Map<string, Promise<WorkflowRunRecord>>();
  private persistenceTail = Promise.resolve();
  private persistenceError: unknown;
  private disposed = false;

  constructor(private readonly options: WorkflowRuntimeOptions) {
    this.registry = options.registry || createWorkflowRegistry();
    this.capabilities = options.capabilities || createWorkflowCapabilities();
    const clock = options.clock || systemWorkflowClock;
    const idFactory = options.idFactory || randomWorkflowIdFactory;
    const limiter = options.limiter || createWorkflowExecutionLimiter(options.executionGroups);
    this.resolveWorkspaceId = options.resolveWorkspaceId || (async (workspaceId?: string) => workspaceId || options.defaultWorkspaceId || 'default');
    this.engine = createEngine(options.baseContext || {}, {
      ...options.engineOptions,
      registry: this.registry,
      capabilities: this.capabilities,
      clock,
      idFactory,
      limiter
    });
    this.application = new WorkflowApplicationService(this.engine, options.store, this.resolveWorkspaceId);
    this.events = new WorkflowRuntimeEvents(this.engine);
    this.engine.onTyped('run:status', this.persistRun);
  }

  async execute(request: WorkflowRunRequest | WorkflowLegacyRunRequest): Promise<WorkflowExecutionResult> {
    try {
      const handle = await this.start(request);
      const record = await handle.completionPromise;
      if (record.status === 'completed') return { ok: true, runId: record.runId, status: record.status, record };
      return {
        ok: false,
        runId: record.runId,
        status: record.status,
        error: record.status === 'canceled' ? 'canceled' : record.error || 'workflow-execution-failed',
        record
      };
    } catch (error) {
      if (error instanceof WorkflowRuntimeRequestError) {
        return {
          ok: false,
          error: error.code,
          ...(error.issues ? { validation: { ok: false, issues: error.issues, errors: error.issues.map((issue) => issue.message) } } : {})
        };
      }
      const details = error && typeof error === 'object' && 'details' in error ? (error as { details?: WorkflowExecutionResult }).details : undefined;
      return details || { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async start(request: WorkflowRunRequest | WorkflowLegacyRunRequest): Promise<WorkflowRunHandle> {
    const prepared = await this.prepareRequest(request);
    this.assertActive();
    const handle = await this.application.startValidatedDefinition(prepared.definition, prepared.input, prepared.metadata);
    const tracked = handle.completionPromise.finally(() => this.activeRuns.delete(handle.runId));
    this.activeRuns.set(handle.runId, tracked);
    return { ...handle, completionPromise: tracked };
  }

  async run(request: WorkflowRunRequest | WorkflowLegacyRunRequest): Promise<WorkflowRunRecord> {
    return (await this.start(request)).completionPromise;
  }

  async validate(request: WorkflowRunRequest | WorkflowLegacyRunRequest): Promise<ValidateResult> {
    try {
      const prepared = await this.prepareRequest(request);
      return this.engine.validate(prepared.definition);
    } catch (error) {
      if (error instanceof WorkflowRuntimeRequestError && error.issues) {
        return { ok: false, issues: error.issues, errors: error.issues.map((issue) => issue.message) };
      }
      return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
    }
  }

  async cancel(runId: string, scope?: WorkflowRunScope): Promise<boolean> {
    this.assertActive();
    const workspaceId = scope?.kind === 'workspace' ? scope.id : this.engine.getRun(runId)?.workspaceId;
    return this.application.cancelRun(runId, workspaceId);
  }

  async flush(): Promise<void> {
    await this.persistenceTail;
    if (this.persistenceError) throw this.persistenceError;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.engine.dispose();
    await Promise.allSettled(this.activeRuns.values());
    this.engine.off('run:status', this.persistRun);
    await this.flush();
  }

  private readonly persistRun = (record: WorkflowRunRecord): void => {
    if (!this.options.store.saveRun) return;
    let snapshot: WorkflowRunRecord;
    try {
      snapshot = structuredClone(record);
    } catch (error) {
      this.persistenceError = error;
      return;
    }
    const operation = this.persistenceTail.catch(() => {}).then(() => this.options.store.saveRun?.(snapshot));
    this.persistenceTail = operation.then(() => undefined);
    void operation.catch((error) => {
      this.persistenceError = error;
    });
  };

  private async prepareRequest(request: WorkflowRunRequest | WorkflowLegacyRunRequest): Promise<PreparedRuntimeRequest> {
    this.assertActive();
    const normalized = normalizeWorkflowRunRequest(request);
    const parsed = parseWorkflowRuntimeRunRequest(normalized);
    if (!parsed.ok) throw new WorkflowRuntimeRequestError('invalid-run-request', 'Workflow run request is invalid', parsed.issues);

    const context = parsed.request.context || {};
    const requestedWorkspaceId = parsed.request.scope?.kind === 'workspace' ? parsed.request.scope.id : typeof context.workspaceId === 'string' ? context.workspaceId : undefined;
    const workspaceId = await this.resolveWorkspaceId(requestedWorkspaceId);
    const definition = parsed.request.definition || (parsed.request.definitionId ? await this.application.getDefinition(parsed.request.definitionId, workspaceId) : undefined);
    this.assertActive();
    if (!definition) throw new WorkflowRuntimeRequestError('workflow-not-found', `Workflow not found: ${parsed.request.definitionId || 'unknown'}`);

    const input = {
      ...(parsed.request.input || {}),
      ...(parsed.request.configOverrides ? { __configOverrides__: parsed.request.configOverrides } : {})
    };
    const metadata = {
      ...context,
      workspaceId,
      ...(parsed.request.scope ? { scope: parsed.request.scope } : {}),
      ...(parsed.request.trigger ? { trigger: parsed.request.trigger } : {}),
      ...(parsed.request.actor ? { actor: parsed.request.actor } : {}),
      context
    };
    return { definition: { ...definition, workspaceId }, input, metadata, workspaceId };
  }

  private assertActive(): void {
    if (this.disposed) throw new WorkflowRuntimeRequestError('runtime-disposed', 'Workflow runtime is disposed');
  }
}

export function createWorkflowRuntime(options: WorkflowRuntimeOptions): WorkflowRuntime {
  return new WorkflowRuntime(options);
}
