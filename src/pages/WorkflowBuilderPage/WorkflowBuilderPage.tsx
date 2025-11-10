import 'reactflow/dist/style.css';

import { nanoid } from 'nanoid';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, { addEdge, Background, Connection, Controls, Edge, MiniMap, Node, NodeChange, OnNodesChange, ReactFlowProvider, useEdgesState, useNodesState } from 'reactflow';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { NodeSpec, WorkflowDraft } from '@/types/workflow';

import FloatingActions from './FloatingActions';
import FloatingInspector from './FloatingInspector';
import FloatingPalette from './FloatingPalette';
import SpecNode from './SpecNode';
import type { NodeData } from './types';

// IPC helper
const invoke = window.ipcRenderer.invoke;

function useNodeSpecs(): NodeSpec[] {
  const [specs, setSpecs] = useState<NodeSpec[]>([]);
  useEffect(() => {
    invoke('wf:listNodes').then((list: NodeSpec[]) => setSpecs(list || []));
  }, []);
  return specs;
}

// NodeData moved to ./types

const START_NODE_ID = 'start';
const END_NODE_ID = 'end';

function buildInitialDraft(): WorkflowDraft {
  return {
    id: 'new-' + nanoid(6),
    name: '新建工作流',
    nodes: [
      { id: START_NODE_ID, type: 'start', x: 120, y: 180, config: {}, inputDefaults: {} },
      { id: END_NODE_ID, type: 'end', x: 620, y: 180, config: {}, inputDefaults: {} }
    ],
    edges: []
  };
}

const paletteWidth = 180;

const WorkflowCanvas: React.FC = () => {
  const specs = useNodeSpecs();
  const [draft, setDraft] = useState<WorkflowDraft>(buildInitialDraft());
  const [loadingExisting, setLoadingExisting] = useState(false); // reserved for future loading indicator
  const initialNodes: Node<NodeData>[] = [
    {
      id: START_NODE_ID,
      type: 'specNode',
      position: { x: 120, y: 180 },
      data: { label: '开始', specId: 'start', spec: { id: 'start', label: '开始', inputs: [], outputs: [{ key: 'result', type: 'any' }], category: 'core' }, config: {}, inputDefaults: {} }
    },
    {
      id: END_NODE_ID,
      type: 'specNode',
      position: { x: 620, y: 180 },
      data: { label: '结束', specId: 'end', spec: { id: 'end', label: '结束', inputs: [{ key: 'payload', type: 'any' }], outputs: [], category: 'core' }, config: {}, inputDefaults: {} }
    }
  ];
  const [nodes, setNodes, rawOnNodesChange] = useNodesState<NodeData>(initialNodes);
  // Wrap nodes change handler to prevent deletion of start/end
  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const filtered = changes.filter((ch) => {
        if (ch.type === 'remove' && (ch.id === START_NODE_ID || ch.id === END_NODE_ID)) return false;
        return true;
      });
      rawOnNodesChange(filtered);
    },
    [rawOnNodesChange]
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [validateResult, setValidateResult] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const selectedNode = useMemo(() => draft.nodes.find((n) => n.id === selectedNodeId), [draft, selectedNodeId]);

  // Load existing workflow definition if payload provides id
  useEffect(() => {
    (async () => {
      try {
        const payload = await window.YUA.window['window:payload:get']('workflowBuilder' as any);
        if (payload && payload.id) {
          setLoadingExisting(true);
          const existing = await invoke('wf:getDefinition', { id: payload.id }).catch(() => null);
          if (existing && existing.nodes && existing.edges) {
            // Map existing nodes into ReactFlow nodes (preserve start/end positions or fallback)
            const rfNodes: Node<NodeData>[] = existing.nodes.map((n: any) => {
              const spec = specs.find((s) => s.id === n.type) || { id: n.type, label: n.type, inputs: [], outputs: [], category: 'core' };
              return {
                id: n.id,
                type: 'specNode',
                position: { x: n.x ?? 100 + Math.random() * 200, y: n.y ?? 100 + Math.random() * 200 },
                data: { label: spec.label, specId: spec.id, spec, config: n.config || {}, inputDefaults: n.inputDefaults || {} }
              } as Node<NodeData>;
            });
            setNodes(rfNodes as any);
            setEdges((existing.edges || []).map((e: any) => ({ id: e.id, source: e.from.nodeId, target: e.to.nodeId, sourceHandle: e.from.port, targetHandle: e.to.port })) as any);
            setDraft({
              id: existing.id,
              name: existing.name || existing.id,
              description: existing.description,
              nodes: existing.nodes,
              edges: existing.edges
            });
          }
        }
      } finally {
        setLoadingExisting(false);
      }
    })();
  }, [specs, setNodes, setEdges]);

  // Sync draft.nodes/edges from ReactFlow state
  useEffect(() => {
    setDraft((d: WorkflowDraft) => ({
      ...d,
      nodes: (nodes as any[]).map((n: any) => ({
        id: n.id,
        type: (n.data as NodeData).specId,
        x: n.position.x,
        y: n.position.y,
        config: (n.data as NodeData).config || {},
        inputDefaults: (n.data as NodeData).inputDefaults || {}
      })),
      edges: edges.map((e: Edge) => ({ id: e.id, from: { nodeId: e.source, port: e.sourceHandle || 'payload' }, to: { nodeId: e.target, port: e.targetHandle || 'result' } }))
    }));
  }, [nodes, edges]);

  const addSpecNode = useCallback(
    (spec: NodeSpec): void => {
      if (spec.id === 'start' || spec.id === 'end') return; // hidden / not addable
      const id = spec.id + '-' + nanoid(4);
      const rfNode = {
        id,
        type: 'specNode',
        position: { x: 250 + Math.random() * 100, y: 120 + Math.random() * 100 },
        data: { label: spec.label, specId: spec.id, spec, config: Object.fromEntries((spec.config || []).map((c) => [c.key, c.default ?? ''])), inputDefaults: {} }
      };
      setNodes((nds) => (nds as any[]).concat(rfNode as any));
    },
    [setNodes]
  );

  const onConnect = useCallback(
    (connection: Connection): void => {
      // Require explicit handles for strict port binding
      if (!connection.sourceHandle || !connection.targetHandle) return;
      setEdges((eds: Edge[]) => addEdge({ ...connection, id: 'e-' + nanoid(6) }, eds));
    },
    [setEdges]
  );

  const nodeTypes = useMemo(() => ({ specNode: SpecNode }), []);

  const performValidate = async (): Promise<void> => {
    const backendDef = {
      id: draft.id,
      name: draft.name,
      description: draft.description,
      nodes: draft.nodes.map((n) => ({ id: n.id, type: n.type, config: n.config, inputDefaults: n.inputDefaults })),
      edges: draft.edges.map((e) => ({ id: e.id, from: e.from, to: e.to })),
      options: { concurrency: 1, errorStrategy: 'fail-fast' }
    };
    const res = await invoke('wf:validate', { def: backendDef });
    setValidateResult(res);
  };

  const performSave = async (): Promise<void> => {
    setSaving(true);
    try {
      const backendDef = {
        id: draft.id,
        name: draft.name,
        description: draft.description,
        nodes: draft.nodes.map((n) => ({ id: n.id, type: n.type, config: n.config, inputDefaults: n.inputDefaults })),
        edges: draft.edges.map((e) => ({ id: e.id, from: e.from, to: e.to })),
        options: { concurrency: 1, errorStrategy: 'fail-fast' }
      };
      const r = await invoke('wf:saveDefinition', { def: backendDef });
      console.log('Saved', r);
    } finally {
      setSaving(false);
    }
  };

  const performRun = async (): Promise<void> => {
    setRunning(true);
    try {
      const run = await invoke('wf:run', { defId: draft.id, input: { path: '/tmp/demo.txt' } });
      console.log(run);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col relative">
      {/* 顶部可拖拽导航栏 */}
      <DragAbleTitle
        title={
          <div className="flex items-center gap-2 w-full">
            <span>🗨️</span>
            <div className="text-left truncate flex-1">工作流编辑</div>
          </div>
        }
        actions={<FloatingActions onValidate={performValidate} onSave={performSave} onRun={performRun} saving={saving} running={running} validateResult={validateResult} />}
      />

      {/* 画布容器：占满除标题外的全部空间 */}
      <div className="relative flex-1 min-h-0">
        {/* ReactFlow 充满容器 */}
        <div className="absolute inset-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_e: React.MouseEvent, n: any) => setSelectedNodeId(n.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background />
            <MiniMap className="bg-background text-foreground" zoomable pannable />
            <Controls />
          </ReactFlow>
        </div>

        {/* 左侧浮动节点库，可收起/展开 */}
        <FloatingPalette width={paletteWidth} specs={specs.filter((s) => s.id !== 'start' && s.id !== 'end')} onAdd={addSpecNode} />

        {/* 右侧浮动属性面板：选中节点时显示 */}
        <FloatingInspector
          node={selectedNode ? (nodes.find((n) => n.id === selectedNode.id) as any) : null}
          onChange={(updater: (prev: NodeData) => Partial<NodeData>) =>
            setNodes((nds) => (nds as any[]).map((n: any) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, ...updater(n.data as NodeData) } as any } : n)))
          }
        />
      </div>
    </div>
  );
};

const WorkflowBuilderPage: React.FC = () => (
  <ReactFlowProvider>
    <WorkflowCanvas />
  </ReactFlowProvider>
);

export default WorkflowBuilderPage;
