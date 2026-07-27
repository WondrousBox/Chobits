import { z } from 'zod';

import type { WorkflowDefinition, WorkflowValidationIssue } from './types';

export const CURRENT_WORKFLOW_SCHEMA_VERSION = 1;

const stringRecordSchema = z.record(z.string(), z.unknown());

const nodeInstanceSchema = z.object({
  id: z.string().trim().min(1),
  type: z.string().trim().min(1),
  name: z.string().optional(),
  config: stringRecordSchema.optional(),
  inputDefaults: stringRecordSchema.optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional()
});

const edgeEndpointSchema = z.object({
  nodeId: z.string().trim().min(1),
  port: z.string().trim().min(1)
});

const edgeSchema = z.object({
  id: z.string().trim().min(1),
  from: edgeEndpointSchema,
  to: edgeEndpointSchema
});

export const workflowDefinitionSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  schemaVersion: z.literal(CURRENT_WORKFLOW_SCHEMA_VERSION).default(CURRENT_WORKFLOW_SCHEMA_VERSION),
  workspaceId: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  nodes: z.array(nodeInstanceSchema).min(1),
  edges: z.array(edgeSchema),
  options: z
    .object({
      concurrency: z.number().int().min(1).max(64).optional(),
      errorStrategy: z.enum(['fail-fast', 'continue']).optional()
    })
    .optional(),
  isPreset: z.boolean().optional()
});

export const workflowRunRequestSchema = z.object({
  defId: z.string().trim().min(1),
  input: stringRecordSchema.optional(),
  metadata: stringRecordSchema.optional()
});

export const workflowSaveRequestSchema = z.object({
  def: z.unknown().refine((value) => value !== undefined, { message: 'Workflow definition is required' }),
  workspaceId: z.string().trim().min(1).optional()
});

export type WorkflowDefinitionParseResult = { ok: true; definition: WorkflowDefinition } | { ok: false; issues: WorkflowValidationIssue[] };

export function zodIssuesToWorkflowIssues(issues: z.core.$ZodIssue[], code: WorkflowValidationIssue['code'] = 'invalid-definition'): WorkflowValidationIssue[] {
  return issues.map((issue) => ({
    code: issue.path[0] === 'schemaVersion' ? 'unsupported-schema-version' : code,
    message: issue.message,
    path: issue.path.map((part) => (typeof part === 'symbol' ? String(part) : part))
  }));
}

export function migrateWorkflowDefinition(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion === undefined) {
    return { ...candidate, schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION };
  }
  return value;
}

export function parseWorkflowDefinition(value: unknown): WorkflowDefinitionParseResult {
  const parsed = workflowDefinitionSchema.safeParse(migrateWorkflowDefinition(value));
  if (parsed.success) {
    return { ok: true, definition: parsed.data as WorkflowDefinition };
  }

  return {
    ok: false,
    issues: zodIssuesToWorkflowIssues(parsed.error.issues)
  };
}

export function normalizeWorkflowDefinition(value: unknown): WorkflowDefinition {
  const parsed = parseWorkflowDefinition(value);
  if (!parsed.ok) {
    throw new Error(parsed.issues.map((issue) => `${issue.path.join('.') || 'workflow'}: ${issue.message}`).join('; '));
  }
  return parsed.definition;
}
