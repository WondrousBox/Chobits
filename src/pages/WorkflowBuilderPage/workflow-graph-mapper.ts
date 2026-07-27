import type { WorkflowEdgeDraft, WorkflowNodeDraft } from '@packages/workflow/types';
import type { Connection, Edge, Node } from 'reactflow';

import type { NodeData, NodeSpec } from './types';

export function createWorkflowEditorNode(spec: NodeSpec, createId: (size: number) => string, random: () => number): Node<NodeData> | null {
  if (spec.id === 'core/start' || spec.id === 'core/end') return null;
  return {
    id: `${spec.id}-${createId(4)}`,
    type: 'specNode',
    position: { x: 250 + random() * 100, y: 120 + random() * 100 },
    data: {
      label: spec.label,
      specId: spec.id,
      spec,
      config: Object.fromEntries((spec.config || []).map((field) => [field.key, field.default ?? ''])),
      inputDefaults: {}
    }
  };
}

export function createWorkflowEditorEdge(connection: Connection, createId: (size: number) => string): Edge | null {
  if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return null;
  return { ...connection, id: `e-${createId(6)}` } as Edge;
}

export function toWorkflowDraftGraph(nodes: Node<NodeData>[], edges: Edge[]): { nodes: WorkflowNodeDraft[]; edges: WorkflowEdgeDraft[] } {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.data.specId,
      x: node.position.x,
      y: node.position.y,
      config: node.data.config || {},
      inputDefaults: node.data.inputDefaults || {}
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      from: { nodeId: edge.source, port: edge.sourceHandle || 'payload' },
      to: { nodeId: edge.target, port: edge.targetHandle || 'result' }
    }))
  };
}
