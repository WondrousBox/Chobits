import 'reactflow/dist/style.css';

import type { WorkflowDefinition } from '@packages/workflow/types';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TbBolt, TbCheck, TbCode, TbIcons, TbLayout, TbPencil, TbPlayerPlay, TbSparkles } from 'react-icons/tb';
import { useParams, useSearchParams } from 'react-router-dom';
import ReactFlow, { Background, Controls, MiniMap, ReactFlowProvider } from 'reactflow';
import { toast } from 'sonner';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BroadcastChannelManager, CHANNEL_NAMES } from '@/utils/broadcastChannels';

import AIChatSidebar from '../ResourcePage/components/AIChatSidebar';
import ResourceRunPopover from '../ResourcePage/ResourceRunPopover';
import IconSelector from './IconSelector';
import NodePropertyEditor from './NodePropertyEditor';
import SpecNode from './SpecNode';
import type { NodeSpec } from './types';
import { useWorkflowDefinitionLoader } from './useWorkflowDefinitionLoader';
import { useWorkflowDraftGraphSync, useWorkflowGraphEditor } from './useWorkflowGraphEditor';
import { useWorkflowPersistence } from './useWorkflowPersistence';
import { useWorkflowRunControl } from './useWorkflowRunControl';
import { useWorkflowRunEvents } from './useWorkflowRunEvents';
import { toPersistedWorkflowDefinition } from './workflow-definition-mapper';
import WorkflowJsonDialog from './WorkflowJsonDialog';
import WorkflowRunConsole from './WorkflowRunConsole';
import WorkflowSidebar from './WorkflowSidebar';

// IPC helper
const invoke = window.ipcRenderer.invoke;

async function loadWorkflowDefinition(id: string, workspaceId?: string): Promise<WorkflowDefinition | null> {
  return invoke('wf:getDefinition', { id, workspaceId }).catch(() => null);
}

function useNodeSpecs(): NodeSpec[] {
  const [specs, setSpecs] = useState<NodeSpec[]>([]);
  useEffect(() => {
    invoke('wf:listNodes').then((list: NodeSpec[]) => setSpecs(list || []));
  }, []);
  return specs;
}

const WorkflowCanvasInner: React.FC = () => {
  const { id: routeId } = useParams();
  const [searchParams] = useSearchParams();
  const routeWorkspaceId = searchParams.get('workspaceId') || undefined;
  const specs = useNodeSpecs();
  const { nodes, setNodes, onNodesChange, edges, setEdges, onEdgesChange, onConnect, selectedNode, selectNode, selectNodes, updateSelectedNode, addSpecNode, performLayout, markNeedsAutoFit } =
    useWorkflowGraphEditor();
  const { draft, setDraft, loadingExisting, isPresetWorkflow } = useWorkflowDefinitionLoader({
    routeId,
    workspaceId: routeWorkspaceId,
    mode: searchParams.get('mode'),
    presetId: searchParams.get('presetId'),
    specs,
    loadDefinition: loadWorkflowDefinition,
    setNodes,
    setEdges,
    markNeedsAutoFit
  });

  const [eventCh] = useState(() => BroadcastChannelManager.acquire(CHANNEL_NAMES.WF_EVENTS));

  // 组件卸载时释放 channel
  useEffect(() => {
    return () => {
      BroadcastChannelManager.release(CHANNEL_NAMES.WF_EVENTS);
    };
  }, []);

  const [showJsonDialog, setShowJsonDialog] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [showIconDialog, setShowIconDialog] = useState(false);
  // AI 侧边栏状态
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const { currentRunId, runLogs, runStatus, consoleCollapsed, clearLogs, toggleConsole } = useWorkflowRunEvents({
    workflowId: draft?.id,
    workspaceId: draft?.workspaceId,
    setNodes,
    setEdges
  });
  const { running, startNodeInputMode, runConfiguredInput, runWithResource } = useWorkflowRunControl({
    draft,
    nodes,
    eventPublisher: eventCh
  });
  const { saving, validateDefinition, saveDefinition } = useWorkflowPersistence({
    draft,
    isPresetWorkflow,
    eventPublisher: eventCh
  });

  useWorkflowDraftGraphSync(setDraft, nodes, edges);

  const nodeTypes = useMemo(() => ({ specNode: SpecNode }), []);

  const getWorkflowJson = useCallback((): string => {
    if (!draft) return '{}';
    return JSON.stringify(toPersistedWorkflowDefinition(draft), null, 2);
  }, [draft]);

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
  }, [draft, editingTitleValue, setDraft]);

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

  // 处理打开图标设置对话框
  const handleOpenIconDialog = useCallback(() => {
    if (!draft) return;
    setShowIconDialog(true);
  }, [draft]);

  // 处理图标变化
  const handleIconChange = useCallback(
    (svg: string) => {
      if (!draft) return;
      const newIcon = svg.trim() || undefined;
      setDraft((d) => (d ? { ...d, icon: newIcon } : null));
    },
    [draft, setDraft]
  );

  return (
    <div className="h-screen w-screen flex flex-col relative">
      {/* 顶部标题栏 - 只显示工作流名称，添加底部分割线 */}
      <div className="border-b">
        <DragAbleTitle showBack title={<span className="text-sm font-medium">{draft?.name || '未命名工作流'}</span>} />
      </div>

      {/* AI/自动化按钮 - 绝对定位到标题栏右侧（与资源管理页面统一） */}
      <div className="absolute top-0 right-3 h-9 flex items-center gap-1 z-10 pointer-events-auto" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button className={`p-1.5 rounded transition-colors ${aiChatOpen ? 'bg-muted text-primary' : 'hover:bg-muted'}`} onClick={() => setAiChatOpen((prev) => !prev)}>
              <TbSparkles className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>AI 助手</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="p-1.5 rounded hover:bg-muted transition-colors" onClick={() => toast.info('自动化功能即将上线')}>
              <TbBolt className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>自动化</TooltipContent>
        </Tooltip>
      </div>

      {/* 主布局：左侧菜单 + 画布 + AI 侧边栏 */}
      <div className="flex flex-1 min-h-0">
        {/* 左侧菜单栏 */}
        <WorkflowSidebar specs={specs} onAdd={addSpecNode} />

        {/* 主内容区域 + AI 侧边栏 */}
        <ResizablePanelGroup direction="horizontal" className="flex-1">
          {/* 主内容区域：工具栏 + 画布 + 日志面板 */}
          <ResizablePanel defaultSize={aiChatOpen ? 70 : 100} minSize={40}>
            <div className="relative h-full flex flex-col">
              {/* 工作流工具栏 - 在 ResizablePanel 内部，随编辑区域一起收缩 */}
              <div className="flex items-center justify-between px-3 py-2 border-b bg-background shrink-0">
                {/* 左侧：编辑名称、设置图标 */}
                <div className="flex items-center gap-2">
                  {isEditingTitle ? (
                    <Input
                      ref={titleInputRef}
                      value={editingTitleValue}
                      onChange={(e) => setEditingTitleValue(e.target.value)}
                      onKeyDown={handleTitleInputKeyDown}
                      onBlur={handleSaveTitle}
                      className="h-8 w-48 text-sm"
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <Button variant="ghost" size="sm" className="h-8" onClick={handleStartEditTitle}>
                      <TbPencil className="w-4 h-4 mr-1" />
                      编辑名称
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-8" onClick={handleOpenIconDialog}>
                    <TbIcons className="w-4 h-4 mr-1" />
                    设置图标
                  </Button>
                </div>

                {/* 右侧：布局、JSON、校验、保存、运行 */}
                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="w-8 h-8" onClick={performLayout}>
                        <TbLayout className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>美化布局</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setShowJsonDialog(true)}>
                        <TbCode className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>查看 JSON</TooltipContent>
                  </Tooltip>
                  <Button variant="ghost" size="sm" className="h-8" onClick={validateDefinition}>
                    <TbCheck className="w-4 h-4 mr-1" />
                    校验
                  </Button>
                  <Button variant="outline" size="sm" className="h-8" onClick={saveDefinition} disabled={saving || isPresetWorkflow} title={isPresetWorkflow ? '预设工作流不允许修改' : ''}>
                    保存
                  </Button>
                  {startNodeInputMode === 'text' || startNodeInputMode === 'url' || startNodeInputMode === 'file' || startNodeInputMode === 'folder' ? (
                    <Button size="sm" className="h-8" disabled={!draft || running} onClick={runConfiguredInput}>
                      <TbPlayerPlay className="w-4 h-4 mr-1" />
                      试运行
                    </Button>
                  ) : (
                    <ResourceRunPopover disabled={!draft} running={running} onSelect={runWithResource} />
                  )}
                </div>
              </div>

              {/* 画布 + 属性面板区域 */}
              <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
                {/* 画布容器 */}
                <ResizablePanel defaultSize={selectedNode ? 75 : 100} minSize={50}>
                  <div className="relative h-full">
                    <ReactFlow
                      nodes={nodes}
                      edges={edges}
                      onNodesChange={onNodesChange}
                      onEdgesChange={onEdgesChange}
                      onConnect={onConnect}
                      onNodeClick={(_e: React.MouseEvent, node) => selectNode(node.id)}
                      onPaneClick={() => selectNode(null)}
                      onSelectionChange={({ nodes: selectedNodes }) => selectNodes(selectedNodes)}
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
                </ResizablePanel>

                {/* 右侧属性面板：选中节点时显示 */}
                {selectedNode && (
                  <>
                    <ResizableHandle withHandle />
                    <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
                      <div className="h-full border-l bg-background overflow-y-auto">
                        <NodePropertyEditor node={selectedNode} onChange={updateSelectedNode} />
                      </div>
                    </ResizablePanel>
                  </>
                )}
              </ResizablePanelGroup>

              {/* 日志面板 */}
              <div className={consoleCollapsed ? 'h-0 overflow-hidden' : 'h-[200px] min-h-[200px] flex-shrink-0'}>
                <WorkflowRunConsole logs={runLogs} currentRunId={currentRunId} collapsed={consoleCollapsed} onToggle={toggleConsole} onClear={clearLogs} status={runStatus} />
              </div>
            </div>
          </ResizablePanel>

          {/* AI 侧边栏（可拖拽调整宽度） */}
          {aiChatOpen && (
            <>
              <ResizableHandle className="hover:bg-primary" withHandle />
              <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
                <AIChatSidebar onClose={() => setAiChatOpen(false)} />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
      <WorkflowJsonDialog open={showJsonDialog} onOpenChange={setShowJsonDialog} json={getWorkflowJson()} />
      <Dialog open={showIconDialog} onOpenChange={setShowIconDialog}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>设置工作流图标</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <IconSelector value={draft?.icon || ''} onChange={handleIconChange} />
          </div>
        </DialogContent>
      </Dialog>
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
