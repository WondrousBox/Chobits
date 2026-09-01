import type { WorkflowDefinition } from '../types.js';

export type WorkflowGraph = Pick<WorkflowDefinition, 'nodes' | 'edges'>;

export interface WorkflowDagPlan {
  order: string[];
  levels: string[][];
  terminalNodeIds: string[];
}

const INVALID_DAG_MESSAGE = 'Workflow has cycles or disconnected nodes';

export function planWorkflowDag(graph: WorkflowGraph): WorkflowDagPlan {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const incomingCount = new Map(graph.nodes.map((node) => [node.id, 0]));
  const incomingByNode = new Map<string, string[]>();
  const outgoingByNode = new Map<string, string[]>();

  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.from.nodeId) || !nodeIds.has(edge.to.nodeId)) {
      throw new Error(INVALID_DAG_MESSAGE);
    }
    incomingCount.set(edge.to.nodeId, (incomingCount.get(edge.to.nodeId) || 0) + 1);
    const incoming = incomingByNode.get(edge.to.nodeId) || [];
    incoming.push(edge.from.nodeId);
    incomingByNode.set(edge.to.nodeId, incoming);
    const outgoing = outgoingByNode.get(edge.from.nodeId) || [];
    outgoing.push(edge.to.nodeId);
    outgoingByNode.set(edge.from.nodeId, outgoing);
  }

  const queue = graph.nodes.filter((node) => (incomingCount.get(node.id) || 0) === 0).map((node) => node.id);
  const order: string[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    order.push(nodeId);
    for (const downstreamId of outgoingByNode.get(nodeId) || []) {
      incomingCount.set(downstreamId, (incomingCount.get(downstreamId) || 0) - 1);
      if ((incomingCount.get(downstreamId) || 0) === 0) queue.push(downstreamId);
    }
  }

  if (order.length !== graph.nodes.length) throw new Error(INVALID_DAG_MESSAGE);

  const levelByNode = new Map<string, number>();
  const levels: string[][] = [];
  for (const nodeId of order) {
    const level = Math.max(0, ...(incomingByNode.get(nodeId) || []).map((upstreamId) => (levelByNode.get(upstreamId) ?? -1) + 1));
    levelByNode.set(nodeId, level);
    const levelNodes = levels[level] || [];
    levelNodes.push(nodeId);
    levels[level] = levelNodes;
  }

  return {
    order,
    levels,
    terminalNodeIds: graph.nodes.map((node) => node.id).filter((nodeId) => !outgoingByNode.has(nodeId))
  };
}
