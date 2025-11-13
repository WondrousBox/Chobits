import 'reactflow/dist/style.css';

import { nanoid } from 'nanoid';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  addEdge,
  Background,
  Connection,
  Controls,
  Edge,
  MiniMap,
  Node,
  NodeChange,
  OnNodesChange,
  ReactFlowProvider,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow
} from 'reactflow';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { NodeSpec, WorkflowDraft } from '@/types/workflow';

import FloatingActions from './FloatingActions';
import FloatingInspector from './FloatingInspector';
import FloatingPalette from './FloatingPalette';
import { autoLayout } from './layout';
import SpecNode from './SpecNode';
import type { NodeData } from './types';
import WorkflowJsonDialog from './WorkflowJsonDialog';

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

const WorkflowCanvasInner: React.FC = () => {
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const specs = useNodeSpecs();
  const [draft, setDraft] = useState<WorkflowDraft | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true); // 初始加载状态
  const [hasAutoFitted, setHasAutoFitted] = useState(false);
  const [nodes, setNodes, rawOnNodesChange] = useNodesState<NodeData>([]);
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
  const eventCh = useMemo(() => new BroadcastChannel('wf-events'), []);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [validateResult, setValidateResult] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [showJsonDialog, setShowJsonDialog] = useState(false);
  const selectedNode = useMemo(() => draft?.nodes.find((n) => n.id === selectedNodeId), [draft, selectedNodeId]);

  // Load existing workflow definition if payload provides id, or load preset template if presetId is provided
  // If neither is provided, default to 'blank' preset
  useEffect(() => {
    (async () => {
      try {
        const payload = await window.YUA.window['window:payload:get']('workflowBuilder' as any);
        let workflowDef: any = null;
        let presetId: string | null = null;

        if (payload && payload.id) {
          // 加载已存在的工作流
          workflowDef = await invoke('wf:getDefinition', { id: payload.id }).catch(() => null);
        } else {
          // 从预设模板创建新工作流，如果没有提供 presetId，默认使用 'blank'
          presetId = payload?.presetId || 'blank';
          workflowDef = await invoke('wf:getDefinition', { id: presetId }).catch(() => null);
        }

        if (workflowDef && workflowDef.nodes && workflowDef.edges) {
          if (payload && payload.id) {
            // 加载已存在的工作流，保持原有 ID
            const rfNodes: Node<NodeData>[] = workflowDef.nodes.map((n: any) => {
              const spec = specs.find((s) => s.id === n.type) || { id: n.type, label: n.type, inputs: [], outputs: [], category: 'core' };
              return {
                id: n.id,
                type: 'specNode',
                position: { x: n.x ?? 100 + Math.random() * 200, y: n.y ?? 100 + Math.random() * 200 },
                data: { label: spec.label, specId: spec.id, spec, config: n.config || {}, inputDefaults: n.inputDefaults || {} }
              } as Node<NodeData>;
            });
            setNodes(rfNodes as any);
            setEdges((workflowDef.edges || []).map((e: any) => ({ id: e.id, source: e.from.nodeId, target: e.to.nodeId, sourceHandle: e.from.port, targetHandle: e.to.port })) as any);
            setDraft({
              id: workflowDef.id,
              name: workflowDef.name || workflowDef.id,
              description: workflowDef.description,
              nodes: workflowDef.nodes,
              edges: workflowDef.edges
            });
          } else {
            // 从预设模板创建新工作流，为每个节点生成新的 ID
            const nodeIdMap = new Map<string, string>();
            workflowDef.nodes.forEach((n: any) => {
              if (n.id === START_NODE_ID || n.id === END_NODE_ID) {
                nodeIdMap.set(n.id, n.id); // 保留 start 和 end 的 ID
              } else {
                nodeIdMap.set(n.id, n.type + '-' + nanoid(4)); // 为其他节点生成新 ID
              }
            });

            // Map preset nodes into ReactFlow nodes
            const rfNodes: Node<NodeData>[] = workflowDef.nodes.map((n: any) => {
              const newId = nodeIdMap.get(n.id) || n.id;
              const spec = specs.find((s) => s.id === n.type) || { id: n.type, label: n.type, inputs: [], outputs: [], category: 'core' };
              return {
                id: newId,
                type: 'specNode',
                position: { x: n.x ?? 100 + Math.random() * 200, y: n.y ?? 100 + Math.random() * 200 },
                data: { label: spec.label, specId: spec.id, spec, config: n.config || {}, inputDefaults: n.inputDefaults || {} }
              } as Node<NodeData>;
            });
            setNodes(rfNodes as any);
            // 更新边的节点 ID
            const rfEdges = workflowDef.edges.map((e: any) => {
              const fromId = nodeIdMap.get(e.from.nodeId) || e.from.nodeId;
              const toId = nodeIdMap.get(e.to.nodeId) || e.to.nodeId;
              return { id: 'e-' + nanoid(6), source: fromId, target: toId, sourceHandle: e.from.port, targetHandle: e.to.port };
            });
            setEdges(rfEdges as any);
            // 创建新的工作流草稿，使用新的 ID
            setDraft({
              id: 'new-' + nanoid(6),
              name: workflowDef.name ? workflowDef.name + ' (副本)' : '新建工作流',
              description: workflowDef.description,
              nodes: rfNodes.map((n: any) => ({
                id: n.id,
                type: (n.data as NodeData).specId,
                x: n.position.x,
                y: n.position.y,
                config: (n.data as NodeData).config || {},
                inputDefaults: (n.data as NodeData).inputDefaults || {}
              })),
              edges: rfEdges.map((e: any) => ({
                id: e.id,
                from: { nodeId: e.source, port: e.sourceHandle || 'payload' },
                to: { nodeId: e.target, port: e.targetHandle || 'result' }
              }))
            });
          }
          // 标记需要自动适配视图
          setHasAutoFitted(false);
        }
      } finally {
        setLoadingExisting(false);
      }
    })();
  }, [specs, setNodes, setEdges]);

  // Sync draft.nodes/edges from ReactFlow state
  useEffect(() => {
    if (!draft) return; // 等待 draft 初始化
    setDraft((d: WorkflowDraft | null) => {
      if (!d) return null;
      return {
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
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]); // 不包含 draft，避免循环更新

  const addSpecNode = useCallback(
    (spec: NodeSpec): void => {
      if (spec.id === 'core/start' || spec.id === 'core/end') return; // hidden / not addable
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
    if (!draft) return;
    const backendDef = {
      id: draft.id,
      name: draft.name,
      description: draft.description,
      nodes: draft.nodes.map((n) => ({ id: n.id, type: n.type, x: n.x, y: n.y, config: n.config, inputDefaults: n.inputDefaults })),
      edges: draft.edges.map((e) => ({ id: e.id, from: e.from, to: e.to })),
      options: { concurrency: 1, errorStrategy: 'fail-fast' }
    };
    const res = await invoke('wf:validate', { def: backendDef });
    setValidateResult(res);
  };

  const performSave = async (): Promise<void> => {
    if (!draft) return;
    setSaving(true);
    try {
      const backendDef = {
        id: draft.id,
        name: draft.name,
        description: draft.description,
        nodes: draft.nodes.map((n) => ({ id: n.id, type: n.type, x: n.x, y: n.y, config: n.config, inputDefaults: n.inputDefaults })),
        edges: draft.edges.map((e) => ({ id: e.id, from: e.from, to: e.to })),
        options: { concurrency: 1, errorStrategy: 'fail-fast' }
      };
      const r = await invoke('wf:saveDefinition', { def: backendDef });
      console.log('Saved', r);
      // notify others for optimistic refresh
      try {
        eventCh.postMessage({ type: 'definition-upserted', def: backendDef });
      } catch {
        // ignore
      }
    } finally {
      setSaving(false);
    }
  };

  const performRun = async (): Promise<void> => {
    if (!draft) return;
    setRunning(true);
    try {
      const run = await invoke('wf:run', { defId: draft.id, input: { path: '/tmp/demo.txt' } });
      console.log(run);
      try {
        eventCh.postMessage({ type: 'run-started', defId: draft.id });
      } catch {
        // ignore
      }
    } finally {
      setRunning(false);
    }
  };

  const performLayout = useCallback((): void => {
    const layoutedNodes = autoLayout(nodes as Node<NodeData>[], edges);
    setNodes(layoutedNodes as any);
    // 延迟一下再 fitView，确保节点位置更新完成
    setTimeout(() => {
      fitView({ padding: 0.2, duration: 300 });
    }, 100);
  }, [nodes, edges, setNodes, fitView]);

  const getWorkflowJson = useCallback((): string => {
    if (!draft) return '{}';
    const backendDef = {
      id: draft.id,
      name: draft.name,
      description: draft.description,
      nodes: draft.nodes.map((n) => ({ id: n.id, type: n.type, x: n.x, y: n.y, config: n.config, inputDefaults: n.inputDefaults })),
      edges: draft.edges.map((e) => ({ id: e.id, from: e.from, to: e.to })),
      options: { concurrency: 1, errorStrategy: 'fail-fast' }
    };
    return JSON.stringify(backendDef, null, 2);
  }, [draft]);

  // 当节点初始化完成后，自动适配视图
  useEffect(() => {
    if (nodesInitialized && !hasAutoFitted && nodes.length > 0) {
      // 延迟一下确保节点已经完全渲染
      setTimeout(() => {
        fitView({ padding: 0.2, duration: 300 });
        setHasAutoFitted(true);
      }, 100);
    }
  }, [nodesInitialized, hasAutoFitted, nodes.length, fitView]);

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
        actions={
          <FloatingActions
            onValidate={performValidate}
            onSave={performSave}
            onRun={performRun}
            onLayout={performLayout}
            onShowJson={() => setShowJsonDialog(true)}
            saving={saving}
            running={running}
            validateResult={validateResult}
          />
        }
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
          >
            <Background />
            <MiniMap className="bg-background text-foreground" zoomable pannable />
            <Controls />
          </ReactFlow>
          {loadingExisting && (
            <div className="absolute inset-0 bg-background/70 backdrop-blur-sm flex items-center justify-center z-50 text-sm">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full border-2 border-neutral-500 border-t-transparent animate-spin" />
                <span>载入中...</span>
              </div>
            </div>
          )}
        </div>

        <FloatingPalette specs={specs.filter((s) => s.id !== 'core/start' && s.id !== 'core/end')} onAdd={addSpecNode} />

        {/* 右侧浮动属性面板：选中节点时显示 */}
        <FloatingInspector
          node={selectedNode ? (nodes.find((n) => n.id === selectedNode.id) as any) : null}
          onChange={(updater: (prev: NodeData) => Partial<NodeData>) =>
            setNodes((nds) => (nds as any[]).map((n: any) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, ...updater(n.data as NodeData) } as any } : n)))
          }
        />
      </div>
      <WorkflowJsonDialog open={showJsonDialog} onOpenChange={setShowJsonDialog} json={getWorkflowJson()} />
    </div>
  );
};

const WorkflowCanvas: React.FC = () => {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner />
    </ReactFlowProvider>
  );
};

const WorkflowBuilderPage: React.FC = () => <WorkflowCanvas />;

export default WorkflowBuilderPage;
