import { describe, expect, it, vi } from 'vitest';

import type { WorkflowDraft } from '../packages/workflow/types';
import { installMiniDom } from './utils/minidom';

interface Deferred {
  promise: Promise<void>;
  resolve(): void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

function createDraft(id: string, inputMode: string = 'text'): WorkflowDraft {
  return {
    id,
    name: id,
    workspaceId: 'workspace-1',
    nodes: [{ id: 'start', type: 'core/start', x: 0, y: 0, config: { inputMode } }],
    edges: []
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('useWorkflowRunControl', () => {
  it('builds a configured request, publishes success, and clears running after completion', async () => {
    const { act, useState } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { useWorkflowRunControl } = await import('../src/pages/WorkflowBuilderPage/useWorkflowRunControl');

    const env = installMiniDom();
    const pending = deferred();
    const runner = vi.fn(async (options: any) => {
      await pending.promise;
      options.onSuccess?.('run-1');
    });
    const notifySuccess = vi.fn();
    const eventPublisher = { postMessage: vi.fn() };

    function Probe(): JSX.Element {
      const [nodes] = useState<any[]>([
        {
          id: 'start',
          data: { label: 'Start', specId: 'core/start', spec: { id: 'core/start', label: 'Start', inputs: [], outputs: [] }, config: {}, inputDefaults: { text: '  hello  ' } }
        }
      ]);
      const control = useWorkflowRunControl({ draft: createDraft('workflow-1'), nodes, eventPublisher, runner, notifySuccess });
      return (
        <div data-running={String(control.running)} data-mode={control.startNodeInputMode} data-value={control.configuredInput?.value ?? ''}>
          <button onClick={() => void control.runConfiguredInput()}>run</button>
        </div>
      );
    }

    const root = createRoot(env.container as any);
    await act(async () => {
      root.render(<Probe />);
      await flushPromises();
    });
    const probe = env.container.firstChild as any;
    expect(probe.getAttribute('data-mode')).toBe('text');
    expect(probe.getAttribute('data-value')).toBe('hello');

    await act(async () => {
      probe.firstChild.dispatchEvent({ type: 'click' });
      await flushPromises();
    });
    expect(probe.getAttribute('data-running')).toBe('true');
    expect(runner).toHaveBeenCalledWith(
      expect.objectContaining({
        defId: 'workflow-1',
        input: { text: 'hello' },
        metadata: { textLength: 5, workspaceId: 'workspace-1' }
      })
    );

    await act(async () => {
      pending.resolve();
      await flushPromises();
    });
    expect(probe.getAttribute('data-running')).toBe('false');
    expect(notifySuccess).toHaveBeenCalledWith('工作流执行完成', '文本输入 (5 字符)');
    expect(eventPublisher.postMessage).toHaveBeenCalledWith({ type: 'run-started', defId: 'workflow-1', workspaceId: 'workspace-1' });

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    env.cleanup();
  });

  it('clears running when the runner returns without callbacks and isolates a changed draft scope', async () => {
    const { act, useState } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { useWorkflowRunControl } = await import('../src/pages/WorkflowBuilderPage/useWorkflowRunControl');

    const env = installMiniDom();
    const firstRun = deferred();
    const runner = vi.fn(() => firstRun.promise);
    const eventPublisher = { postMessage: vi.fn() };
    const notifySuccess = vi.fn();

    function Probe({ draftId }: { draftId: string }): JSX.Element {
      const [nodes] = useState<any[]>([
        {
          id: 'start',
          data: { label: 'Start', specId: 'core/start', spec: { id: 'core/start', label: 'Start', inputs: [], outputs: [] }, config: {}, inputDefaults: { text: '' } }
        }
      ]);
      const control = useWorkflowRunControl({ draft: createDraft(draftId), nodes, eventPublisher, runner, notifySuccess });
      return (
        <div data-running={String(control.running)}>
          <button onClick={() => void control.runConfiguredInput()}>run</button>
        </div>
      );
    }

    const root = createRoot(env.container as any);
    await act(async () => {
      root.render(<Probe draftId="workflow-old" />);
      await flushPromises();
    });
    const probe = env.container.firstChild as any;
    await act(async () => {
      probe.firstChild.dispatchEvent({ type: 'click' });
      await flushPromises();
    });
    expect(probe.getAttribute('data-running')).toBe('true');
    expect(runner).toHaveBeenCalledWith(expect.objectContaining({ input: { text: undefined } }));

    await act(async () => {
      root.render(<Probe draftId="workflow-new" />);
      await flushPromises();
    });
    expect(probe.getAttribute('data-running')).toBe('false');

    await act(async () => {
      firstRun.resolve();
      await flushPromises();
    });
    expect(probe.getAttribute('data-running')).toBe('false');
    expect(notifySuccess).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    env.cleanup();
  });
});
