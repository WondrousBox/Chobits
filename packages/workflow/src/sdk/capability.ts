export interface WorkflowCapabilityToken<T = unknown> {
  readonly id: string;
  readonly description?: string;
  readonly valueType?: T;
}

export interface WorkflowCapabilityResolver {
  has(token: WorkflowCapabilityToken<unknown> | string): boolean;
  get<T>(token: WorkflowCapabilityToken<T>): T | undefined;
  require<T>(token: WorkflowCapabilityToken<T>): T;
}

export class MissingWorkflowCapabilityError extends Error {
  readonly code = 'missing-capability';

  constructor(readonly capabilityId: string) {
    super(`Missing workflow capability: ${capabilityId}`);
    this.name = 'MissingWorkflowCapabilityError';
  }
}

export function defineCapability<T>(id: string, options: { description?: string } = {}): WorkflowCapabilityToken<T> {
  const normalizedId = id.trim();
  if (!normalizedId) throw new Error('Workflow capability id is required');
  return Object.freeze({ id: normalizedId, ...options });
}
