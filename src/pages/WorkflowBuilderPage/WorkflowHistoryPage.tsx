import React, { useEffect, useState } from 'react';
import { TbBolt, TbSparkles } from 'react-icons/tb';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { workflowClient } from '@/lib/workflow-client';

import AIChatSidebar from '../ResourcePage/components/AIChatSidebar';
import type { ExecutionStatus, WorkflowRunRecord } from './types';

const WorkflowHistoryPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const workspaceId = searchParams.get('workspaceId') || undefined;
  const [runs, setRuns] = useState<WorkflowRunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  // AI 侧边栏状态
  const [aiChatOpen, setAiChatOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    workflowClient
      .listRuns({ workspaceId })
      .then((data) => {
        if (mounted && Array.isArray(data)) {
          // Sort by createdAt desc
          const sorted = data.sort((a, b) => b.createdAt - a.createdAt);
          setRuns(sorted);
        }
      })
      .catch((err) => {
        console.error('Failed to list runs:', err);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [refreshTick, workspaceId]);

  const formatTime = (ts: number): string => {
    return new Date(ts).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getStatusColor = (status: ExecutionStatus): string => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20';
      case 'failed':
        return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
      case 'running':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
      case 'queued':
        return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20';
      case 'canceled':
        return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20';
      default:
        return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20';
    }
  };

  const getStatusLabel = (status: ExecutionStatus): string => {
    switch (status) {
      case 'completed':
        return '已完成';
      case 'failed':
        return '失败';
      case 'running':
        return '运行中';
      case 'queued':
        return '排队中';
      case 'canceled':
        return '已取消';
      default:
        return status;
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-background text-foreground relative">
      {/* 顶部标题栏 + 分割线 */}
      <div className="border-b">
        <DragAbleTitle
          showBack
          title={
            <div className="flex items-center gap-2">
              <span className="font-semibold">执行记录</span>
            </div>
          }
        />
      </div>

      {/* AI/自动化按钮 - 绝对定位到标题栏右侧 */}
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

      {/* 主内容区域 + AI 侧边栏 */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={aiChatOpen ? 70 : 100} minSize={40}>
          <div className="h-full flex flex-col">
            {/* 工具栏 */}
            <div className="flex items-center justify-end px-3 py-2 border-b bg-background shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setLoading(true);
                  setRefreshTick((t) => t + 1);
                }}
                disabled={loading}
              >
                刷新
              </Button>
            </div>

            {/* 表格内容 */}
            <div className="flex-1 overflow-auto bg-background p-4">
              {loading && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-sm text-muted-foreground">加载中...</div>
                </div>
              )}
              {!loading && runs.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-sm text-muted-foreground">暂无执行记录</div>
                </div>
              )}
              {!loading && runs.length > 0 && (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[180px]">执行时间</TableHead>
                        <TableHead className="w-[200px]">工作流 ID</TableHead>
                        <TableHead className="w-[100px] text-center">状态</TableHead>
                        <TableHead className="w-[100px] text-center">节点数</TableHead>
                        <TableHead>错误信息</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runs.map((run) => (
                        <TableRow key={run.runId}>
                          <TableCell className="font-mono text-xs">{formatTime(run.createdAt)}</TableCell>
                          <TableCell className="font-mono text-xs">{run.workflowId}</TableCell>
                          <TableCell className="text-center">
                            <span className={`text-xs px-2 py-0.5 rounded border ${getStatusColor(run.status)}`}>{getStatusLabel(run.status)}</span>
                          </TableCell>
                          <TableCell className="text-center text-xs">{Object.keys(run.nodes || {}).length}</TableCell>
                          <TableCell className="text-xs text-destructive truncate max-w-[300px]" title={run.error}>
                            {run.error || '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>

        {/* AI 侧边栏 */}
        {aiChatOpen && (
          <>
            <ResizableHandle className="hover:bg-primary" withHandle />
            <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
              <AIChatSidebar onClose={() => setAiChatOpen(false)} workspaceId={workspaceId} />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
};

export default WorkflowHistoryPage;
