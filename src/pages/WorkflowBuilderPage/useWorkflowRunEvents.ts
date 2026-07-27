import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Edge, Node } from 'reactflow';

import type { ExecutionStatus, NodeData, WorkflowRunLogEntry } from './types';
import { classifyWorkflowRunEvent } from './workflow-run-events';

interface UseWorkflowRunEventsOptions {
  workflowId?: string;
  workspaceId?: string;
  setNodes: Dispatch<SetStateAction<Node<NodeData>[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
}

interface WorkflowRunEventState {
  currentRunId: string | null;
  runLogs: WorkflowRunLogEntry[];
  runStatus: ExecutionStatus | null;
  consoleCollapsed: boolean;
  clearLogs(): void;
  toggleConsole(): void;
}

function mergeRunLogs(history: WorkflowRunLogEntry[], current: WorkflowRunLogEntry[]): WorkflowRunLogEntry[] {
  const seen = new Set<string>();
  return [...history, ...current]
    .filter((entry) => {
      const key = `${entry.timestamp}\0${entry.level}\0${entry.nodeId || ''}\0${entry.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(-500);
}

export function useWorkflowRunEvents({ workflowId, workspaceId, setNodes, setEdges }: UseWorkflowRunEventsOptions): WorkflowRunEventState {
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const currentRunIdRef = useRef<string | null>(null);
  const [runLogs, setRunLogs] = useState<WorkflowRunLogEntry[]>([]);
  const [runStatus, setRunStatus] = useState<ExecutionStatus | null>(null);
  const [consoleCollapsed, setConsoleCollapsed] = useState(true);
  const workflowScope = useMemo(() => Symbol(`${workspaceId || 'default'}:${workflowId || 'none'}`), [workflowId, workspaceId]);
  const [stateScope, setStateScope] = useState(workflowScope);
  const activeScopeRef = useRef<symbol | null>(workflowScope);

  useEffect(() => {
    activeScopeRef.current = workflowScope;
    currentRunIdRef.current = null;

    const handleRunStatus = (_event: any, record: any): void => {
      const action = classifyWorkflowRunEvent(record, workflowId, workspaceId, currentRunIdRef.current);
      if (action === 'ignore') return;

      setRunStatus(record.status);
      if (action === 'start') {
        setStateScope(workflowScope);
        currentRunIdRef.current = record.runId;
        setCurrentRunId(record.runId);
        setRunLogs([]);
        setConsoleCollapsed(false);
        setNodes((nodes) =>
          nodes.map((node) => ({
            ...node,
            data: { ...node.data, runtime: { nodeId: node.id, status: 'pending' } }
          }))
        );
        setEdges((edges) => edges.map((edge) => ({ ...edge, animated: false, style: {} })));
        window.ipcRenderer
          .invoke('wf:getRunLogs', { runId: record.runId, workspaceId })
          .then((logs: WorkflowRunLogEntry[]) => {
            if (Array.isArray(logs) && activeScopeRef.current === workflowScope && currentRunIdRef.current === record.runId) {
              setRunLogs((current) => mergeRunLogs(logs, current));
            }
          })
          .catch(() => {});
      } else if (action === 'finish') {
        currentRunIdRef.current = null;
        setNodes((nodes) =>
          nodes.map((node) => {
            const nodeState = record.nodes?.[node.id];
            return nodeState ? { ...node, data: { ...node.data, runtime: nodeState } } : node;
          })
        );
        setEdges((edges) => edges.map((edge) => ({ ...edge, animated: false, style: {} })));
      }
    };

    const handleNodeStatus = (_event: any, payload: any): void => {
      if (payload.workflowId !== workflowId || payload.runId !== currentRunIdRef.current) return;
      const nodeState = payload.node;
      setNodes((nodes) => nodes.map((node) => (node.id === nodeState.nodeId ? { ...node, data: { ...node.data, runtime: nodeState } } : node)));

      if (nodeState.status === 'running') {
        setEdges((edges) =>
          edges.map((edge) => (edge.source === nodeState.nodeId ? { ...edge, animated: true, style: { stroke: '#22d3ee', strokeWidth: 3 } } : { ...edge, animated: false, style: {} }))
        );
      } else if (nodeState.status === 'completed' || nodeState.status === 'failed') {
        setEdges((edges) => edges.map((edge) => (edge.source === nodeState.nodeId ? { ...edge, animated: false, style: {} } : edge)));
      }
    };

    const handleRunLog = (_event: any, payload: any): void => {
      if (payload.runId !== currentRunIdRef.current) return;
      setRunLogs((logs) => {
        const next = [...logs, payload.entry];
        return next.length > 500 ? next.slice(-500) : next;
      });
    };

    window.ipcRenderer.on('wf:run-status', handleRunStatus);
    window.ipcRenderer.on('wf:node-status', handleNodeStatus);
    window.ipcRenderer.on('wf:run-log', handleRunLog);

    return () => {
      if (activeScopeRef.current === workflowScope) activeScopeRef.current = null;
      window.ipcRenderer.off('wf:run-status', handleRunStatus);
      window.ipcRenderer.off('wf:node-status', handleNodeStatus);
      window.ipcRenderer.off('wf:run-log', handleRunLog);
    };
  }, [workflowId, workspaceId, workflowScope, setNodes, setEdges]);

  const clearLogs = useCallback((): void => {
    if (stateScope !== workflowScope) {
      currentRunIdRef.current = null;
      setCurrentRunId(null);
      setRunStatus(null);
      setConsoleCollapsed(true);
    }
    setStateScope(workflowScope);
    setRunLogs([]);
  }, [stateScope, workflowScope]);
  const toggleConsole = useCallback((): void => {
    if (stateScope !== workflowScope) {
      currentRunIdRef.current = null;
      setCurrentRunId(null);
      setRunLogs([]);
      setRunStatus(null);
    }
    setStateScope(workflowScope);
    setConsoleCollapsed((collapsed) => (stateScope === workflowScope ? !collapsed : false));
  }, [stateScope, workflowScope]);

  const ownsState = stateScope === workflowScope;
  return {
    currentRunId: ownsState ? currentRunId : null,
    runLogs: ownsState ? runLogs : [],
    runStatus: ownsState ? runStatus : null,
    consoleCollapsed: ownsState ? consoleCollapsed : true,
    clearLogs,
    toggleConsole
  };
}
