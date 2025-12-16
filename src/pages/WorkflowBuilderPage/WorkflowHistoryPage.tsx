import React, { useEffect, useState } from 'react';
import { TbArrowLeft } from 'react-icons/tb';
import { useNavigate } from 'react-router-dom';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import type { ExecutionStatus, WorkflowRunRecord } from './types';

const invoke = window.ipcRenderer.invoke;

const WorkflowHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<WorkflowRunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    invoke('wf:listRuns')
      .then((data: any[]) => {
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
  }, [refreshTick]);

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
    <div className="h-full w-full flex flex-col bg-background text-foreground">
      <DragAbleTitle
        title={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="no-drag">
              <TbArrowLeft />
            </Button>
            <span className="font-semibold">执行记录</span>
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setRefreshTick((t) => t + 1)} disabled={loading}>
              刷新
            </Button>
          </div>
        }
      />
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
  );
};

export default WorkflowHistoryPage;
