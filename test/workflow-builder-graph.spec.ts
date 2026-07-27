import { describe, expect, it } from 'vitest';

import { createWorkflowEditorEdge, createWorkflowEditorNode, toWorkflowDraftGraph } from '../src/pages/WorkflowBuilderPage/workflow-graph-mapper';

describe('workflow builder graph mapping', () => {
  it('creates editable nodes with config defaults and protects structural nodes', () => {
    expect(
      createWorkflowEditorNode(
        { id: 'core/start', label: 'Start', inputs: [], outputs: [] },
        () => 'id',
        () => 0
      )
    ).toBeNull();
    expect(
      createWorkflowEditorNode(
        {
          id: 'test/transform',
          label: 'Transform',
          inputs: [],
          outputs: [],
          config: [
            { key: 'enabled', type: 'boolean', default: false },
            { key: 'prefix', type: 'string' }
          ]
        },
        () => 'node1',
        () => 0.5
      )
    ).toMatchObject({
      id: 'test/transform-node1',
      position: { x: 300, y: 170 },
      data: { config: { enabled: false, prefix: '' }, inputDefaults: {} }
    });
  });

  it('requires explicit handles and maps an editor graph back to a draft', () => {
    expect(createWorkflowEditorEdge({ source: 'a', target: 'b', sourceHandle: null, targetHandle: 'input' }, () => 'edge1')).toBeNull();
    const edge = createWorkflowEditorEdge({ source: 'a', target: 'b', sourceHandle: 'output', targetHandle: 'input' }, () => 'edge1');
    expect(edge).toMatchObject({ id: 'e-edge1', source: 'a', target: 'b', sourceHandle: 'output', targetHandle: 'input' });

    const graph = toWorkflowDraftGraph(
      [
        {
          id: 'a',
          type: 'specNode',
          position: { x: 10, y: 20 },
          data: {
            label: 'A',
            specId: 'test/a',
            spec: { id: 'test/a', label: 'A', inputs: [], outputs: [] },
            config: { mode: 'fast' },
            inputDefaults: { prefix: 'saved' }
          }
        }
      ],
      [edge!]
    );
    expect(graph).toEqual({
      nodes: [{ id: 'a', type: 'test/a', x: 10, y: 20, config: { mode: 'fast' }, inputDefaults: { prefix: 'saved' } }],
      edges: [{ id: 'e-edge1', from: { nodeId: 'a', port: 'output' }, to: { nodeId: 'b', port: 'input' } }]
    });
  });
});
