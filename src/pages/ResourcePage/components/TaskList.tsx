import React, { useEffect, useState } from 'react';
import { TbChevronDown, TbChevronRight, TbFolderOpen, TbPlayerStop, TbTrash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

import { makeResSrc } from '../utils/resourceProtocol';

interface TaskRecord {
  runId: string;
  workflowId: string;
  createdAt: number;
  status: string;
  nodes: Record<string, any>;
  input?: Record<string, any>;
  output?: Record<string, any>;
  error?: string;
  progress?: number;
  progressMessage?: string;
  metadata?: {
    resourceId?: string;
    resourceName?: string;
    thumbnailPath?: string;
    [key: string]: any;
  };
}

interface TaskListProps {
  workspaceId?: string;
}

const TaskList: React.FC<TaskListProps> = ({ workspaceId }) => {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [workflowNames, setWorkflowNames] = useState<Record<string, string>>({});
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  // Load workflow definitions once
  useEffect(() => {
    window.ipcRenderer.invoke('wf:listDefinitions').then((defs: any[]) => {
      const map: Record<string, string> = {};
      defs.forEach((d) => (map[d.id] = d.name));
      setWorkflowNames(map);
    });
  }, []);

  const loadTasks = async (): Promise<void> => {
    try {
      const res = await window.ipcRenderer.invoke('wf:listRuns', { limit: 100, workspaceId: workspaceId });
      if (Array.isArray(res)) {
        setTasks((prev) => {
          const prevMap = new Map(prev.map((t) => [t.runId, t]));
          return res.reverse().map((newTask) => {
            const oldTask = prevMap.get(newTask.runId);
            // Preserve details if available locally but missing in new task (which is expected now)
            if (oldTask && oldTask.nodes && Object.keys(oldTask.nodes).length > 0) {
              return {
                ...newTask,
                nodes: oldTask.nodes,
                input: oldTask.input,
                output: oldTask.output
              };
            }
            return newTask;
          });
        });
      }
    } catch (e) {
      console.error('Failed to load tasks', e);
    }
  };

  useEffect(() => {
    const poll = async () => {
      await loadTasks();
      // Poll details for expanded tasks
      const expandedIds = Array.from(expandedTasks);
      if (expandedIds.length > 0) {
        expandedIds.forEach(async (id) => {
          try {
            const details = await window.ipcRenderer.invoke('wf:getRun', { runId: id });
            if (details) {
              setTasks((prev) => prev.map((t) => (t.runId === id ? { ...t, ...details } : t)));
            }
          } catch (e) {
            // ignore
          }
        });
      }
    };
    poll();
    const timer = setInterval(poll, 2000); // Poll every 2s
    return () => clearInterval(timer);
  }, [workspaceId, expandedTasks]);

  const handleOpenFolder = (path: string): void => {
    window.YUA.file['file:reveal'](path);
  };

  const handleDelete = async (runId: string) => {
    try {
      await window.ipcRenderer.invoke('wf:deleteRun', { runId, workspaceId: workspaceId });
      loadTasks();
    } catch (e) {
      console.error('Failed to delete run', e);
    }
  };

  const handleStop = async (runId: string) => {
    try {
      await window.ipcRenderer.invoke('wf:cancelRun', { runId });
      loadTasks();
    } catch (e) {
      console.error('Failed to stop run', e);
    }
  };

  const toggleExpand = async (runId: string) => {
    const newSet = new Set(expandedTasks);
    if (newSet.has(runId)) {
      newSet.delete(runId);
    } else {
      newSet.add(runId);
      // Fetch details immediately if needed
      const task = tasks.find((t) => t.runId === runId);
      if (task && (!task.nodes || Object.keys(task.nodes).length === 0)) {
        try {
          const details = await window.ipcRenderer.invoke('wf:getRun', { runId });
          if (details) {
            setTasks((prev) => prev.map((t) => (t.runId === runId ? { ...t, ...details } : t)));
          }
        } catch (e) {
          console.error('Failed to fetch run details', e);
        }
      }
    }
    setExpandedTasks(newSet);
  };

  return (
    <div className="w-full h-full" style={{ height: 'calc(100% - 36px)' }}>
      <ScrollArea className="flex-1">
        <div className="px-2 space-y-2">
          {tasks.map((task, index) => (
            <div key={task.runId + index} className="p-3 border rounded-lg bg-card hover:bg-accent/50 transition-colors">
              <div className="flex gap-3">
                {/* Thumbnail */}
                <div className="flex-shrink-0 w-12 h-12 rounded overflow-hidden bg-muted">
                  {task.metadata?.thumbnailPath ? (
                    <img src={makeResSrc(task.metadata.thumbnailPath)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">无图</div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0 flex-1 mr-2">
                      <div className="font-medium truncate text-sm" title={task.metadata?.resourceName}>
                        {task.metadata?.resourceName || '未知资源'}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{workflowNames[task.workflowId] || task.workflowId}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-muted-foreground hover:text-foreground"
                        title={expandedTasks.has(task.runId) ? '收起详情' : '查看详情'}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(task.runId);
                        }}
                      >
                        {expandedTasks.has(task.runId) ? <TbChevronDown className="h-3.5 w-3.5" /> : <TbChevronRight className="h-3.5 w-3.5" />}
                      </Button>
                      {task.status === 'running' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-muted-foreground hover:text-foreground"
                          title="停止任务"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStop(task.runId);
                          }}
                        >
                          <TbPlayerStop className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {(task.status === 'completed' || task.status === 'failed') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-muted-foreground hover:text-destructive"
                          title="删除任务"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(task.runId);
                          }}
                        >
                          <TbTrash className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {task.status === 'completed' && task.output?.output && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-muted-foreground hover:text-foreground"
                          title="打开所在文件夹"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenFolder(task.output!.output);
                          }}
                        >
                          <TbFolderOpen className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <div
                        className={`flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-medium ${task.status === 'completed'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                            : task.status === 'failed'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
                              : task.status === 'running'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100'
                          }`}
                      >
                        {task.status === 'completed'
                          ? '完成'
                          : task.status === 'failed'
                            ? '失败'
                            : task.status === 'running'
                              ? '进行中'
                              : task.status === 'queued'
                                ? '排队'
                                : task.status === 'canceled'
                                  ? '取消'
                                  : task.status}
                      </div>
                    </div>
                  </div>

                  <div className="text-[10px] text-muted-foreground mt-0.5">{new Date(task.createdAt).toLocaleString()}</div>

                  {task.status === 'running' && (
                    <div className="mt-2 space-y-1">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span className="truncate max-w-[120px]">{task.progressMessage || '处理中...'}</span>
                        <span>{task.progress || 0}%</span>
                      </div>
                      <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-primary transition-all duration-300 ease-in-out" style={{ width: `${task.progress || 0}%` }} />
                      </div>
                    </div>
                  )}

                  {expandedTasks.has(task.runId) && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      {Object.values(task.nodes || {})
                        .sort((a: any, b: any) => (a.startedAt || 0) - (b.startedAt || 0))
                        .map((node: any) => (
                          <div key={node.nodeId} className="text-xs flex flex-col gap-1 p-2 bg-muted/50 rounded">
                            <div className="flex justify-between items-center">
                              <span className="font-medium truncate max-w-[180px]" title={node.nodeId}>
                                {node.nodeId}
                              </span>
                              <span
                                className={
                                  node.status === 'completed' ? 'text-green-600' : node.status === 'failed' ? 'text-red-600' : node.status === 'running' ? 'text-blue-600' : 'text-muted-foreground'
                                }
                              >
                                {node.status}
                              </span>
                            </div>
                            {node.error && <div className="text-red-500 break-all bg-red-50 p-1 rounded">{node.error}</div>}
                            {node.input && Object.keys(node.input).length > 0 && (
                              <div className="mt-1">
                                <div className="text-[10px] font-semibold text-muted-foreground mb-0.5">Input:</div>
                                <pre className="text-[10px] bg-background p-1 rounded overflow-x-auto max-h-40 whitespace-pre-wrap break-all">{JSON.stringify(node.input, null, 2)}</pre>
                              </div>
                            )}
                            {node.output && Object.keys(node.output).length > 0 && (
                              <div className="mt-1">
                                <div className="text-[10px] font-semibold text-muted-foreground mb-0.5">Output:</div>
                                <pre className="text-[10px] bg-background p-1 rounded overflow-x-auto max-h-40 whitespace-pre-wrap break-all">{JSON.stringify(node.output, null, 2)}</pre>
                              </div>
                            )}
                            <div className="text-[10px] text-muted-foreground flex justify-between">
                              <span>{node.startedAt ? new Date(node.startedAt).toLocaleTimeString() : '-'}</span>
                              <span>{node.finishedAt && node.startedAt ? `${node.finishedAt - node.startedAt}ms` : ''}</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {tasks.length === 0 && <div className="text-center text-muted-foreground py-8">暂无任务</div>}
        </div>
      </ScrollArea>
    </div>
  );
};

export default TaskList;
