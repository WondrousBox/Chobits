import { describe, expect, it } from 'vitest';

import { createEngine } from '../packages/workflow/engine';
import { ConditionNode } from '../packages/workflow/nodes/condition';
import { registerNode } from '../packages/workflow/registry';
import { CURRENT_WORKFLOW_SCHEMA_VERSION, parseWorkflowDefinition, workflowRunRequestSchema, workflowSaveRequestSchema } from '../packages/workflow/schema';
import type { NodeHandler, WorkflowDefinition } from '../packages/workflow/types';

function handler(id: string, inputs: NodeHandler['spec']['inputs'], outputs: NodeHandler['spec']['outputs'], config?: NodeHandler['spec']['config']): NodeHandler {
  return {
    spec: { id, label: id, inputs, outputs, config },
    async run() {
      return {};
    }
  };
}

registerNode(handler('validation/string-source', [], [{ key: 'value', type: 'string' }]));
registerNode(handler('validation/number-source', [], [{ key: 'value', type: 'number' }]));
registerNode(handler('validation/string-target', [{ key: 'value', type: 'string', required: true }], []));
registerNode(handler('validation/config-target', [], [], [{ key: 'count', type: 'number' }]));
registerNode(ConditionNode);

function definition(patch: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    id: 'validation-workflow',
    name: 'validation workflow',
    nodes: [
      { id: 'source', type: 'validation/string-source' },
      { id: 'target', type: 'validation/string-target' }
    ],
    edges: [{ id: 'source-target', from: { nodeId: 'source', port: 'value' }, to: { nodeId: 'target', port: 'value' } }],
    ...patch
  };
}

describe('workflow definition schema', () => {
  it('normalizes legacy definitions to the current schema version', () => {
    const parsed = parseWorkflowDefinition(definition());

    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.definition.schemaVersion).toBe(CURRENT_WORKFLOW_SCHEMA_VERSION);
  });

  it('rejects unsupported schema versions with a structured path', () => {
    const parsed = parseWorkflowDefinition({ ...definition(), schemaVersion: 99 });

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'unsupported-schema-version', path: ['schemaVersion'] })]));
    }
  });

  it('validates workflow run request shape', () => {
    expect(workflowRunRequestSchema.safeParse({ defId: '', input: [] }).success).toBe(false);
    expect(workflowRunRequestSchema.safeParse({ defId: 'workflow-1', input: { text: 'hello' } }).success).toBe(true);
  });

  it('requires a definition in workflow save requests', () => {
    expect(workflowSaveRequestSchema.safeParse({ workspaceId: 'workspace-1' }).success).toBe(false);
    expect(workflowSaveRequestSchema.safeParse({ def: definition(), workspaceId: 'workspace-1' }).success).toBe(true);
  });
});

describe('workflow graph validation', () => {
  it('returns a structured issue for a missing definition', async () => {
    const result = await createEngine({}).validate(undefined as unknown as WorkflowDefinition, { checkRuntimeDependencies: false });

    expect(result).toEqual({
      ok: false,
      errors: [expect.any(String)],
      issues: [expect.objectContaining({ code: 'invalid-definition', path: [] })]
    });
  });

  it('accepts a compatible, fully connected definition', async () => {
    await expect(createEngine({}).validate(definition(), { checkRuntimeDependencies: false })).resolves.toEqual({ ok: true });
  });

  it.each([
    {
      name: 'duplicate node ids',
      patch: {
        nodes: [
          { id: 'source', type: 'validation/string-source' },
          { id: 'source', type: 'validation/string-target' }
        ]
      },
      code: 'duplicate-node-id'
    },
    {
      name: 'duplicate edge ids',
      patch: {
        edges: [
          { id: 'duplicate', from: { nodeId: 'source', port: 'value' }, to: { nodeId: 'target', port: 'value' } },
          { id: 'duplicate', from: { nodeId: 'source', port: 'value' }, to: { nodeId: 'target', port: 'value' } }
        ]
      },
      code: 'duplicate-edge-id'
    },
    {
      name: 'missing required inputs',
      patch: { edges: [] },
      code: 'missing-required-input'
    },
    {
      name: 'incompatible port types',
      patch: {
        nodes: [
          { id: 'source', type: 'validation/number-source' },
          { id: 'target', type: 'validation/string-target' }
        ]
      },
      code: 'incompatible-port-types'
    },
    {
      name: 'multiple connections to a single input',
      patch: {
        nodes: [
          { id: 'source', type: 'validation/string-source' },
          { id: 'source-2', type: 'validation/string-source' },
          { id: 'target', type: 'validation/string-target' }
        ],
        edges: [
          { id: 'source-target', from: { nodeId: 'source', port: 'value' }, to: { nodeId: 'target', port: 'value' } },
          { id: 'source-2-target', from: { nodeId: 'source-2', port: 'value' }, to: { nodeId: 'target', port: 'value' } }
        ]
      },
      code: 'duplicate-input-connection'
    },
    {
      name: 'invalid config value types',
      patch: { nodes: [{ id: 'config', type: 'validation/config-target', config: { count: 'not-a-number' } }], edges: [] },
      code: 'invalid-node-config'
    },
    {
      name: 'invalid input default types',
      patch: { nodes: [{ id: 'target', type: 'validation/string-target', inputDefaults: { value: 42 } }], edges: [] },
      code: 'invalid-input-default'
    }
  ])('reports $name as a structured issue', async ({ patch, code }) => {
    const result = await createEngine({}).validate(definition(patch as Partial<WorkflowDefinition>), { checkRuntimeDependencies: false });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code })]));
  });

  it('rejects duplicate dynamic port keys', async () => {
    const result = await createEngine({}).validate(
      definition({
        nodes: [
          {
            id: 'condition',
            type: 'logic/condition',
            config: {
              inputs: [
                { key: 'value', label: 'Value' },
                { key: 'value', label: 'Duplicate value' }
              ],
              conditions: []
            }
          }
        ],
        edges: []
      }),
      { checkRuntimeDependencies: false }
    );

    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'invalid-node-port', nodeId: 'condition' })]));
  });
});
