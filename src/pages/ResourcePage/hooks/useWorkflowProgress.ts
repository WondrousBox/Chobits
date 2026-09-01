import type { WorkflowRunStatusEvent } from '@workflow/integrations/client';
import { useEffect, useState } from 'react';

import { workflowClient } from '@/lib/workflow-client';
import { matchesWorkflowWorkspace } from '@/utils/broadcastChannels';

interface WorkflowProgress {
  visible: boolean;
  progress: number;
  message: string;
  workflowName?: string;
  runId?: string;
}

export function useWorkflowProgress(workspaceId?: string): WorkflowProgress {
  const [progress, setProgress] = useState<WorkflowProgress>({
    visible: false,
    progress: 0,
    message: '',
    workflowName: undefined,
    runId: undefined
  });

  useEffect(() => {
    const workflowNameCache = new Map<string, string>();

    const handleRunStatus = async (rec: WorkflowRunStatusEvent): Promise<void> => {
      if (!rec || !rec.runId) return;
      const runWorkspaceId = rec.workspaceId ?? rec.metadata?.workspaceId;
      if (!matchesWorkflowWorkspace(workspaceId, runWorkspaceId)) return;

      // 只显示运行中的工作流进度
      if (rec.status === 'running') {
        const progressValue = rec.progress ?? 0;
        const message = rec.progressMessage || '执行中';

        // 异步获取工作流名称（使用缓存）
        let workflowName = workflowNameCache.get(rec.workflowId);
        if (!workflowName) {
          workflowName = '工作流';
          try {
            const def = await workflowClient.getDefinition({ id: rec.workflowId, workspaceId: rec.workspaceId ?? rec.metadata?.workspaceId });
            if (def?.name) {
              workflowName = def.name;
              workflowNameCache.set(rec.workflowId, workflowName || '');
            }
          } catch {
            // 如果获取失败，使用默认名称
          }
        }

        setProgress((prev) => {
          // 如果是同一个工作流，更新进度；如果是新工作流，替换
          if (prev.runId === rec.runId || !prev.visible) {
            return {
              visible: true,
              progress: progressValue,
              message,
              workflowName,
              runId: rec.runId
            };
          }
          return prev;
        });
      } else if (rec.status === 'completed' || rec.status === 'failed' || rec.status === 'canceled') {
        // 工作流完成后，延迟隐藏进度条（给用户看到完成状态）
        setTimeout(() => {
          setProgress((prev) => {
            // 只隐藏当前完成的工作流
            if (prev.runId === rec.runId) {
              return {
                visible: false,
                progress: 0,
                message: '',
                workflowName: undefined,
                runId: undefined
              };
            }
            return prev;
          });
        }, 1000);
      }
    };

    // 监听工作流状态事件
    const unsubscribe = workflowClient.onRunStatus((record) => void handleRunStatus(record));

    return unsubscribe;
  }, [workspaceId]);

  return progress;
}
