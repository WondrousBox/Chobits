import 'reactflow/dist/style.css';

import { nanoid } from 'nanoid';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { toast } from 'sonner';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { ResourceItem } from '@/types';
import { ExecutionStatus, NodeSpec, WorkflowDraft, WorkflowRunLogEntry } from '@/types/workflow';

import FloatingActions from './FloatingActions';
import FloatingInspector from './FloatingInspector';
import { autoLayout } from './layout';
import ResourceRunPopover from './ResourceRunPopover';
import SpecNode from './SpecNode';
import type { NodeData } from './types';
import WorkflowJsonDialog from './WorkflowJsonDialog';
import WorkflowRunConsole from './WorkflowRunConsole';
import WorkflowSidebar from './WorkflowSidebar';

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
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [showJsonDialog, setShowJsonDialog] = useState(false);
  const [isPresetWorkflow, setIsPresetWorkflow] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const currentRunIdRef = useRef<string | null>(null);
  const [runLogs, setRunLogs] = useState<WorkflowRunLogEntry[]>([]);
  const [runStatus, setRunStatus] = useState<ExecutionStatus | null>(null);
  const [consoleCollapsed, setConsoleCollapsed] = useState(true);
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
            // 加载已存在的工作流，检查是否为预设工作流
            const isPreset = await invoke('wf:isPreset', { id: payload.id }).catch(() => false);
            setIsPresetWorkflow(isPreset);
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
            // 从预设模板创建新工作流，不是预设工作流，允许保存
            setIsPresetWorkflow(false);
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

  const installPluginResource = useCallback(async (pluginId: string): Promise<boolean> => {
    try {
      const pluginResourceApi = window.YUA?.pluginResource;
      if (!pluginResourceApi) {
        toast.error('插件安装失败', { description: '无法访问插件资源接口' });
        return false;
      }
      const listFn = pluginResourceApi['plugin-resource:listSupported'];
      if (typeof listFn !== 'function') {
        toast.error('插件安装失败', { description: '缺少插件资源列表接口' });
        return false;
      }
      const supportedPlugins = await listFn();
      if (!Array.isArray(supportedPlugins)) {
        toast.error('插件安装失败', { description: '无法获取插件资源列表' });
        return false;
      }
      const pluginResource = supportedPlugins.find((p: any) => p.pluginId === pluginId && p.type === 'engine');
      if (!pluginResource) {
        toast.error('插件安装失败', { description: `未找到插件资源: ${pluginId}` });
        return false;
      }
      const installFn = pluginResourceApi['plugin-resource:install'];
      if (typeof installFn !== 'function') {
        toast.error('插件安装失败', { description: '缺少插件安装接口' });
        return false;
      }
      const result = await installFn({
        pluginId: pluginResource.pluginId,
        resourceId: pluginResource.id,
        deleteAfterInstall: true
      });
      if (result?.ok) {
        toast.success('插件安装成功', { description: pluginId });
        return true;
      }
      toast.error('插件安装失败', { description: result?.error || '未知错误' });
      return false;
    } catch (err: any) {
      toast.error('插件安装失败', { description: err?.message || String(err) });
      return false;
    }
  }, []);

  const onConnect = useCallback(
    (connection: Connection): void => {
      // Require explicit handles for strict port binding
      if (!connection.sourceHandle || !connection.targetHandle) return;
      setEdges((eds: Edge[]) => addEdge({ ...connection, id: 'e-' + nanoid(6) }, eds));
    },
    [setEdges]
  );

  const nodeTypes = useMemo(() => ({ specNode: SpecNode }), []);

  const performValidate = useCallback(async (): Promise<void> => {
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

    // 使用 toast 显示检测结果
    if (res.ok) {
      toast.success('校验通过', {
        description: '工作流配置正确，可以保存和运行'
      });
    } else {
      const errors: string[] = [];
      if (res.errors && res.errors.length > 0) {
        errors.push(...res.errors);
      }
      const missingPlugins: Array<{ id: string; hint?: string }> = Array.isArray(res.missingPlugins) ? res.missingPlugins : [];
      if (missingPlugins.length > 0) {
        errors.push(...missingPlugins.map((m) => `缺少插件: ${m.id}${m.hint ? `（${m.hint}）` : ''}`));
      }

      const description = errors.length > 0 ? errors.join('；') : '工作流配置存在问题';
      const firstMissing = missingPlugins[0]?.id;
      toast.error('校验失败', {
        description,
        action: firstMissing
          ? {
            label: '下载插件',
            onClick: () => {
              void (async () => {
                const ok = await installPluginResource(firstMissing);
                if (ok) {
                  await performValidate();
                }
              })();
            }
          }
          : undefined
      });
    }
  }, [draft, installPluginResource]);

  const performSave = async (): Promise<void> => {
    if (!draft) return;
    // 检查是否为预设工作流
    if (isPresetWorkflow) {
      alert('预设工作流不允许修改，请先保存为新工作流');
      return;
    }
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
      if (!r.ok && r.error) {
        toast.error(r.error);
        return;
      }
      console.log('Saved', r);
      // 通知其他窗口刷新列表
      try {
        eventCh.postMessage({ type: 'definition-upserted', def: backendDef });
      } catch {
        // ignore
      }
      // 保存成功提示
      toast.success('工作流保存成功', {
        description: draft.id.startsWith('new-') ? '新工作流已创建，可在工作流列表中查看' : '工作流已更新'
      });
    } finally {
      setSaving(false);
    }
  };

  const runWorkflowWithResource = useCallback(
    async (resource: ResourceItem): Promise<void> => {
      if (!draft) return;
      setRunning(true);
      try {
        const result = await invoke('wf:run', { defId: draft.id, input: { resource, resourceId: resource.id } });
        if (!result?.ok) {
          const description = result?.error || (result?.validation ? (typeof result.validation === 'string' ? result.validation : JSON.stringify(result.validation)) : '未知错误');
          toast.error('工作流执行失败', { description });
          return;
        }
        currentRunIdRef.current = result.runId;
        setCurrentRunId(result.runId);
        setRunLogs([]);
        setRunStatus('queued');
        setConsoleCollapsed(false); // 运行时自动展开日志面板
        toast.success('工作流已开始执行', { description: resource.title || resource.filePath || resource.id });
        try {
          eventCh.postMessage({ type: 'run-started', defId: draft.id, resourceId: resource.id });
        } catch {
          // ignore
        }
      } catch (err: any) {
        toast.error('工作流执行失败', { description: err?.message || String(err) });
      } finally {
        setRunning(false);
      }
    },
    [draft, eventCh]
  );

  const handleClearLogs = useCallback(() => {
    setRunLogs([]);
  }, []);

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

  // 监听工作流运行状态和日志
  useEffect(() => {
    const handleRunStatus = (_e: any, rec: any): void => {
      if (rec.workflowId === draft?.id) {
        setRunStatus(rec.status);
        if (rec.status === 'running') {
          currentRunIdRef.current = rec.runId;
          setCurrentRunId(rec.runId);
          setRunLogs([]);
          setConsoleCollapsed(false); // 运行时自动展开日志面板
          // 重置所有节点状态
          setNodes((nds) =>
            (nds as any[]).map((n: any) => ({
              ...n,
              data: { ...n.data, runtime: { nodeId: n.id, status: 'pending' } }
            }))
          );
          // 重置所有边的样式
          setEdges((eds) =>
            eds.map((e) => ({
              ...e,
              animated: false,
              style: {}
            }))
          );
          // 加载历史日志
          invoke('wf:getRunLogs', { runId: rec.runId })
            .then((logs: WorkflowRunLogEntry[]) => {
              if (Array.isArray(logs)) {
                setRunLogs(logs);
              }
            })
            .catch(() => { });
        } else if (rec.status === 'completed' || rec.status === 'failed' || rec.status === 'canceled') {
          currentRunIdRef.current = null;
          // 更新所有节点状态
          setNodes((nds) =>
            (nds as any[]).map((n: any) => {
              const nodeState = rec.nodes?.[n.id];
              if (nodeState) {
                return { ...n, data: { ...n.data, runtime: nodeState } };
              }
              return n;
            })
          );
          // 重置所有边的样式
          setEdges((eds) =>
            eds.map((e) => ({
              ...e,
              animated: false,
              style: {}
            }))
          );
        }
      }
    };

    const handleNodeStatus = (_e: any, payload: any): void => {
      if (payload.workflowId === draft?.id && payload.runId === currentRunIdRef.current) {
        const nodeState = payload.node;
        // 更新节点状态
        setNodes((nds) =>
          (nds as any[]).map((n: any) => {
            if (n.id === nodeState.nodeId) {
              return { ...n, data: { ...n.data, runtime: nodeState } };
            }
            return n;
          })
        );
        // 更新边的流动效果
        if (nodeState.status === 'running') {
          // 高亮当前节点到下游的所有边，并清除其他边的高亮
          setEdges((eds) =>
            eds.map((e) =>
              e.source === nodeState.nodeId
                ? {
                  ...e,
                  animated: true,
                  style: { stroke: '#22d3ee', strokeWidth: 3 }
                }
                : {
                  ...e,
                  animated: false,
                  style: {}
                }
            )
          );
        } else if (nodeState.status === 'completed' || nodeState.status === 'failed') {
          // 节点完成后，移除该节点出发的边的高亮
          setEdges((eds) =>
            eds.map((e) =>
              e.source === nodeState.nodeId
                ? {
                  ...e,
                  animated: false,
                  style: {}
                }
                : e
            )
          );
        }
      }
    };

    const handleRunLog = (_e: any, payload: any): void => {
      // 检查是否匹配当前工作流的运行ID
      if (payload.runId === currentRunIdRef.current) {
        setRunLogs((prev) => {
          const next = [...prev, payload.entry];
          // 限制日志数量
          if (next.length > 1000) {
            return next.slice(-1000);
          }
          return next;
        });
      }
    };

    window.ipcRenderer.on('wf:run-status', handleRunStatus);
    window.ipcRenderer.on('wf:node-status', handleNodeStatus);
    window.ipcRenderer.on('wf:run-log', handleRunLog);

    return () => {
      window.ipcRenderer.off('wf:run-status', handleRunStatus);
      window.ipcRenderer.off('wf:node-status', handleNodeStatus);
      window.ipcRenderer.off('wf:run-log', handleRunLog);
    };
  }, [draft?.id, setNodes, setEdges]);

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
            <div className="text-left truncate flex-1">{draft?.name || '未命名工作流'}</div>
          </div>
        }
        actions={
          <FloatingActions
            onValidate={performValidate}
            onSave={performSave}
            onLayout={performLayout}
            onShowJson={() => setShowJsonDialog(true)}
            saving={saving}
            running={running}
            isPreset={isPresetWorkflow}
            renderRunButton={() => <ResourceRunPopover disabled={!draft} running={running} onSelect={runWorkflowWithResource} />}
          />
        }
      />

      {/* 左侧菜单栏 */}
      <WorkflowSidebar specs={specs} onAdd={addSpecNode} />

      {/* 主内容区域：画布和日志面板 */}
      <div className="relative flex-1 min-h-0 flex flex-col ml-12">
        {/* 画布容器 */}
        <div className={`relative flex-1 min-h-0 transition-all ${consoleCollapsed ? '' : 'pb-0'}`}>
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

          {/* 右侧浮动属性面板：选中节点时显示 */}
          <FloatingInspector
            node={selectedNode ? (nodes.find((n) => n.id === selectedNode.id) as any) : null}
            onChange={(updater: (prev: NodeData) => Partial<NodeData>) =>
              setNodes((nds) => (nds as any[]).map((n: any) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, ...updater(n.data as NodeData) } as any } : n)))
            }
          />
        </div>

        {/* 日志面板 */}
        <div className={consoleCollapsed ? 'h-0 overflow-hidden' : 'h-[200px] min-h-[200px] flex-shrink-0'}>
          <WorkflowRunConsole
            logs={runLogs}
            currentRunId={currentRunId}
            collapsed={consoleCollapsed}
            onToggle={() => setConsoleCollapsed((prev) => !prev)}
            onClear={handleClearLogs}
            status={runStatus}
          />
        </div>
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
