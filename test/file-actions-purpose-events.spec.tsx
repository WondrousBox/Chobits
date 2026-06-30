import { describe, expect, it, vi } from 'vitest';

import { installMiniDom } from './utils/minidom';

type RadialMenuProps = {
  items: Array<{ id: string; action?: () => void }>;
  onClose?: () => void;
};

const radialHarness = vi.hoisted(() => ({
  latestProps: undefined as RadialMenuProps | undefined
}));

vi.mock('../src/components/common/RadialMenu/RadialMenu', async () => {
  const React = await import('react');
  return {
    default: (props: RadialMenuProps) => {
      radialHarness.latestProps = props;
      return React.createElement('div', { 'data-radial-menu': 'true' });
    }
  };
});

vi.mock('@/lib/ai-model-first', () => ({
  resolveModelFirstSelection: vi.fn()
}));

vi.mock('@/lib/workflow-runner', () => ({
  runWorkflow: vi.fn()
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn()
  }
}));

async function waitFor(predicate: () => boolean, timeoutMs = 800): Promise<void> {
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

function createMenuHarness(
  options: {
    listOcrModels?: () => Promise<{ ok: boolean; data?: any[]; error?: string }>;
    openWindow?: () => Promise<void> | void;
    payload?: Record<string, unknown>;
    pluginInstall?: () => Promise<{ ok: boolean; data?: any; error?: string }>;
    recognizeImage?: () => Promise<{ ok: boolean; data?: any; error?: string; code?: string }>;
    resourceUpdate?: () => Promise<{ success: boolean; data?: any; error?: string }>;
    confirmNotice?: () => Promise<{ confirmed: boolean; messageId?: string; reason?: string }>;
  } = {}
): {
  closeWindow: ReturnType<typeof vi.fn>;
  confirmNotice: ReturnType<typeof vi.fn>;
  emitPurposeEvent: ReturnType<typeof vi.fn>;
  env: ReturnType<typeof installMiniDom>;
  ipcListeners: Map<string, Set<(...args: any[]) => void>>;
  listOcrModels: ReturnType<typeof vi.fn>;
  openWindow: ReturnType<typeof vi.fn>;
  payloadGet: ReturnType<typeof vi.fn>;
  pluginInstall: ReturnType<typeof vi.fn>;
  recognizeImage: ReturnType<typeof vi.fn>;
  resourceUpdate: ReturnType<typeof vi.fn>;
  startPurpose: ReturnType<typeof vi.fn>;
} {
  radialHarness.latestProps = undefined;
  const env = installMiniDom();
  const payload = options.payload ?? {
    files: [{ name: 'notes.docx', path: 'F:/tmp/notes.docx' }],
    resources: [{ id: 'resource-1', title: 'notes.docx', filePath: 'F:/tmp/notes.docx', workspaceId: 'workspace-1' }],
    source: 'drop',
    correlationId: 'drop-1'
  };
  const emitPurposeEvent = vi.fn(async () => ({ matched: 1 }));
  const confirmNotice = vi.fn(options.confirmNotice ?? (async () => ({ confirmed: true, messageId: 'confirm-1', reason: 'confirm' })));
  const startPurpose = vi.fn(async () => ({ accepted: true, status: 'started' }));
  const closeWindow = vi.fn(async () => undefined);
  const openWindow = vi.fn(options.openWindow ?? (async () => undefined));
  const payloadGet = vi.fn(async () => payload);
  const listOcrModels = vi.fn(options.listOcrModels ?? (async () => ({ ok: true, data: [] })));
  const recognizeImage = vi.fn(
    options.recognizeImage ??
      (async () => ({
        ok: true,
        data: {
          confidence: 0.96,
          engine: 'paddle',
          modelDisplayName: 'PP-OCRv6 Small',
          modelName: 'ppocr-v6-small',
          results: [],
          text: 'receipt text'
        }
      }))
  );
  const resourceUpdate = vi.fn(
    options.resourceUpdate ??
      (async () => ({
        success: true,
        data: { id: 'updated-resource', title: 'updated.png', contentText: 'receipt text', metadata: '{}', status: 'ready' }
      }))
  );
  const pluginInstall = vi.fn(options.pluginInstall ?? (async () => ({ ok: true, data: { id: 'plugin:paddle-ocr_model_ppocr-v6-small_1', status: 'queued' } })));
  const ipcListeners = new Map<string, Set<(...args: any[]) => void>>();

  (env.window as any).ipcRenderer = {
    on: vi.fn((channel: string, listener: (...args: any[]) => void) => {
      if (!ipcListeners.has(channel)) ipcListeners.set(channel, new Set());
      ipcListeners.get(channel)?.add(listener);
    }),
    off: vi.fn((channel: string, listener: (...args: any[]) => void) => {
      ipcListeners.get(channel)?.delete(listener);
    })
  };
  (env.window as any).YUA = {
    ocr: {
      listModels: listOcrModels,
      recognizeImage
    },
    pluginResource: {
      'plugin-resource:install': pluginInstall
    },
    resource: {
      'resource:update': resourceUpdate
    },
    sprite: {
      confirmNotice,
      emitPurposeEvent,
      startPurpose
    },
    window: {
      'window:payload:get': payloadGet,
      'window:close': closeWindow,
      'window:open': openWindow
    }
  };

  return { env, confirmNotice, emitPurposeEvent, startPurpose, closeWindow, openWindow, payloadGet, listOcrModels, recognizeImage, resourceUpdate, pluginInstall, ipcListeners };
}

function emitIpc(harness: { ipcListeners: Map<string, Set<(...args: any[]) => void>> }, channel: string, payload: unknown): void {
  for (const listener of harness.ipcListeners.get(channel) ?? []) {
    listener({}, payload);
  }
}

function purposeEvents(emitPurposeEvent: ReturnType<typeof vi.fn>): any[] {
  return emitPurposeEvent.mock.calls.map(([event]) => event).filter((event) => event.source !== 'app-event');
}

function appEvents(emitPurposeEvent: ReturnType<typeof vi.fn>): any[] {
  return emitPurposeEvent.mock.calls.map(([event]) => event).filter((event) => event.source === 'app-event');
}

describe('FileActionsMenu purpose events', () => {
  it('resolves cancellation when the menu unmounts without an action', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { default: FileActionsMenu } = await import('../src/pages/FileActionsMenu/FileActionsMenu');

    const harness = createMenuHarness();
    const root = createRoot(harness.env.container as any);

    await act(async () => {
      root.render(<FileActionsMenu />);
      await flushPromises();
    });
    await waitFor(() => Boolean(radialHarness.latestProps?.items.length));

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    await waitFor(() => harness.emitPurposeEvent.mock.calls.length >= 2);

    const events = purposeEvents(harness.emitPurposeEvent);
    expect(events[0]).toMatchObject({
      event: 'fileAction:cancelled',
      correlationId: 'drop-1',
      payload: { reason: 'menu-unmounted', correlationId: 'drop-1', resourceId: 'resource-1' }
    });
    expect(events[1]).toMatchObject({
      event: 'fileAction:resolved',
      correlationId: 'drop-1',
      payload: { outcome: 'cancelled', reason: 'menu-unmounted', correlationId: 'drop-1', resourceId: 'resource-1' }
    });
    expect(appEvents(harness.emitPurposeEvent)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'FILE_ACTION_CANCELLED', correlationId: 'drop-1' }),
        expect.objectContaining({ event: 'FILE_ACTION_RESOLVED', correlationId: 'drop-1' })
      ])
    );
    expect(harness.closeWindow).not.toHaveBeenCalled();

    harness.env.cleanup();
  });

  it('does not let RadialMenu onClose close the window before action resolution', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { default: FileActionsMenu } = await import('../src/pages/FileActionsMenu/FileActionsMenu');

    let releaseAssistantOpen: (() => void) | undefined;
    const harness = createMenuHarness({
      openWindow: () =>
        new Promise<void>((resolve) => {
          releaseAssistantOpen = resolve;
        })
    });
    const root = createRoot(harness.env.container as any);

    await act(async () => {
      root.render(<FileActionsMenu />);
      await flushPromises();
    });
    await waitFor(() => Boolean(radialHarness.latestProps?.items.length));

    await act(async () => {
      radialHarness.latestProps?.items[0]?.action?.();
      radialHarness.latestProps?.onClose?.();
      await flushPromises();
    });

    const events = purposeEvents(harness.emitPurposeEvent);
    expect(events[0]).toMatchObject({
      event: 'fileAction:selected',
      correlationId: 'drop-1',
      payload: { actionId: 'doc-sum', correlationId: 'drop-1', resourceId: 'resource-1' }
    });
    expect(harness.closeWindow).not.toHaveBeenCalled();

    releaseAssistantOpen?.();
    await waitFor(() => harness.closeWindow.mock.calls.length === 1);

    expect(purposeEvents(harness.emitPurposeEvent).some((event) => event.event === 'fileAction:resolved' && event.payload?.outcome === 'selected')).toBe(true);

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    harness.env.cleanup();
  });

  it('resolves failed when a workflow action reports an error', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { runWorkflow } = await import('@/lib/workflow-runner');
    const { default: FileActionsMenu } = await import('../src/pages/FileActionsMenu/FileActionsMenu');

    vi.mocked(runWorkflow).mockImplementationOnce(async (request: any) => {
      request.onError(new Error('workflow exploded'));
    });
    const harness = createMenuHarness({
      payload: {
        files: [{ name: 'voice.mp3', path: 'F:/tmp/voice.mp3' }],
        resources: [{ id: 'resource-audio', title: 'voice.mp3', filePath: 'F:/tmp/voice.mp3', workspaceId: 'workspace-1' }],
        source: 'drop',
        correlationId: 'drop-audio'
      }
    });
    const root = createRoot(harness.env.container as any);

    await act(async () => {
      root.render(<FileActionsMenu />);
      await flushPromises();
    });
    await waitFor(() => Boolean(radialHarness.latestProps?.items.some((item) => item.id === 'audio-stt')));

    await act(async () => {
      radialHarness.latestProps?.items.find((item) => item.id === 'audio-stt')?.action?.();
      await flushPromises();
    });
    await waitFor(() => harness.closeWindow.mock.calls.length === 1);

    const events = purposeEvents(harness.emitPurposeEvent);
    expect(events[0]).toMatchObject({
      event: 'fileAction:selected',
      correlationId: 'drop-audio',
      payload: { actionId: 'audio-stt', correlationId: 'drop-audio', resourceId: 'resource-audio' }
    });
    expect(events.some((event) => event.event === 'fileAction:failed' && event.payload?.actionPurpose === 'audio transcription' && event.payload?.workflowId === 'sample:transcribe')).toBe(true);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'fileAction:resolved',
          correlationId: 'drop-audio',
          payload: expect.objectContaining({ outcome: 'failed', correlationId: 'drop-audio', resourceId: 'resource-audio' })
        })
      ])
    );

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    harness.env.cleanup();
  });

  it('leaves workflow.waiting startup to the global workflow event route', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { runWorkflow } = await import('@/lib/workflow-runner');
    const { default: FileActionsMenu } = await import('../src/pages/FileActionsMenu/FileActionsMenu');

    vi.mocked(runWorkflow).mockImplementationOnce(async (request: any) => {
      request.onSuccess('run-audio-1');
    });
    const harness = createMenuHarness({
      payload: {
        files: [{ name: 'voice.mp3', path: 'F:/tmp/voice.mp3' }],
        resources: [{ id: 'resource-audio', title: 'voice.mp3', filePath: 'F:/tmp/voice.mp3', workspaceId: 'workspace-1' }],
        source: 'drop',
        correlationId: 'drop-audio'
      }
    });
    const root = createRoot(harness.env.container as any);

    await act(async () => {
      root.render(<FileActionsMenu />);
      await flushPromises();
    });
    await waitFor(() => Boolean(radialHarness.latestProps?.items.some((item) => item.id === 'audio-stt')));

    await act(async () => {
      radialHarness.latestProps?.items.find((item) => item.id === 'audio-stt')?.action?.();
      await flushPromises();
    });
    await waitFor(() => harness.closeWindow.mock.calls.length === 1);

    expect(harness.startPurpose).not.toHaveBeenCalled();
    expect(vi.mocked(runWorkflow).mock.calls[0][0]).toMatchObject({
      defId: 'sample:transcribe',
      metadata: {
        resourceId: 'resource-audio',
        resourceName: 'voice.mp3',
        workspaceId: 'workspace-1',
        workflowName: 'audio transcription',
        actionId: 'audio-stt',
        actionPurpose: 'audio transcription'
      }
    });
    expect(purposeEvents(harness.emitPurposeEvent)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'fileAction:workflow-started',
          correlationId: 'drop-audio',
          payload: expect.objectContaining({
            workflowRunId: 'run-audio-1',
            runId: 'run-audio-1',
            workflowId: 'sample:transcribe'
          })
        }),
        expect.objectContaining({
          event: 'fileAction:resolved',
          correlationId: 'drop-audio',
          payload: expect.objectContaining({ outcome: 'selected', resourceId: 'resource-audio' })
        })
      ])
    );
    expect(appEvents(harness.emitPurposeEvent)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'FILE_ACTION_WORKFLOW_STARTED',
          correlationId: 'drop-audio',
          payload: expect.objectContaining({
            actionId: 'audio-stt',
            workflowRunId: 'run-audio-1',
            workflowId: 'sample:transcribe'
          })
        })
      ])
    );

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    harness.env.cleanup();
  });

  it('starts image understanding and runs OCR from image actions', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { runWorkflow } = await import('@/lib/workflow-runner');
    const { default: FileActionsMenu } = await import('../src/pages/FileActionsMenu/FileActionsMenu');

    vi.mocked(runWorkflow).mockImplementationOnce(async (request: any) => {
      request.onSuccess('run-image-understand-1');
    });
    const harness = createMenuHarness({
      payload: {
        files: [{ name: 'scene.png', path: 'F:/tmp/scene.png' }],
        resources: [{ id: 'resource-image', title: 'scene.png', filePath: 'F:/tmp/scene.png', workspaceId: 'workspace-1' }],
        source: 'drop',
        correlationId: 'drop-image'
      }
    });
    const root = createRoot(harness.env.container as any);

    await act(async () => {
      root.render(<FileActionsMenu />);
      await flushPromises();
    });
    await waitFor(() => Boolean(radialHarness.latestProps?.items.some((item) => item.id === 'image-analyze')));
    expect(radialHarness.latestProps?.items.map((item) => item.id)).toEqual(expect.arrayContaining(['image-analyze', 'image-ocr']));

    await act(async () => {
      radialHarness.latestProps?.items.find((item) => item.id === 'image-analyze')?.action?.();
      await flushPromises();
    });
    await waitFor(() => harness.closeWindow.mock.calls.length === 1);

    expect(runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        defId: 'sample:image-understand',
        input: expect.objectContaining({ resourceId: 'resource-image' })
      })
    );
    expect(appEvents(harness.emitPurposeEvent)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'FILE_ACTION_WORKFLOW_STARTED',
          payload: expect.objectContaining({
            actionId: 'image-analyze',
            actionPurpose: 'image understand',
            workflowId: 'sample:image-understand',
            workflowRunId: 'run-image-understand-1'
          })
        })
      ])
    );

    await act(async () => {
      root.unmount();
      await flushPromises();
    });

    const secondHarness = createMenuHarness({
      listOcrModels: async () => ({
        ok: true,
        data: [
          {
            engine: 'paddle',
            name: 'ppocr-v6-small',
            resourceId: 'ppocr-v6-small',
            displayName: 'PP-OCRv6 Small',
            description: 'default',
            installed: true,
            missingFiles: []
          }
        ]
      }),
      payload: {
        files: [{ name: 'receipt.png', path: 'F:/tmp/receipt.png' }],
        resources: [{ id: 'resource-ocr', title: 'receipt.png', filePath: 'F:/tmp/receipt.png', workspaceId: 'workspace-1' }],
        source: 'drop',
        correlationId: 'drop-ocr'
      }
    });
    const secondRoot = createRoot(secondHarness.env.container as any);

    await act(async () => {
      secondRoot.render(<FileActionsMenu />);
      await flushPromises();
    });
    await waitFor(() => Boolean(radialHarness.latestProps?.items.some((item) => item.id === 'image-ocr')));

    await act(async () => {
      radialHarness.latestProps?.items.find((item) => item.id === 'image-ocr')?.action?.();
      await flushPromises();
    });
    await waitFor(() => secondHarness.closeWindow.mock.calls.length === 1);

    expect(secondHarness.recognizeImage).toHaveBeenCalledWith(expect.objectContaining({ imagePath: 'F:/tmp/receipt.png', model: 'ppocr-v6-small' }));
    expect(secondHarness.resourceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'resource-ocr',
        patch: expect.objectContaining({
          contentText: 'receipt text',
          status: 'ready'
        })
      })
    );
    expect(appEvents(secondHarness.emitPurposeEvent)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'FILE_ACTION_OCR_COMPLETED',
          payload: expect.objectContaining({
            actionId: 'image-ocr',
            modelName: 'ppocr-v6-small',
            textLength: 'receipt text'.length
          })
        })
      ])
    );

    await act(async () => {
      secondRoot.unmount();
      await flushPromises();
    });
    harness.env.cleanup();
    secondHarness.env.cleanup();
  });

  it('confirms OCR model download, waits for install, then continues recognition', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { default: FileActionsMenu } = await import('../src/pages/FileActionsMenu/FileActionsMenu');

    let modelInstalled = false;
    const harness = createMenuHarness({
      listOcrModels: async () => ({
        ok: true,
        data: [
          {
            engine: 'paddle',
            name: 'ppocr-v6-small',
            resourceId: 'ppocr-v6-small',
            displayName: 'PP-OCRv6 Small',
            description: 'default',
            installed: modelInstalled,
            missingFiles: modelInstalled ? [] : ['det.onnx']
          }
        ]
      }),
      payload: {
        files: [{ name: 'receipt.png', path: 'F:/tmp/receipt.png' }],
        resources: [{ id: 'resource-ocr', title: 'receipt.png', filePath: 'F:/tmp/receipt.png', workspaceId: 'workspace-1' }],
        source: 'drop',
        correlationId: 'drop-ocr'
      }
    });
    const root = createRoot(harness.env.container as any);

    await act(async () => {
      root.render(<FileActionsMenu />);
      await flushPromises();
    });
    await waitFor(() => Boolean(radialHarness.latestProps?.items.some((item) => item.id === 'image-ocr')));

    await act(async () => {
      radialHarness.latestProps?.items.find((item) => item.id === 'image-ocr')?.action?.();
      await flushPromises();
    });
    await waitFor(() => harness.pluginInstall.mock.calls.length === 1);

    expect(harness.confirmNotice).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'warning',
        confirmLabel: '下载模型',
        cancelLabel: '取消'
      })
    );
    expect(harness.pluginInstall).toHaveBeenCalledWith({
      pluginId: 'plugin:paddle-ocr',
      resourceId: 'ppocr-v6-small',
      deleteAfterInstall: true
    });
    expect(harness.openWindow).toHaveBeenCalledWith('pluginDownload');
    expect(harness.recognizeImage).not.toHaveBeenCalled();

    modelInstalled = true;
    await act(async () => {
      emitIpc(harness, 'plugin-resource:progress', {
        pluginId: 'plugin:paddle-ocr',
        resourceId: 'ppocr-v6-small',
        name: 'ppocr-v6-small',
        displayName: 'PP-OCRv6 Small',
        status: 'installed'
      });
      await flushPromises();
    });
    await waitFor(() => harness.closeWindow.mock.calls.length === 1);

    expect(harness.recognizeImage).toHaveBeenCalledWith(expect.objectContaining({ imagePath: 'F:/tmp/receipt.png', model: 'ppocr-v6-small' }));
    expect(purposeEvents(harness.emitPurposeEvent)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'fileAction:model-download-started',
          payload: expect.objectContaining({ actionId: 'image-ocr', modelName: 'ppocr-v6-small' })
        }),
        expect.objectContaining({
          event: 'fileAction:model-download-completed',
          payload: expect.objectContaining({ actionId: 'image-ocr', modelName: 'ppocr-v6-small' })
        }),
        expect.objectContaining({
          event: 'fileAction:ocr-completed',
          payload: expect.objectContaining({ actionId: 'image-ocr', textLength: 'receipt text'.length })
        }),
        expect.objectContaining({
          event: 'fileAction:resolved',
          payload: expect.objectContaining({ actionId: 'image-ocr', outcome: 'selected' })
        })
      ])
    );

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    harness.env.cleanup();
  });

  it('cancels OCR when sprite bubble model download confirmation is declined', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { default: FileActionsMenu } = await import('../src/pages/FileActionsMenu/FileActionsMenu');

    const harness = createMenuHarness({
      confirmNotice: async () => ({ confirmed: false, messageId: 'confirm-1', reason: 'cancel' }),
      listOcrModels: async () => ({
        ok: true,
        data: [
          {
            engine: 'paddle',
            name: 'ppocr-v6-small',
            resourceId: 'ppocr-v6-small',
            displayName: 'PP-OCRv6 Small',
            description: 'default',
            installed: false,
            missingFiles: ['det.onnx']
          }
        ]
      }),
      payload: {
        files: [{ name: 'receipt.png', path: 'F:/tmp/receipt.png' }],
        resources: [{ id: 'resource-ocr', title: 'receipt.png', filePath: 'F:/tmp/receipt.png', workspaceId: 'workspace-1' }],
        source: 'drop',
        correlationId: 'drop-ocr'
      }
    });
    const root = createRoot(harness.env.container as any);

    await act(async () => {
      root.render(<FileActionsMenu />);
      await flushPromises();
    });
    await waitFor(() => Boolean(radialHarness.latestProps?.items.some((item) => item.id === 'image-ocr')));

    await act(async () => {
      radialHarness.latestProps?.items.find((item) => item.id === 'image-ocr')?.action?.();
      await flushPromises();
    });
    await waitFor(() => harness.closeWindow.mock.calls.length === 1);

    expect(harness.confirmNotice).toHaveBeenCalled();
    expect(harness.pluginInstall).not.toHaveBeenCalled();
    expect(harness.openWindow).not.toHaveBeenCalledWith('pluginDownload');
    expect(harness.recognizeImage).not.toHaveBeenCalled();
    expect(purposeEvents(harness.emitPurposeEvent)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'fileAction:cancelled',
          payload: expect.objectContaining({ actionId: 'image-ocr', reason: 'ocr-model-download-cancelled' })
        }),
        expect.objectContaining({
          event: 'fileAction:resolved',
          payload: expect.objectContaining({ actionId: 'image-ocr', outcome: 'cancelled' })
        })
      ])
    );

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    harness.env.cleanup();
  });
});
