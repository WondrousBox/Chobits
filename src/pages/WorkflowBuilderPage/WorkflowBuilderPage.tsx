import 'reactflow/dist/style.css';

import { nanoid } from 'nanoid';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, { addEdge, Background, Connection, Controls, Edge, MiniMap, ReactFlowProvider, useEdgesState, useNodesState } from 'reactflow';

import { NodeSpec, WorkflowDraft } from '@/types/workflow';

import SpecNode from './SpecNode';

// IPC helper
const invoke = window.ipcRenderer.invoke;

function useNodeSpecs(): NodeSpec[] {
  const [specs, setSpecs] = useState<NodeSpec[]>([]);
  useEffect(() => {
    invoke('wf:listNodes').then((list: NodeSpec[]) => setSpecs(list || []));
  }, []);
  return specs;
}

type NodeData = { label: string; specId: string; spec: NodeSpec; config: Record<string, any>; inputDefaults: Record<string, any> };

function buildInitialDraft(): WorkflowDraft {
  return { id: 'new-' + nanoid(6), name: '新建工作流', nodes: [], edges: [] };
}

const paletteWidth = 180;

const WorkflowCanvas: React.FC = () => {
  const specs = useNodeSpecs();
  const [draft, setDraft] = useState<WorkflowDraft>(buildInitialDraft());
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [validateResult, setValidateResult] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const selectedNode = useMemo(() => draft.nodes.find((n) => n.id === selectedNodeId), [draft, selectedNodeId]);

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
    <div className="flex h-full">
      <div style={{ width: paletteWidth }} className="border-r border-neutral-700 p-2 space-y-2 overflow-auto">
        <div className="text-xs uppercase font-bold opacity-70">节点库</div>
        {specs.map((s: NodeSpec) => (
          <button key={s.id} className="block w-full text-left text-sm px-2 py-1 rounded hover:bg-neutral-700" onClick={() => addSpecNode(s)}>
            {s.label}
          </button>
        ))}
        <hr className="my-2" />
        <div className="space-y-2">
          <button onClick={performValidate} className="w-full bg-indigo-600 text-white text-sm py-1 rounded">
            校验
          </button>
          <button onClick={performSave} disabled={saving} className="w-full bg-green-600 disabled:opacity-50 text-white text-sm py-1 rounded">
            保存
          </button>
          <button onClick={performRun} disabled={running} className="w-full bg-purple-600 disabled:opacity-50 text-white text-sm py-1 rounded">
            运行示例
          </button>
        </div>
        {validateResult && (
          <div className="mt-2 text-xs">
            {validateResult.ok ? (
              <div className="text-green-400">校验通过</div>
            ) : (
              <div className="text-red-400">
                {(validateResult.errors || []).map((e: string) => (
                  <div key={e}>{e}</div>
                ))}
                {(validateResult.missingPlugins || []).map((m: any) => (
                  <div key={m.id}>缺少插件: {m.id}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex-1 h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_e: React.MouseEvent, n: any) => setSelectedNodeId(n.id)}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background />
          <MiniMap />
          <Controls />
        </ReactFlow>
      </div>
      <div style={{ width: 240 }} className="border-l border-neutral-700 p-2 space-y-2 overflow-auto">
        <div className="text-xs uppercase font-bold opacity-70">属性</div>
        {!selectedNode && <div className="text-xs opacity-60">选择一个节点查看配置</div>}
        {selectedNode && (
          <NodePropertyEditor
            node={nodes.find((n) => n.id === selectedNode.id) as any}
            onChange={(updater) => setNodes((nds) => (nds as any[]).map((n: any) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, ...updater(n.data as NodeData) } as any } : n)))}
          />
        )}
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

// -------- Property Editor ---------
const NodePropertyEditor: React.FC<{
  node: any;
  onChange: (updater: (prev: NodeData) => Partial<NodeData>) => void;
}> = ({ node, onChange }) => {
  if (!node) return null;
  const data = node.data as NodeData;
  const spec = data.spec;
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold">{spec.label}</div>
      <div className="text-xs opacity-70">ID: {node.id}</div>
      {spec.config && spec.config.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase opacity-70">配置</div>
          {spec.config.map((c) => (
            <div key={c.key} className="space-y-1">
              <label className="block text-xs">{c.key}</label>
              <input
                className="w-full rounded bg-neutral-800 text-xs px-2 py-1 border border-neutral-700"
                value={String((data.config || {})[c.key] ?? '')}
                onChange={(e) => onChange((prev) => ({ config: { ...prev.config, [c.key]: e.target.value } }))}
                placeholder={c.description || ''}
              />
            </div>
          ))}
        </div>
      )}
      {spec.inputs && spec.inputs.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase opacity-70">输入默认值</div>
          {spec.inputs.map((inp) => (
            <div key={inp.key} className="space-y-1">
              <label className="block text-xs">{inp.key}</label>
              <input
                className="w-full rounded bg-neutral-800 text-xs px-2 py-1 border border-neutral-700"
                value={String((data.inputDefaults || {})[inp.key] ?? '')}
                onChange={(e) => onChange((prev) => ({ inputDefaults: { ...prev.inputDefaults, [inp.key]: e.target.value } }))}
                placeholder={inp.description || ''}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
