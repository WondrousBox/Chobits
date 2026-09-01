import { MissingWorkflowCapabilityError, type WorkflowCapabilityResolver, type WorkflowCapabilityToken } from '../sdk/capability.js';

export class WorkflowCapabilities implements WorkflowCapabilityResolver {
  private readonly values = new Map<string, unknown>();

  constructor(entries: Iterable<readonly [WorkflowCapabilityToken<unknown>, unknown]> = []) {
    for (const [token, value] of entries) this.provide(token, value);
  }

  provide<T>(token: WorkflowCapabilityToken<T>, value: T): this {
    this.values.set(token.id, value);
    return this;
  }

  has(token: WorkflowCapabilityToken<unknown> | string): boolean {
    return this.values.has(typeof token === 'string' ? token : token.id);
  }

  get<T>(token: WorkflowCapabilityToken<T>): T | undefined {
    return this.values.get(token.id) as T | undefined;
  }

  require<T>(token: WorkflowCapabilityToken<T>): T {
    if (!this.values.has(token.id)) throw new MissingWorkflowCapabilityError(token.id);
    return this.values.get(token.id) as T;
  }
}

export function createWorkflowCapabilities(entries?: Iterable<readonly [WorkflowCapabilityToken<unknown>, unknown]>): WorkflowCapabilities {
  return new WorkflowCapabilities(entries);
}
