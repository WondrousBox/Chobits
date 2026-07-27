import type { Dispatch, SetStateAction } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { WorkflowRunLogEntry } from '../src/pages/WorkflowBuilderPage/types';
import { installMiniDom } from './utils/minidom';

type IpcListener = (event: unknown, payload: any) => void;

interface IpcHarness {
  ipcRenderer: Record<string, ReturnType<typeof vi.fn>>;
  emit(channel: string, payload: any): void;
  listenerCount(channel: string): number;
  invoke: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
}

function createIpcHarness(getRunLogs: (runId: string) => Promise<WorkflowRunLogEntry[]>): IpcHarness {
  const listeners = new Map<string, Set<IpcListener>>();
  const on = vi.fn((channel: string, listener: IpcListener) => {
    const channelListeners = listeners.get(channel) ?? new Set<IpcListener>();
    channelListeners.add(listener);
    listeners.set(channel, channelListeners);
  });
  const off = vi.fn((channel: string, listener: IpcListener) => {
    listeners.get(channel)?.delete(listener);
  });
  const invoke = vi.fn((channel: string, payload: { runId: string }) => {
    if (channel !== 'wf:getRunLogs') throw new Error(`Unexpected IPC channel: ${channel}`);
    return getRunLogs(payload.runId);
  });

  return {
    ipcRenderer: { invoke, on, off },
    emit(channel: string, payload: any): void {
      for (const listener of listeners.get(channel) ?? []) listener({}, payload);
    },
    listenerCount(channel: string): number {
      return listeners.get(channel)?.size ?? 0;
    },
    invoke,
    off
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('useWorkflowRunEvents', () => {
  it('tracks one run, merges delayed history with live logs, and updates graph state', async () => {
    const { act, useState } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { useWorkflowRunEvents } = await import('../src/pages/WorkflowBuilderPage/useWorkflowRunEvents');

    const env = installMiniDom();
    let resolveHistory!: (logs: WorkflowRunLogEntry[]) => void;
    const historyPromise = new Promise<WorkflowRunLogEntry[]>((resolve) => {
      resolveHistory = resolve;
    });
    const ipc = createIpcHarness(async () => historyPromise);
    (env.window as any).ipcRenderer = ipc.ipcRenderer;

    function Probe(): JSX.Element {
      const [nodes, setNodes] = useState<any[]>([
        { id: 'start', data: { label: 'Start', runtime: { nodeId: 'start', status: 'completed' } } },
        { id: 'next', data: { label: 'Next' } }
      ]);
      const [edges, setEdges] = useState<any[]>([{ id: 'edge-1', source: 'start', target: 'next', animated: true, style: { stroke: 'red' } }]);
      const current = useWorkflowRunEvents({
        workflowId: 'workflow-1',
        workspaceId: 'workspace-1',
        setNodes: setNodes as Dispatch<SetStateAction<any[]>>,
        setEdges: setEdges as Dispatch<SetStateAction<any[]>>
      });
      return (
        <div
          data-run={current.currentRunId ?? ''}
          data-status={current.runStatus ?? ''}
          data-logs={current.runLogs.map((entry) => entry.message).join(',')}
          data-collapsed={String(current.consoleCollapsed)}
          data-nodes={JSON.stringify(nodes)}
          data-edges={JSON.stringify(edges)}
        />
      );
    }

    const root = createRoot(env.container as any);
    await act(async () => {
      root.render(<Probe />);
      await flushPromises();
    });
    const probe = env.container.firstChild as any;

    await act(async () => {
      ipc.emit('wf:run-status', { runId: 'run-1', workflowId: 'workflow-1', workspaceId: 'workspace-1', status: 'queued' });
      await flushPromises();
    });
    expect(probe.getAttribute('data-run')).toBe('run-1');
    expect(probe.getAttribute('data-status')).toBe('queued');
    expect(probe.getAttribute('data-collapsed')).toBe('false');
    expect(JSON.parse(probe.getAttribute('data-nodes')).every((node: any) => node.data.runtime.status === 'pending')).toBe(true);
    expect(JSON.parse(probe.getAttribute('data-edges'))[0]).toMatchObject({ animated: false, style: {} });
    expect(ipc.invoke).toHaveBeenCalledWith('wf:getRunLogs', { runId: 'run-1', workspaceId: 'workspace-1' });

    const liveLog = { runId: 'run-1', level: 'info' as const, message: 'live', timestamp: 2 };
    await act(async () => {
      ipc.emit('wf:run-log', { runId: 'run-1', entry: liveLog });
      ipc.emit('wf:node-status', { runId: 'run-1', workflowId: 'workflow-1', node: { nodeId: 'start', status: 'running' } });
      await flushPromises();
    });
    expect(probe.getAttribute('data-logs')).toBe('live');
    expect(JSON.parse(probe.getAttribute('data-edges'))[0]).toMatchObject({ animated: true, style: { stroke: '#22d3ee', strokeWidth: 3 } });

    const historyLog = { runId: 'run-1', level: 'info' as const, message: 'history', timestamp: 1 };
    await act(async () => {
      resolveHistory([historyLog]);
      await flushPromises();
    });
    expect(probe.getAttribute('data-logs')).toBe('history,live');

    await act(async () => {
      ipc.emit('wf:run-status', {
        runId: 'run-1',
        workflowId: 'workflow-1',
        workspaceId: 'workspace-1',
        status: 'completed',
        nodes: { start: { nodeId: 'start', status: 'completed' } }
      });
      await flushPromises();
    });
    expect(probe.getAttribute('data-run')).toBe('run-1');
    expect(probe.getAttribute('data-status')).toBe('completed');
    expect(JSON.parse(probe.getAttribute('data-edges'))[0]).toMatchObject({ animated: false, style: {} });

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    expect(ipc.off).toHaveBeenCalledTimes(3);
    expect(ipc.listenerCount('wf:run-status')).toBe(0);
    env.cleanup();
  });

  it('hides stale state across scopes and ignores terminal events from an older run', async () => {
    const { act, useState } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { useWorkflowRunEvents } = await import('../src/pages/WorkflowBuilderPage/useWorkflowRunEvents');

    const env = installMiniDom();
    const ipc = createIpcHarness(async () => []);
    (env.window as any).ipcRenderer = ipc.ipcRenderer;
    function Probe({ workspaceId }: { workspaceId: string }): JSX.Element {
      const [, setNodes] = useState<any[]>([]);
      const [, setEdges] = useState<any[]>([]);
      const current = useWorkflowRunEvents({ workflowId: 'workflow-1', workspaceId, setNodes, setEdges });
      return (
        <div data-run={current.currentRunId ?? ''} data-status={current.runStatus ?? ''} data-logs={current.runLogs.length} data-collapsed={String(current.consoleCollapsed)}>
          <button onClick={current.toggleConsole}>toggle</button>
        </div>
      );
    }

    const root = createRoot(env.container as any);
    await act(async () => {
      root.render(<Probe workspaceId="workspace-1" />);
      await flushPromises();
    });
    const probe = env.container.firstChild as any;
    await act(async () => {
      ipc.emit('wf:run-status', { runId: 'run-old', workflowId: 'workflow-1', workspaceId: 'workspace-1', status: 'running' });
      await flushPromises();
    });
    expect(probe.getAttribute('data-run')).toBe('run-old');

    await act(async () => {
      ipc.emit('wf:run-status', { runId: 'run-old', workflowId: 'workflow-1', workspaceId: 'workspace-1', status: 'completed' });
      ipc.emit('wf:run-status', { runId: 'run-new', workflowId: 'workflow-1', workspaceId: 'workspace-1', status: 'running' });
      ipc.emit('wf:run-status', { runId: 'run-old', workflowId: 'workflow-1', workspaceId: 'workspace-1', status: 'failed' });
      await flushPromises();
    });
    expect(probe.getAttribute('data-run')).toBe('run-new');
    expect(probe.getAttribute('data-status')).toBe('running');

    await act(async () => {
      root.render(<Probe workspaceId="workspace-2" />);
      await flushPromises();
    });
    expect(probe.getAttribute('data-run')).toBe('');
    expect(probe.getAttribute('data-status')).toBe('');
    expect(probe.getAttribute('data-logs')).toBe('0');
    expect(probe.getAttribute('data-collapsed')).toBe('true');

    await act(async () => {
      probe.firstChild.dispatchEvent({ type: 'click' });
      await flushPromises();
    });
    expect(probe.getAttribute('data-run')).toBe('');
    expect(probe.getAttribute('data-status')).toBe('');
    expect(probe.getAttribute('data-logs')).toBe('0');
    expect(probe.getAttribute('data-collapsed')).toBe('false');
    expect(ipc.listenerCount('wf:run-status')).toBe(1);

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    expect(ipc.listenerCount('wf:run-status')).toBe(0);
    env.cleanup();
  });
});
