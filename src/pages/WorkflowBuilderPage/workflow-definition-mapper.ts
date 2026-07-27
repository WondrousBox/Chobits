import { CURRENT_WORKFLOW_SCHEMA_VERSION } from '@packages/workflow/schema';
import type { WorkflowDefinition, WorkflowDraft, WorkflowNodeDraft } from '@packages/workflow/types';
import type { Edge, Node } from 'reactflow';

import type { NodeData, NodeSpec } from './types';

const START_NODE_TYPE = 'core/start';
const START_NODE_ID = 'start';
const END_NODE_ID = 'end';

export interface WorkflowEditorDefinitionState {
  draft: WorkflowDraft;
  nodes: Node<NodeData>[];
  edges: Edge[];
  isPresetWorkflow: boolean;
}

interface WorkflowEditorDefinitionOptions {
  clonePreset: boolean;
  createId(size: number): string;
  random(): number;
}

export function editableInputDefaultsForNode(node: Pick<WorkflowNodeDraft, 'type' | 'inputDefaults'>): Record<string, any> {
  if (node.type === START_NODE_TYPE) return {};
  return { ...(node.inputDefaults || {}) };
}

export function toWorkflowEditorDefinitionState(definition: WorkflowDefinition, specs: NodeSpec[], { clonePreset, createId, random }: WorkflowEditorDefinitionOptions): WorkflowEditorDefinitionState {
  const nodeIdMap = new Map<string, string>();
  for (const node of definition.nodes) {
    const keepId = !clonePreset || node.id === START_NODE_ID || node.id === END_NODE_ID;
    nodeIdMap.set(node.id, keepId ? node.id : `${node.type}-${createId(4)}`);
  }

  const nodes = definition.nodes.map((node): Node<NodeData> => {
    const id = nodeIdMap.get(node.id) || node.id;
    const spec = specs.find((candidate) => candidate.id === node.type) || {
      id: node.type,
      label: node.type,
      inputs: [],
      outputs: [],
      category: 'core'
    };
    return {
      id,
      type: 'specNode',
      position: {
        x: node.x ?? 100 + random() * 200,
        y: node.y ?? 100 + random() * 200
      },
      data: {
        label: spec.label,
        specId: spec.id,
        spec,
        config: node.config || {},
        inputDefaults: editableInputDefaultsForNode(node)
      }
    };
  });

  const edges = definition.edges.map(
    (edge): Edge => ({
      id: clonePreset ? `e-${createId(6)}` : edge.id,
      source: nodeIdMap.get(edge.from.nodeId) || edge.from.nodeId,
      target: nodeIdMap.get(edge.to.nodeId) || edge.to.nodeId,
      sourceHandle: edge.from.port,
      targetHandle: edge.to.port
    })
  );

  return {
    nodes,
    edges,
    isPresetWorkflow: clonePreset ? false : Boolean(definition.isPreset),
    draft: {
      id: clonePreset ? `new-${createId(6)}` : definition.id,
      name: clonePreset ? (definition.name ? `${definition.name} (副本)` : '新建工作流') : definition.name || definition.id,
      schemaVersion: clonePreset ? CURRENT_WORKFLOW_SCHEMA_VERSION : definition.schemaVersion || CURRENT_WORKFLOW_SCHEMA_VERSION,
      workspaceId: definition.workspaceId,
      description: definition.description,
      icon: definition.icon,
      options: definition.options,
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
    }
  };
}

export function toPersistedWorkflowDefinition(draft: WorkflowDraft): WorkflowDefinition {
  return {
    id: draft.id,
    name: draft.name,
    schemaVersion: draft.schemaVersion || CURRENT_WORKFLOW_SCHEMA_VERSION,
    workspaceId: draft.workspaceId,
    description: draft.description,
    icon: draft.icon,
    nodes: draft.nodes.map((node) => {
      const inputDefaults = editableInputDefaultsForNode(node);
      return {
        id: node.id,
        type: node.type,
        x: node.x,
        y: node.y,
        config: node.config,
        ...(Object.keys(inputDefaults).length > 0 ? { inputDefaults } : {})
      };
    }),
    edges: draft.edges.map((edge) => ({ id: edge.id, from: edge.from, to: edge.to })),
    options: draft.options ?? { concurrency: 1, errorStrategy: 'fail-fast' }
  };
}
