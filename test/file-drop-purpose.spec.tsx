import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SpriteManager } from '../packages/sprite-core/manager/sprite-manager';
import { resetPersonaRulesRuntime } from '../packages/sprite-core/persona-rules';
import { resetSpriteCapabilityRuntime } from '../packages/sprite-core/capability-runtime';
import { installMiniDom } from './utils/minidom';

const resourceServiceMocks = vi.hoisted(() => ({
  addResourcesFromDataTransfer: vi.fn(),
  addResourcesFromSelectedFiles: vi.fn()
}));

vi.mock('../src/pages/ResourcePage/services/resourceService', () => resourceServiceMocks);

async function waitFor(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function removeDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 10 });
}

function createTestWindow(): {
  win: {
    webContents: {
      send(channel: string, payload: unknown): void;
    };
    getBounds(): { x: number; y: number; width: number; height: number };
    setPosition: ReturnType<typeof vi.fn>;
    setSize: ReturnType<typeof vi.fn>;
    isDestroyed(): boolean;
  };
  sent: Array<{ channel: string; payload: unknown }>;
} {
  const sent: Array<{ channel: string; payload: unknown }> = [];
  const win = {
    webContents: {
      send: (channel: string, payload: unknown) => {
        sent.push({ channel, payload });
      }
    },
    getBounds: () => ({ x: 0, y: 0, width: 200, height: 200 }),
    setPosition: vi.fn(),
    setSize: vi.fn(),
    isDestroyed: () => false
  };

  return { win, sent };
}

function createManager(options: { purposeWindowAdapter?: any } = {}): {
  mgr: SpriteManager;
  sent: Array<{ channel: string; payload: unknown }>;
  dataDir: string;
} {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'file-drop-purpose-'));
  const { win, sent } = createTestWindow();
  const mgr = SpriteManager.init({
    win: win as any,
    dataDir,
    getScreenSize: () => ({ width: 1280, height: 720 }),
    appName: 'SpriteTest',
    purposeWindowAdapter: options.purposeWindowAdapter
  });

  return { mgr, sent, dataDir };
}

async function destroyManager(dataDir?: string): Promise<void> {
  if (SpriteManager.hasInstance()) {
    try {
      await SpriteManager.getInstance().destroy();
    } catch {
      (SpriteManager as any).instance = null;
    }
  }

  if (dataDir) {
    removeDir(dataDir);
  }
}

describe('file drop purpose integration', () => {
  const dataDirs = new Set<string>();

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    resourceServiceMocks.addResourcesFromDataTransfer.mockReset();
    resourceServiceMocks.addResourcesFromSelectedFiles.mockReset();
    resetPersonaRulesRuntime();
    resetSpriteCapabilityRuntime();
    await destroyManager();
    for (const dataDir of dataDirs) {
      removeDir(dataDir);
    }
    dataDirs.clear();
  });

  it('starts a file.drop.invite purpose on file drag enter and reuses the correlation for drop intake', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { useFileDropCollector } = await import('../src/features/sprite-assistant/hooks/useFileDropCollector');

    const env = installMiniDom();
    const fileDrop = vi.fn(async () => undefined);
    const startPurpose = vi.fn(async () => ({ accepted: true, status: 'started' }));
    const interact = vi.fn();
    const openWindow = vi.fn();
    const dataTransfer = {
      types: ['Files'],
      files: [{ name: 'draft.txt', path: 'F:/tmp/draft.txt' }]
    };
    resourceServiceMocks.addResourcesFromDataTransfer.mockResolvedValue([
      { id: 'resource-draft', title: 'draft.txt', filePath: 'F:/tmp/draft.txt', workspaceId: 'workspace-1' }
    ]);

    (env.window as any).YUA = {
      sprite: {
        fileDrop,
        startPurpose,
        interact
      },
      window: {
        'window:open': openWindow
      }
    };

    let hook: ReturnType<typeof useFileDropCollector> | undefined;
    function Probe(): JSX.Element {
      hook = useFileDropCollector();
      return <div />;
    }

    const root = createRoot(env.container as any);
    await act(async () => {
      root.render(<Probe />);
      await flushPromises();
    });

    await act(async () => {
      hook?.handleDragEnter({
        dataTransfer,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      } as any);
      await flushPromises();
    });

    expect(interact).toHaveBeenCalledWith('file-drag-over');
    expect(startPurpose).toHaveBeenCalledTimes(1);
    const inviteRequest = startPurpose.mock.calls[0][0];
    expect(inviteRequest).toMatchObject({
      kind: 'file.drop.invite',
      source: 'user-event',
      presetId: 'file.drop.invite',
      priority: 85,
      coalesceKey: 'file-drop-invite',
      context: {
        source: 'drag-enter'
      }
    });
    expect(inviteRequest.correlationId).toEqual(expect.stringMatching(/^file-drop-/));

    await act(async () => {
      await hook?.handleDrop({
        dataTransfer,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      } as any);
      await flushPromises();
    });

    expect(fileDrop).toHaveBeenCalledWith([{ name: 'draft.txt', path: 'F:/tmp/draft.txt' }]);
    expect(startPurpose).toHaveBeenCalledTimes(2);
    const intakeRequest = startPurpose.mock.calls[1][0];
    expect(intakeRequest).toMatchObject({
      kind: 'file.drop.intake',
      presetId: 'file.drop.intake',
      priority: 100,
      correlationId: inviteRequest.correlationId,
      context: {
        files: [{ name: 'draft.txt', path: 'F:/tmp/draft.txt' }],
        resources: [{ id: 'resource-draft', title: 'draft.txt', filePath: 'F:/tmp/draft.txt', workspaceId: 'workspace-1' }]
      }
    });
    expect(openWindow).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    env.cleanup();
  });

  it('cancels a queued file.drop.invite so it cannot run after drag ends', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { useFileDropCollector } = await import('../src/features/sprite-assistant/hooks/useFileDropCollector');

    const env = installMiniDom();
    const fileDrop = vi.fn(async () => undefined);
    const cancelPurpose = vi.fn(async () => true);
    const startPurpose = vi
      .fn()
      .mockResolvedValueOnce({ accepted: true, purpose: { id: 'invite-queued', status: 'queued' }, status: 'queued' })
      .mockResolvedValueOnce({ accepted: true, purpose: { id: 'intake-active', status: 'active' }, status: 'started' });
    const openWindow = vi.fn();
    const dataTransfer = {
      types: ['Files'],
      files: [{ name: 'draft.txt', path: 'F:/tmp/draft.txt' }]
    };
    resourceServiceMocks.addResourcesFromDataTransfer.mockResolvedValue([]);

    (env.window as any).YUA = {
      sprite: {
        cancelPurpose,
        fileDrop,
        startPurpose,
        interact: vi.fn()
      },
      window: {
        'window:open': openWindow
      }
    };

    let hook: ReturnType<typeof useFileDropCollector> | undefined;
    function Probe(): JSX.Element {
      hook = useFileDropCollector();
      return <div />;
    }

    const root = createRoot(env.container as any);
    await act(async () => {
      root.render(<Probe />);
      await flushPromises();
    });

    await act(async () => {
      hook?.handleDragEnter({
        dataTransfer,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      } as any);
      await flushPromises();
    });

    await waitFor(() => cancelPurpose.mock.calls.length === 1);
    expect(cancelPurpose).toHaveBeenCalledWith('invite-queued', 'file-drop-invite-queued');

    await act(async () => {
      await hook?.handleDrop({
        dataTransfer,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      } as any);
      await flushPromises();
    });

    expect(fileDrop).toHaveBeenCalledWith([{ name: 'draft.txt', path: 'F:/tmp/draft.txt' }]);
    expect(startPurpose).toHaveBeenCalledTimes(2);
    expect(startPurpose.mock.calls[1][0]).toMatchObject({
      kind: 'file.drop.intake',
      correlationId: startPurpose.mock.calls[0][0].correlationId
    });
    expect(openWindow).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    env.cleanup();
  });

  it('starts a file.drop.intake purpose from selected dropped files', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { useFileDropCollector } = await import('../src/features/sprite-assistant/hooks/useFileDropCollector');

    const env = installMiniDom();
    const fileDrop = vi.fn(async () => undefined);
    const startPurpose = vi.fn(async () => ({ accepted: true, status: 'started' }));
    const openWindow = vi.fn();
    resourceServiceMocks.addResourcesFromSelectedFiles.mockResolvedValue([
      { id: 'resource-1', title: 'notes.docx', filePath: 'F:/tmp/notes.docx', workspaceId: 'workspace-1' }
    ]);

    (env.window as any).YUA = {
      sprite: {
        fileDrop,
        startPurpose,
        interact: vi.fn()
      },
      window: {
        'window:open': openWindow
      }
    };

    let hook: ReturnType<typeof useFileDropCollector> | undefined;
    function Probe(): JSX.Element {
      hook = useFileDropCollector();
      return <div />;
    }

    const root = createRoot(env.container as any);
    await act(async () => {
      root.render(<Probe />);
      await flushPromises();
    });

    await act(async () => {
      await hook?.handleDropFiles([{ name: 'notes.docx', path: 'F:/tmp/notes.docx', size: 1234 }]);
      await flushPromises();
    });

    expect(fileDrop).toHaveBeenCalledWith([{ name: 'notes.docx', path: 'F:/tmp/notes.docx' }]);
    expect(resourceServiceMocks.addResourcesFromSelectedFiles).toHaveBeenCalledWith([{ name: 'notes.docx', path: 'F:/tmp/notes.docx', size: 1234 }]);
    expect(startPurpose).toHaveBeenCalledTimes(1);
    const request = startPurpose.mock.calls[0][0];
    expect(request).toMatchObject({
      kind: 'file.drop.intake',
      source: 'user-event',
      presetId: 'file.drop.intake',
      priority: 100,
      context: {
        files: [{ name: 'notes.docx', path: 'F:/tmp/notes.docx' }],
        resources: [{ id: 'resource-1', title: 'notes.docx', filePath: 'F:/tmp/notes.docx', workspaceId: 'workspace-1' }],
        fileActionsMenuPayload: {
          files: [{ name: 'notes.docx', path: 'F:/tmp/notes.docx' }],
          resources: [{ id: 'resource-1', title: 'notes.docx', filePath: 'F:/tmp/notes.docx', workspaceId: 'workspace-1' }],
          source: 'drop'
        },
        fileCount: 1,
        fileNames: ['notes.docx'],
        resourceIds: ['resource-1'],
        primaryResourceName: 'notes.docx'
      }
    });
    expect(request.correlationId).toEqual(expect.stringMatching(/^file-drop-/));
    expect(request.context.fileActionsMenuPayload.correlationId).toBe(request.correlationId);
    expect(openWindow).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    env.cleanup();
  });

  it('runs file.drop.intake through menu open, purpose event resolution, and routine cleanup', async () => {
    const opened: Array<{ windowKey: string; payload?: Record<string, unknown> }> = [];
    const calls: string[] = [];
    const { mgr, dataDir } = createManager({
      purposeWindowAdapter: {
        open(windowKey: string, payload?: Record<string, unknown>) {
          opened.push({ windowKey, payload });
        }
      }
    });
    dataDirs.add(dataDir);

    (mgr as any).runPurposeAnimationStep = async (step: any) => {
      calls.push(`play:${step.trigger ?? step.animationId}`);
    };
    (mgr as any).runPurposeWalkStep = async (step: any) => {
      calls.push(`walk:${typeof step.target === 'string' ? step.target : 'point'}`);
    };
    vi.spyOn(mgr, 'showToast').mockImplementation((_content?: string, options?: any) => {
      calls.push(`toast:${options?.category ?? 'none'}`);
    });

    const result = await mgr.startPurpose({
      kind: 'file.drop.intake',
      reason: 'user dropped files',
      source: 'user-event',
      presetId: 'file.drop.intake',
      priority: 100,
      correlationId: 'drop-integration',
      context: {
        files: [{ name: 'notes.docx', path: 'F:/tmp/notes.docx' }],
        resources: [{ id: 'resource-1', title: 'notes.docx', filePath: 'F:/tmp/notes.docx' }]
      }
    });

    expect(result.accepted).toBe(true);
    await waitFor(() => opened.length === 1);
    expect(opened[0]).toEqual({
      windowKey: 'fileActionsMenu',
      payload: {
        files: [{ name: 'notes.docx', path: 'F:/tmp/notes.docx' }],
        resources: [{ id: 'resource-1', title: 'notes.docx', filePath: 'F:/tmp/notes.docx' }],
        source: 'drop',
        correlationId: 'drop-integration'
      }
    });
    expect(mgr.getPurposeSnapshot().current).toMatchObject({
      kind: 'file.drop.intake',
      correlationId: 'drop-integration'
    });
    await waitFor(() => ((mgr as any).purposeEventWaiter?.waiters?.size ?? 0) === 1);

    const matched = mgr.emitPurposeEvent({
      source: 'purpose-event',
      event: 'fileAction:resolved',
      correlationId: 'drop-integration',
      payload: { outcome: 'selected', resourceId: 'resource-1' }
    });

    expect(matched.matched).toBe(1);
    await waitFor(() => mgr.getPurposeSnapshot().current?.kind === 'idle.presence');
    expect(calls).toEqual(['play:fileDrop', 'play:thinking', 'toast:question', 'play:success', 'toast:success', 'walk:corner']);

    const history = await mgr.listPurposeHistory({ kind: 'file.drop.intake', limit: 50 });
    expect(history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: 'purpose:completed', purposeId: result.purpose.id, status: 'completed' }),
        expect.objectContaining({ eventType: 'routine:completed', purposeId: result.purpose.id, status: 'completed' }),
        expect.objectContaining({ eventType: 'step:completed', stepId: 'wait-menu-result', status: 'completed' })
      ])
    );
  });
});
