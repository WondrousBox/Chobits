import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetSpriteCapabilityRuntime } from '../packages/sprite-core/capability-runtime';
import { SpriteManager } from '../packages/sprite-core/manager/sprite-manager';
import { resetPersonaRulesRuntime } from '../packages/sprite-core/persona-rules';
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

  it('bridges drag/drop events into the unified file.drop routine contract', async () => {
    const { act, useEffect } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { useFileDropCollector } = await import('../src/features/sprite-assistant/hooks/useFileDropCollector');

    const env = installMiniDom();
    const fileDrop = vi.fn(async () => undefined);
    const emitPurposeEvent = vi.fn(async () => ({ matched: 1 }));
    const interact = vi.fn();
    const dataTransfer = {
      types: ['Files'],
      files: [{ name: 'draft.txt', path: 'F:/tmp/draft.txt' }]
    };
    resourceServiceMocks.addResourcesFromDataTransfer.mockResolvedValue([
      { id: 'resource-draft', title: 'draft.txt', filePath: 'F:/tmp/draft.txt', workspaceId: 'workspace-1' }
    ]);

    (env.window as any).YUA = {
      file: {
        getPathForFile: (file: { path?: string }) => file.path || ''
      },
      sprite: {
        fileDrop,
        emitPurposeEvent,
        interact
      }
    };

    let hook: ReturnType<typeof useFileDropCollector> | undefined;
    function Probe(): JSX.Element {
      const currentHook = useFileDropCollector();
      useEffect(() => {
        hook = currentHook;
      }, [currentHook]);
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

    expect(interact).toHaveBeenCalledTimes(1);
    expect(interact.mock.calls[0][0]).toBe('file-drag-over');
    const dragCorrelationId = interact.mock.calls[0][1].correlationId;
    expect(dragCorrelationId).toEqual(expect.stringMatching(/^file-drop-/));

    await act(async () => {
      await hook?.handleDrop({
        dataTransfer,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      } as any);
      await flushPromises();
    });

    expect(fileDrop).toHaveBeenCalledWith([{ name: 'draft.txt', path: 'F:/tmp/draft.txt' }], { correlationId: dragCorrelationId });
    expect(resourceServiceMocks.addResourcesFromDataTransfer).toHaveBeenCalledWith(dataTransfer, { source: 'sprite-drop' });
    expect(emitPurposeEvent).toHaveBeenCalledWith({
      source: 'purpose-event',
      event: 'fileDrop:resources-ready',
      correlationId: dragCorrelationId,
      payload: expect.objectContaining({
        purposeSource: 'sprite-drop',
        files: [{ name: 'draft.txt', path: 'F:/tmp/draft.txt' }],
        resources: [{ id: 'resource-draft', title: 'draft.txt', filePath: 'F:/tmp/draft.txt', workspaceId: 'workspace-1' }],
        fileActionsMenuPayload: {
          files: [{ name: 'draft.txt', path: 'F:/tmp/draft.txt' }],
          resources: [{ id: 'resource-draft', title: 'draft.txt', filePath: 'F:/tmp/draft.txt', workspaceId: 'workspace-1' }],
          source: 'drop',
          correlationId: dragCorrelationId
        },
        fileCount: 1,
        fileNames: ['draft.txt'],
        resourceIds: ['resource-draft'],
        primaryResourceName: 'draft.txt'
      })
    });

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    env.cleanup();
  });

  it('emits file drag leave with the active file drop correlation', async () => {
    const { act, useEffect } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { useFileDropCollector } = await import('../src/features/sprite-assistant/hooks/useFileDropCollector');

    const env = installMiniDom();
    const fileDrop = vi.fn(async () => undefined);
    const emitPurposeEvent = vi.fn(async () => ({ matched: 0 }));
    const interact = vi.fn();
    const dataTransfer = {
      types: ['Files'],
      files: [{ name: 'draft.txt', path: 'F:/tmp/draft.txt' }]
    };
    resourceServiceMocks.addResourcesFromDataTransfer.mockResolvedValue([]);

    (env.window as any).YUA = {
      sprite: {
        fileDrop,
        emitPurposeEvent,
        interact
      }
    };

    let hook: ReturnType<typeof useFileDropCollector> | undefined;
    function Probe(): JSX.Element {
      const currentHook = useFileDropCollector();
      useEffect(() => {
        hook = currentHook;
      }, [currentHook]);
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

    const correlationId = interact.mock.calls[0][1].correlationId;

    await act(async () => {
      hook?.handleDragLeave({
        dataTransfer,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      } as any);
      await flushPromises();
    });

    expect(interact.mock.calls).toEqual([
      ['file-drag-over', { correlationId }],
      ['file-drag-leave', { correlationId }]
    ]);
    expect(fileDrop).not.toHaveBeenCalled();
    expect(emitPurposeEvent).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    env.cleanup();
  });

  it('bridges selected dropped files into the same file.drop routine contract', async () => {
    const { act, useEffect } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { useFileDropCollector } = await import('../src/features/sprite-assistant/hooks/useFileDropCollector');

    const env = installMiniDom();
    const fileDrop = vi.fn(async () => undefined);
    const emitPurposeEvent = vi.fn(async () => ({ matched: 1 }));
    resourceServiceMocks.addResourcesFromSelectedFiles.mockResolvedValue([
      { id: 'resource-1', title: 'notes.docx', filePath: 'F:/tmp/notes.docx', workspaceId: 'workspace-1' }
    ]);

    (env.window as any).YUA = {
      sprite: {
        fileDrop,
        emitPurposeEvent,
        interact: vi.fn()
      }
    };

    let hook: ReturnType<typeof useFileDropCollector> | undefined;
    function Probe(): JSX.Element {
      const currentHook = useFileDropCollector();
      useEffect(() => {
        hook = currentHook;
      }, [currentHook]);
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

    expect(fileDrop).toHaveBeenCalledWith([{ name: 'notes.docx', path: 'F:/tmp/notes.docx' }], { correlationId: expect.stringMatching(/^file-drop-/) });
    const correlationId = fileDrop.mock.calls[0][1].correlationId;
    expect(resourceServiceMocks.addResourcesFromSelectedFiles).toHaveBeenCalledWith([{ name: 'notes.docx', path: 'F:/tmp/notes.docx', size: 1234 }], { source: 'sprite-drop' });
    expect(emitPurposeEvent).toHaveBeenCalledWith({
      source: 'purpose-event',
      event: 'fileDrop:resources-ready',
      correlationId,
      payload: expect.objectContaining({
        purposeSource: 'sprite-drop',
        files: [{ name: 'notes.docx', path: 'F:/tmp/notes.docx' }],
        resources: [{ id: 'resource-1', title: 'notes.docx', filePath: 'F:/tmp/notes.docx', workspaceId: 'workspace-1' }],
        fileActionsMenuPayload: {
          files: [{ name: 'notes.docx', path: 'F:/tmp/notes.docx' }],
          resources: [{ id: 'resource-1', title: 'notes.docx', filePath: 'F:/tmp/notes.docx', workspaceId: 'workspace-1' }],
          source: 'drop',
          correlationId
        },
        fileCount: 1,
        fileNames: ['notes.docx'],
        resourceIds: ['resource-1'],
        primaryResourceName: 'notes.docx'
      })
    });

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    env.cleanup();
  });

  it('emits a failed import result when selected dropped files cannot be imported', async () => {
    const { act, useEffect } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { useFileDropCollector } = await import('../src/features/sprite-assistant/hooks/useFileDropCollector');

    const env = installMiniDom();
    const fileDrop = vi.fn(async () => undefined);
    const emitPurposeEvent = vi.fn(async () => ({ matched: 1 }));
    resourceServiceMocks.addResourcesFromSelectedFiles.mockResolvedValue([]);

    (env.window as any).YUA = {
      sprite: {
        fileDrop,
        emitPurposeEvent,
        interact: vi.fn()
      }
    };

    let hook: ReturnType<typeof useFileDropCollector> | undefined;
    function Probe(): JSX.Element {
      const currentHook = useFileDropCollector();
      useEffect(() => {
        hook = currentHook;
      }, [currentHook]);
      return <div />;
    }

    const root = createRoot(env.container as any);
    await act(async () => {
      root.render(<Probe />);
      await flushPromises();
    });

    await act(async () => {
      await hook?.handleDropFiles([{ name: 'failed.docx', path: 'F:/tmp/failed.docx', size: 1234 }]);
      await flushPromises();
    });

    const correlationId = fileDrop.mock.calls[0][1].correlationId;
    expect(emitPurposeEvent).toHaveBeenCalledWith({
      source: 'purpose-event',
      event: 'fileDrop:resources-ready',
      correlationId,
      payload: expect.objectContaining({
        importStatus: 'failed',
        attemptedCount: 1,
        failedCount: 1,
        resources: [],
        fileCount: 1,
        fileNames: ['failed.docx']
      })
    });

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    env.cleanup();
  });

  it('runs unified file.drop after drop, resource ready, menu resolution, and cleanup', async () => {
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

    mgr.reportInteraction('file-drag-over', { correlationId: 'drop-integration' });
    expect(mgr.getState()).toBe('reacting');
    expect(mgr.getSubState()).toBe('file-drag-over');
    expect(mgr.getPurposeSnapshot().current?.kind).not.toBe('file.drop');

    await mgr.handleFileDrop([{ name: 'notes.docx', path: 'F:/tmp/notes.docx' }], { correlationId: 'drop-integration' });
    await waitFor(() => mgr.getPurposeSnapshot().current?.kind === 'file.drop');
    const purposeId = mgr.getPurposeSnapshot().current?.id;
    const readyMatched = mgr.emitPurposeEvent({
      source: 'purpose-event',
      event: 'fileDrop:resources-ready',
      correlationId: 'drop-integration',
      payload: {
        fileActionsMenuPayload: {
          files: [{ name: 'notes.docx', path: 'F:/tmp/notes.docx' }],
          resources: [{ id: 'resource-1', title: 'notes.docx', filePath: 'F:/tmp/notes.docx' }],
          source: 'drop',
          correlationId: 'drop-integration'
        }
      }
    });
    expect(readyMatched.matched).toBeGreaterThanOrEqual(0);

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
      kind: 'file.drop',
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

    const history = await mgr.listPurposeHistory({ kind: 'file.drop', limit: 50 });
    expect(history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: 'purpose:completed', purposeId, status: 'completed' }),
        expect.objectContaining({ eventType: 'routine:completed', purposeId, status: 'completed' }),
        expect.objectContaining({ eventType: 'step:completed', stepId: 'wait-menu-result', status: 'completed' })
      ])
    );
  });

  it('finishes file.drop without opening the actions menu when import fails', async () => {
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

    await mgr.handleFileDrop([{ name: 'failed.docx', path: 'F:/tmp/failed.docx' }], { correlationId: 'drop-failed' });
    await waitFor(() => mgr.getPurposeSnapshot().current?.kind === 'file.drop');
    mgr.emitPurposeEvent({
      source: 'purpose-event',
      event: 'fileDrop:resources-ready',
      correlationId: 'drop-failed',
      payload: {
        importStatus: 'failed',
        attemptedCount: 1,
        failedCount: 1,
        resources: []
      }
    });

    await waitFor(() => mgr.getPurposeSnapshot().current?.kind === 'idle.presence');
    expect(opened).toEqual([]);
    expect(calls).toEqual(['play:fileDrop', 'play:thinking', 'play:failure', 'toast:failure', 'walk:corner']);
  });
});
