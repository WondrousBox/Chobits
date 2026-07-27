import type { WorkflowDraft } from '@packages/workflow/types';
import { nanoid } from 'nanoid';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { Edge, Node, NodeChange, OnNodesChange } from 'reactflow';
import { addEdge, useEdgesState, useNodesInitialized, useNodesState, useReactFlow } from 'reactflow';

import { autoLayout } from './layout';
import type { NodeData, NodeSpec } from './types';
import { createWorkflowEditorEdge, createWorkflowEditorNode, toWorkflowDraftGraph } from './workflow-graph-mapper';

interface WorkflowGraphEditorState {
  nodes: Node<NodeData>[];
  setNodes: Dispatch<SetStateAction<Node<NodeData>[]>>;
  onNodesChange: OnNodesChange;
  edges: Edge[];
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  onEdgesChange: (changes: any[]) => void;
  onConnect(connection: any): void;
  selectedNode: Node<NodeData> | undefined;
  selectNode(nodeId: string | null): void;
  selectNodes(nodes: Node[]): void;
  updateSelectedNode(updater: (previous: NodeData) => Partial<NodeData>): void;
  addSpecNode(spec: NodeSpec): void;
  performLayout(): void;
  markNeedsAutoFit(): void;
}

export function useWorkflowGraphEditor(): WorkflowGraphEditorState {
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const [nodes, setNodes, rawOnNodesChange] = useNodesState<NodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hasAutoFitted, setHasAutoFitted] = useState(false);

  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      rawOnNodesChange(changes.filter((change) => change.type !== 'remove' || (change.id !== 'start' && change.id !== 'end')));
    },
    [rawOnNodesChange]
  );

  const onConnect = useCallback(
    (connection: any): void => {
      const edge = createWorkflowEditorEdge(connection, nanoid);
      if (edge) setEdges((current) => addEdge(edge, current));
    },
    [setEdges]
  );

  const addSpecNode = useCallback(
    (spec: NodeSpec): void => {
      const node = createWorkflowEditorNode(spec, nanoid, Math.random);
      if (node) setNodes((current) => [...current, node]);
    },
    [setNodes]
  );

  const selectNode = useCallback((nodeId: string | null): void => setSelectedNodeId(nodeId), []);
  const selectNodes = useCallback((selectedNodes: Node[]): void => setSelectedNodeId(selectedNodes[0]?.id || null), []);
  const updateSelectedNode = useCallback(
    (updater: (previous: NodeData) => Partial<NodeData>): void => {
      if (!selectedNodeId) return;
      setNodes((current) => current.map((node) => (node.id === selectedNodeId ? { ...node, data: { ...node.data, ...updater(node.data) } } : node)));
    },
    [selectedNodeId, setNodes]
  );

  const performLayout = useCallback((): void => {
    setNodes(autoLayout(nodes, edges));
    setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 100);
  }, [nodes, edges, setNodes, fitView]);

  const markNeedsAutoFit = useCallback(() => setHasAutoFitted(false), []);
  useEffect(() => {
    if (!nodesInitialized || hasAutoFitted || nodes.length === 0) return;
    const timer = setTimeout(() => {
      fitView({ padding: 0.2, duration: 300 });
      setHasAutoFitted(true);
    }, 100);
    return () => clearTimeout(timer);
  }, [nodesInitialized, hasAutoFitted, nodes.length, fitView]);

  return {
    nodes,
    setNodes,
    onNodesChange,
    edges,
    setEdges,
    onEdgesChange,
    onConnect,
    selectedNode: nodes.find((node) => node.id === selectedNodeId),
    selectNode,
    selectNodes,
    updateSelectedNode,
    addSpecNode,
    performLayout,
    markNeedsAutoFit
  };
}

export function useWorkflowDraftGraphSync(setDraft: Dispatch<SetStateAction<WorkflowDraft | null>>, nodes: Node<NodeData>[], edges: Edge[]): void {
  useEffect(() => {
    const graph = toWorkflowDraftGraph(nodes, edges);
    setDraft((current) => (current ? { ...current, ...graph } : null));
  }, [nodes, edges, setDraft]);
}
