import { describe, expect, it } from 'vitest';

import type { WorkflowDefinition, WorkflowDraft } from '../packages/workflow/types';
import { editableInputDefaultsForNode, toPersistedWorkflowDefinition, toWorkflowEditorDefinitionState } from '../src/pages/WorkflowBuilderPage/workflow-definition-mapper';

describe('workflow builder definition mapping', () => {
  it('keeps non-start defaults while removing one-run start input', () => {
    const draft: WorkflowDraft = {
      id: 'workflow-1',
      name: 'Workflow One',
      workspaceId: 'workspace-1',
      nodes: [
        { id: 'start', type: 'core/start', x: 0, y: 0, inputDefaults: { text: 'one-run text' } },
        { id: 'transform', type: 'test/transform', x: 100, y: 0, inputDefaults: { prefix: 'saved', enabled: false } }
      ],
      edges: []
    };

    const definition = toPersistedWorkflowDefinition(draft);
    expect(definition.nodes[0].inputDefaults).toBeUndefined();
    expect(definition.nodes[1].inputDefaults).toEqual({ prefix: 'saved', enabled: false });
    expect(definition.options).toEqual({ concurrency: 1, errorStrategy: 'fail-fast' });
  });

  it('does not restore persisted input into the start node editor', () => {
    expect(editableInputDefaultsForNode({ type: 'core/start', inputDefaults: { file: '/tmp/private.mov' } })).toEqual({});
    expect(editableInputDefaultsForNode({ type: 'test/node', inputDefaults: { count: 0 } })).toEqual({ count: 0 });
  });

  it('maps an existing definition without changing graph identity', () => {
    const definition: WorkflowDefinition = {
      id: 'workflow-1',
      name: 'Workflow One',
      workspaceId: 'workspace-1',
      isPreset: true,
      nodes: [
        { id: 'start', type: 'core/start', x: 10, y: 20, inputDefaults: { text: 'one-run' } },
        { id: 'transform', type: 'test/transform', x: 30, y: 40, config: { mode: 'fast' }, inputDefaults: { prefix: 'saved' } }
      ],
      edges: [{ id: 'edge-1', from: { nodeId: 'start', port: 'payload' }, to: { nodeId: 'transform', port: 'input' } }]
    };

    const state = toWorkflowEditorDefinitionState(definition, [{ id: 'test/transform', label: 'Transform', inputs: [], outputs: [] }], {
      clonePreset: false,
      createId: () => 'unused',
      random: () => 0
    });

    expect(state.isPresetWorkflow).toBe(true);
    expect(state.draft.id).toBe('workflow-1');
    expect(state.nodes.map((node) => node.id)).toEqual(['start', 'transform']);
    expect(state.edges[0]).toMatchObject({ id: 'edge-1', source: 'start', target: 'transform', sourceHandle: 'payload', targetHandle: 'input' });
    expect(state.draft.nodes[0].inputDefaults).toEqual({});
    expect(state.draft.nodes[1]).toMatchObject({ config: { mode: 'fast' }, inputDefaults: { prefix: 'saved' } });
  });

  it('clones a preset with remapped graph ids and retained non-start defaults', () => {
    const definition: WorkflowDefinition = {
      id: 'preset-1',
      name: 'Preset One',
      workspaceId: 'workspace-1',
      nodes: [
        { id: 'start', type: 'core/start', x: 0, y: 0, inputDefaults: { text: 'discard' } },
        { id: 'transform', type: 'test/transform', x: 100, y: 0, inputDefaults: { prefix: 'keep' } },
        { id: 'end', type: 'core/end', x: 200, y: 0 }
      ],
      edges: [
        { id: 'old-edge-1', from: { nodeId: 'start', port: 'payload' }, to: { nodeId: 'transform', port: 'input' } },
        { id: 'old-edge-2', from: { nodeId: 'transform', port: 'output' }, to: { nodeId: 'end', port: 'result' } }
      ]
    };
    const generatedIds = ['node1', 'edge01', 'edge02', 'draft1'];

    const state = toWorkflowEditorDefinitionState(definition, [], {
      clonePreset: true,
      createId: () => generatedIds.shift() || 'unexpected',
      random: () => 0
    });

    expect(state.isPresetWorkflow).toBe(false);
    expect(state.draft).toMatchObject({ id: 'new-draft1', name: 'Preset One (副本)' });
    expect(state.nodes.map((node) => node.id)).toEqual(['start', 'test/transform-node1', 'end']);
    expect(state.edges).toMatchObject([
      { id: 'e-edge01', source: 'start', target: 'test/transform-node1' },
      { id: 'e-edge02', source: 'test/transform-node1', target: 'end' }
    ]);
    expect(state.draft.nodes[0].inputDefaults).toEqual({});
    expect(state.draft.nodes[1].inputDefaults).toEqual({ prefix: 'keep' });
  });
});
