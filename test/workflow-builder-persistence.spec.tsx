import { describe, expect, it, vi } from 'vitest';

import type { WorkflowDraft } from '../packages/workflow/types';
import { installMiniDom } from './utils/minidom';

function draft(id = 'workflow-1'): WorkflowDraft {
  return {
    id,
    name: 'Workflow One',
    workspaceId: 'workspace-1',
    nodes: [{ id: 'start', type: 'core/start', x: 0, y: 0 }],
    edges: []
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('useWorkflowPersistence', () => {
  it('validates and saves through injected client ports', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { useWorkflowPersistence } = await import('../src/pages/WorkflowBuilderPage/useWorkflowPersistence');

    const env = installMiniDom();
    const client = {
      validate: vi.fn(async () => ({ ok: true })),
      save: vi.fn(async () => ({ ok: true }))
    };
    const pluginResources = { listSupported: vi.fn(async () => []), install: vi.fn(async () => ({ ok: true })) };
    const notifier = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    const eventPublisher = { postMessage: vi.fn() };

    function Probe(): JSX.Element {
      const persistence = useWorkflowPersistence({ draft: draft(), isPresetWorkflow: false, eventPublisher, client, pluginResources, notifier });
      return (
        <div data-saving={String(persistence.saving)}>
          <button onClick={() => void persistence.validateDefinition()}>validate</button>
          <button onClick={() => void persistence.saveDefinition()}>save</button>
        </div>
      );
    }

    const root = createRoot(env.container as any);
    await act(async () => {
      root.render(<Probe />);
      await flushPromises();
    });
    const probe = env.container.firstChild as any;

    await act(async () => {
      probe.childNodes[0].dispatchEvent({ type: 'click' });
      await flushPromises();
    });
    expect(client.validate).toHaveBeenCalledWith(expect.objectContaining({ id: 'workflow-1', workspaceId: 'workspace-1' }));
    expect(notifier.success).toHaveBeenCalledWith('校验通过', { description: '工作流配置正确，可以保存和运行' });

    await act(async () => {
      probe.childNodes[1].dispatchEvent({ type: 'click' });
      await flushPromises();
    });
    expect(client.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'workflow-1' }), 'workspace-1');
    expect(eventPublisher.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'definition-upserted', workspaceId: 'workspace-1' }));
    expect(notifier.success).toHaveBeenCalledWith('工作流保存成功', { description: '工作流已更新' });
    expect(probe.getAttribute('data-saving')).toBe('false');

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    env.cleanup();
  });

  it('installs a missing plugin from the validation action and validates again', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { useWorkflowPersistence } = await import('../src/pages/WorkflowBuilderPage/useWorkflowPersistence');

    const env = installMiniDom();
    const client = {
      validate: vi
        .fn()
        .mockResolvedValueOnce({ ok: false, errors: ['Plugin unavailable'], missingPlugins: [{ id: 'plugin:test', hint: 'install it' }] })
        .mockResolvedValueOnce({ ok: true }),
      save: vi.fn(async () => ({ ok: true }))
    };
    const pluginResources = {
      listSupported: vi.fn(async () => [{ id: 'engine-1', pluginId: 'plugin:test', type: 'engine' as const, displayName: 'Test Engine' }]),
      install: vi.fn(async () => ({ ok: true, data: { status: 'installed' } }))
    };
    const notifier = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    const eventPublisher = { postMessage: vi.fn() };

    function Probe(): JSX.Element {
      const persistence = useWorkflowPersistence({ draft: draft(), isPresetWorkflow: false, eventPublisher, client, pluginResources, notifier });
      return <button onClick={() => void persistence.validateDefinition()}>validate</button>;
    }

    const root = createRoot(env.container as any);
    await act(async () => {
      root.render(<Probe />);
      await flushPromises();
    });
    await act(async () => {
      (env.container.firstChild as any).dispatchEvent({ type: 'click' });
      await flushPromises();
    });
    const validationFailure = notifier.error.mock.calls.find(([title]) => title === '校验失败');
    expect(validationFailure?.[1]).toMatchObject({ description: 'Plugin unavailable；缺少插件: plugin:test（install it）', action: { label: '下载插件' } });

    await act(async () => {
      validationFailure?.[1]?.action?.onClick();
      await flushPromises();
      await flushPromises();
    });
    expect(pluginResources.install).toHaveBeenCalledWith({ pluginId: 'plugin:test', resourceId: 'engine-1', deleteAfterInstall: true });
    expect(client.validate).toHaveBeenCalledTimes(2);
    expect(notifier.success).toHaveBeenCalledWith('插件安装成功', { description: 'plugin:test' });
    expect(notifier.success).toHaveBeenCalledWith('校验通过', { description: '工作流配置正确，可以保存和运行' });

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    env.cleanup();
  });
});
