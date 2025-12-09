import 'reactflow/dist/style.css';

import { nanoid } from 'nanoid';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TbPencil, TbPlayerPlay } from 'react-icons/tb';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExecutionStatus, NodeSpec, WorkflowDraft, WorkflowRunLogEntry } from '@/types/workflow';

import ResourceRunPopover from '../ResourcePage/ResourceRunPopover';
import { ResourceItem } from '../ResourcePage/types';
import FloatingActions from './FloatingActions';
import FloatingInspector from './FloatingInspector';
import { autoLayout } from './layout';
import SpecNode from './SpecNode';
import TextInputDialog from './TextInputDialog';
import type { NodeData } from './types';
import UrlInputDialog from './UrlInputDialog';
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
  const [showTextInputDialog, setShowTextInputDialog] = useState(false);
  const [showUrlInputDialog, setShowUrlInputDialog] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
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
            // 加载已存在的工作流，保持原有 ID；不还原运行时输入（inputDefaults），默认空
            const rfNodes: Node<NodeData>[] = workflowDef.nodes.map((n: any) => {
              const spec = specs.find((s) => s.id === n.type) || { id: n.type, label: n.type, inputs: [], outputs: [], category: 'core' };
              return {
                id: n.id,
                type: 'specNode',
                position: { x: n.x ?? 100 + Math.random() * 200, y: n.y ?? 100 + Math.random() * 200 },
                data: { label: spec.label, specId: spec.id, spec, config: n.config || {}, inputDefaults: {} }
              } as Node<NodeData>;
            });
            setNodes(rfNodes as any);
            setEdges((workflowDef.edges || []).map((e: any) => ({ id: e.id, source: e.from.nodeId, target: e.to.nodeId, sourceHandle: e.from.port, targetHandle: e.to.port })) as any);
            // draft 中同样不恢复历史 inputDefaults，避免把上次运行时输入当成配置保存
            setDraft({
              id: workflowDef.id,
              name: workflowDef.name || workflowDef.id,
              description: workflowDef.description,
              nodes: (workflowDef.nodes || []).map((n: any) => ({
                ...n,
                inputDefaults: undefined
              })),
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

            // Map preset nodes into ReactFlow nodes；预设也不带运行时输入
            const rfNodes: Node<NodeData>[] = workflowDef.nodes.map((n: any) => {
              const newId = nodeIdMap.get(n.id) || n.id;
              const spec = specs.find((s) => s.id === n.type) || { id: n.type, label: n.type, inputs: [], outputs: [], category: 'core' };
              return {
                id: newId,
                type: 'specNode',
                position: { x: n.x ?? 100 + Math.random() * 200, y: n.y ?? 100 + Math.random() * 200 },
                data: { label: spec.label, specId: spec.id, spec, config: n.config || {}, inputDefaults: {} }
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
                // 运行时输入不写入草稿配置
                inputDefaults: {}
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
          // draft 中记录 inputDefaults 仅用于当前会话运行，不用于持久化
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
      // 校验时不需要运行时输入，避免给人“已配置默认值”的错觉
      nodes: draft.nodes.map((n) => ({ id: n.id, type: n.type, x: n.x, y: n.y, config: n.config })),
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
        // 持久化时不写入 inputDefaults，让运行时输入每次都是空的
        nodes: draft.nodes.map((n) => ({ id: n.id, type: n.type, x: n.x, y: n.y, config: n.config })),
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

  // 获取开始节点的输入模式和输入值
  const startNodeInputMode = useMemo(() => {
    if (!draft) return 'resource';
    const startNode = draft.nodes.find((n) => n.id === START_NODE_ID);
    if (!startNode) return 'resource';
    return (startNode.config?.inputMode as string) || 'resource';
  }, [draft]);

  // 获取开始节点的输入值（从 ReactFlow nodes 状态获取，更实时）
  const startNodeInputValue = useMemo(() => {
    const startNode = (nodes as any[]).find((n) => n.id === START_NODE_ID);
    if (!startNode) return null;
    const inputDefaults = (startNode.data as NodeData)?.inputDefaults || {};
    const mode = startNodeInputMode;

    if (mode === 'text' && inputDefaults.text && String(inputDefaults.text).trim()) {
      return { type: 'text', value: String(inputDefaults.text).trim() };
    }
    if (mode === 'file' && inputDefaults.file && String(inputDefaults.file).trim()) {
      return { type: 'file', value: String(inputDefaults.file).trim() };
    }
    if (mode === 'url' && inputDefaults.url && String(inputDefaults.url).trim()) {
      return { type: 'url', value: String(inputDefaults.url).trim() };
    }
    if (mode === 'folder' && inputDefaults.folderId && String(inputDefaults.folderId).trim()) {
      return { type: 'folder', value: String(inputDefaults.folderId).trim() };
    }
    return null;
  }, [nodes, startNodeInputMode]);

  const runWorkflowWithResource = useCallback(
    async (resource: ResourceItem): Promise<void> => {
      if (!draft) return;
      setRunning(true);
      try {
        const result = await invoke('wf:run', {
          defId: draft.id,
          input: { resource, resourceId: resource.id },
          metadata: {
            resourceId: resource.id,
            resourceName: resource.title || 'Unknown',
            thumbnailPath: resource.thumbnailPath,
            workspaceId: resource.workspaceId
          }
        });
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

  const runWorkflowWithText = useCallback(
    async (text: string): Promise<void> => {
      if (!draft) return;
      setRunning(true);
      try {
        const result = await invoke('wf:run', {
          defId: draft.id,
          input: { text },
          metadata: {
            textLength: text.length
          }
        });
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
        toast.success('工作流已开始执行', { description: `文本输入 (${text.length} 字符)` });
        try {
          eventCh.postMessage({ type: 'run-started', defId: draft.id });
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

  const runWorkflowWithFile = useCallback(
    async (filePath: string): Promise<void> => {
      if (!draft) return;
      setRunning(true);
      try {
        const result = await invoke('wf:run', {
          defId: draft.id,
          input: { file: filePath },
          metadata: {
            filePath
          }
        });
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
        const fileName = filePath.split(/[/\\]/).pop() || filePath;
        toast.success('工作流已开始执行', { description: `文件: ${fileName}` });
        try {
          eventCh.postMessage({ type: 'run-started', defId: draft.id });
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

  const runWorkflowWithUrl = useCallback(
    async (url: string): Promise<void> => {
      if (!draft) return;
      setRunning(true);
      try {
        const result = await invoke('wf:run', {
          defId: draft.id,
          input: { url },
          metadata: {
            url
          }
        });
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
        toast.success('工作流已开始执行', { description: `链接: ${url}` });
        try {
          eventCh.postMessage({ type: 'run-started', defId: draft.id });
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

  const runWorkflowWithFolder = useCallback(
    async (folderId: string): Promise<void> => {
      if (!draft) return;
      setRunning(true);
      try {
        const result = await invoke('wf:run', {
          defId: draft.id,
          input: { folderId },
          metadata: {
            folderId
          }
        });
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
        toast.success('工作流已开始执行', { description: `文件夹 ID: ${folderId}` });
        try {
          eventCh.postMessage({ type: 'run-started', defId: draft.id });
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

  const handleRunClick = useCallback(async () => {
    // 如果节点上已经有输入值，直接使用，不弹窗
    if (startNodeInputValue) {
      if (startNodeInputValue.type === 'text') {
        await runWorkflowWithText(startNodeInputValue.value);
        return;
      }
      if (startNodeInputValue.type === 'file') {
        await runWorkflowWithFile(startNodeInputValue.value);
        return;
      }
      if (startNodeInputValue.type === 'url') {
        await runWorkflowWithUrl(startNodeInputValue.value);
        return;
      }
      if (startNodeInputValue.type === 'folder') {
        await runWorkflowWithFolder(startNodeInputValue.value);
        return;
      }
    }

    // 如果没有输入值，才弹窗让用户输入
    if (startNodeInputMode === 'text') {
      setShowTextInputDialog(true);
    } else if (startNodeInputMode === 'url') {
      setShowUrlInputDialog(true);
    } else if (startNodeInputMode === 'file') {
      try {
        const result = await window.YUA.file['file:pickFile']();
        if (!result.canceled && result.path) {
          await runWorkflowWithFile(result.path);
        }
      } catch (err: any) {
        toast.error('文件选择失败', { description: err?.message || String(err) });
      }
    } else if (startNodeInputMode === 'folder') {
      // 文件夹模式会通过 wf:start-input-required 事件触发输入窗口
      // 这里直接执行，让引擎处理输入需求
      try {
        const result = await invoke('wf:run', {
          defId: draft.id,
          input: {},
          metadata: {}
        });
        if (!result?.ok) {
          const description = result?.error || (result?.validation ? (typeof result.validation === 'string' ? result.validation : JSON.stringify(result.validation)) : '未知错误');
          toast.error('工作流执行失败', { description });
        }
      } catch (err: any) {
        // 如果是因为缺少输入而失败，引擎会触发输入窗口，这里不显示错误
        if (!err?.message?.includes('已弹出输入窗口')) {
          toast.error('工作流执行失败', { description: err?.message || String(err) });
        }
      }
    }
    // 如果是 resource 模式，ResourceRunPopover 会自动处理
  }, [draft, startNodeInputMode, startNodeInputValue, runWorkflowWithText, runWorkflowWithFile, runWorkflowWithUrl, runWorkflowWithFolder]);

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
      // JSON 视图与实际保存一致，不包含运行时输入
      nodes: draft.nodes.map((n) => ({ id: n.id, type: n.type, x: n.x, y: n.y, config: n.config })),
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

    const handleMissingProvider = (_e: any, payload: any): void => {
      const pid: string = payload?.providerId || 'zhipu';
      const fields: string[] = Array.isArray(payload?.fields) && payload.fields.length ? payload.fields : ['apiKey'];
      // 使用统一的窗口管理器打开配置窗口，并通过 payload 传递需要配置的字段
      window.YUA.window['window:open']('aiProviderConfig' as any, { providerId: pid, fields }, { sameDisplayAsSender: true }).catch(() => {
        // ignore
      });
    };

    window.ipcRenderer.on('wf:run-status', handleRunStatus);
    window.ipcRenderer.on('wf:node-status', handleNodeStatus);
    window.ipcRenderer.on('wf:run-log', handleRunLog);
    window.ipcRenderer.on('wf:ai-missing-provider', handleMissingProvider);

    return () => {
      window.ipcRenderer.off('wf:run-status', handleRunStatus);
      window.ipcRenderer.off('wf:node-status', handleNodeStatus);
      window.ipcRenderer.off('wf:run-log', handleRunLog);
      window.ipcRenderer.off('wf:ai-missing-provider', handleMissingProvider);
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

  // 当进入编辑模式时，聚焦输入框
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // 处理开始编辑标题
  const handleStartEditTitle = useCallback(() => {
    if (!draft) return;
    setEditingTitleValue(draft.name || '');
    setIsEditingTitle(true);
  }, [draft]);

  // 处理保存标题
  const handleSaveTitle = useCallback(() => {
    if (!draft) return;
    const newName = editingTitleValue.trim() || '未命名工作流';
    setDraft((d) => (d ? { ...d, name: newName } : null));
    setIsEditingTitle(false);
  }, [draft, editingTitleValue]);

  // 处理取消编辑标题
  const handleCancelEditTitle = useCallback(() => {
    setIsEditingTitle(false);
    setEditingTitleValue('');
  }, []);

  // 处理标题输入框的键盘事件
  const handleTitleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSaveTitle();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancelEditTitle();
      }
    },
    [handleSaveTitle, handleCancelEditTitle]
  );

  return (
    <div className="h-screen w-screen flex flex-col relative">
      {/* 顶部可拖拽导航栏 */}
      <DragAbleTitle
        title={
          <div className="flex items-center gap-2 w-full">
            {isEditingTitle ? (
              <Input
                ref={titleInputRef}
                value={editingTitleValue}
                onChange={(e) => setEditingTitleValue(e.target.value)}
                onKeyDown={handleTitleInputKeyDown}
                onBlur={handleSaveTitle}
                className="flex-1 h-7 text-sm no-drag"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                <div
                  className="flex items-center gap-2 no-drag cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartEditTitle();
                  }}
                >
                  {draft?.name || '未命名工作流'} <TbPencil />
                </div>
              </>
            )}
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
            renderRunButton={() => {
              if (startNodeInputMode === 'text' || startNodeInputMode === 'url' || startNodeInputMode === 'file' || startNodeInputMode === 'folder') {
                return (
                  <>
                    <Button size="sm" disabled={!draft || running} onClick={handleRunClick}>
                      <TbPlayerPlay />
                      运行示例
                    </Button>
                    <TextInputDialog open={showTextInputDialog} onOpenChange={setShowTextInputDialog} disabled={!draft} running={running} onConfirm={runWorkflowWithText} />
                    <UrlInputDialog open={showUrlInputDialog} onOpenChange={setShowUrlInputDialog} disabled={!draft} running={running} onConfirm={runWorkflowWithUrl} />
                  </>
                );
              }
              return <ResourceRunPopover disabled={!draft} running={running} onSelect={runWorkflowWithResource} />;
            }}
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
