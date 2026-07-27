import { describe, expect, it, vi } from 'vitest';

import type { WorkflowDefinition } from '../packages/workflow/types';
import { installMiniDom } from './utils/minidom';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

function definition(id: string): WorkflowDefinition {
  return {
    id,
    name: id,
    workspaceId: 'workspace-1',
    nodes: [{ id: 'start', type: 'core/start', x: 0, y: 0 }],
    edges: []
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('useWorkflowDefinitionLoader', () => {
  it('does not let a stale route request replace the current definition', async () => {
    const { act, useState } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { useWorkflowDefinitionLoader } = await import('../src/pages/WorkflowBuilderPage/useWorkflowDefinitionLoader');

    const env = installMiniDom();
    const oldRequest = deferred<WorkflowDefinition | null>();
    const newRequest = deferred<WorkflowDefinition | null>();
    const loadDefinition = vi.fn((id: string) => (id === 'workflow-old' ? oldRequest.promise : newRequest.promise));
    const markNeedsAutoFit = vi.fn();
    const specs = [{ id: 'core/start', label: 'Start', inputs: [], outputs: [] }];

    function Probe({ routeId }: { routeId: string }): JSX.Element {
      const [nodes, setNodes] = useState<any[]>([]);
      const [, setEdges] = useState<any[]>([]);
      const state = useWorkflowDefinitionLoader({
        routeId,
        workspaceId: 'workspace-1',
        mode: null,
        presetId: null,
        specs,
        loadDefinition,
        setNodes,
        setEdges,
        markNeedsAutoFit
      });
      return <div data-draft={state.draft?.id ?? ''} data-loading={String(state.loadingExisting)} data-nodes={nodes.map((node) => node.id).join(',')} />;
    }

    const root = createRoot(env.container as any);
    await act(async () => {
      root.render(<Probe routeId="workflow-old" />);
      await flushPromises();
    });
    const probe = env.container.firstChild as any;
    expect(loadDefinition).toHaveBeenCalledWith('workflow-old', 'workspace-1');
    expect(probe.getAttribute('data-loading')).toBe('true');

    await act(async () => {
      root.render(<Probe routeId="workflow-new" />);
      await flushPromises();
    });
    expect(loadDefinition).toHaveBeenCalledWith('workflow-new', 'workspace-1');

    await act(async () => {
      newRequest.resolve(definition('workflow-new'));
      await flushPromises();
    });
    expect(probe.getAttribute('data-draft')).toBe('workflow-new');
    expect(probe.getAttribute('data-loading')).toBe('false');
    expect(probe.getAttribute('data-nodes')).toBe('start');

    await act(async () => {
      oldRequest.resolve(definition('workflow-old'));
      await flushPromises();
    });
    expect(probe.getAttribute('data-draft')).toBe('workflow-new');
    expect(markNeedsAutoFit).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    env.cleanup();
  });
});
