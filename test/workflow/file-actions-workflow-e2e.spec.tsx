import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetSpriteCapabilityRuntime } from '../../packages/sprite-core/capability-runtime';
import { initSpriteEventListener } from '../../packages/sprite-core/handler/sprite-event-listener';
import { SpriteManager } from '../../packages/sprite-core/manager/sprite-manager';
import { resetPersonaRulesRuntime } from '../../packages/sprite-core/persona-rules';
import { installMiniDom } from '../utils/minidom';

type RadialMenuProps = {
  items: Array<{ id: string; action?: () => void }>;
  onClose?: () => void;
};

const radialHarness = vi.hoisted(() => ({
  latestProps: undefined as RadialMenuProps | undefined
}));

vi.mock('../../src/components/common/RadialMenu/RadialMenu', async () => {
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

function createManager(): {
  mgr: SpriteManager;
  sent: Array<{ channel: string; payload: unknown }>;
  dataDir: string;
} {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'file-actions-workflow-e2e-'));
  const { win, sent } = createTestWindow();
  const mgr = SpriteManager.init({
    win: win as any,
    dataDir,
    getScreenSize: () => ({ width: 1280, height: 720 }),
    appName: 'SpriteTest'
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

function getPurposeWaiterEvents(mgr: SpriteManager): string[] {
  const waiters = (mgr as any).purposeEventWaiter?.waiters as Set<{ step?: { event?: string } }> | undefined;
  return Array.from(waiters ?? [])
    .map((entry) => entry.step?.event)
    .filter((event): event is string => Boolean(event));
}

function emitInternalAppEvent(eventManager: unknown, event: string, payload: unknown): void {
  const listeners = (eventManager as any).listeners as Map<string, Set<(data?: unknown) => void>> | undefined;
  for (const handler of listeners?.get(event) ?? []) {
    handler(payload);
  }
}

describe('FileActionsMenu workflow waiting e2e', () => {
  const dataDirs = new Set<string>();

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    resetPersonaRulesRuntime();
    resetSpriteCapabilityRuntime();
    await destroyManager();
    for (const dataDir of dataDirs) {
      removeDir(dataDir);
    }
    dataDirs.clear();
    radialHarness.latestProps = undefined;
  });

  it('routes a workflow action through workflow.waiting progress and completion', async () => {
    const { act } = await import('react');
    const { AppEvent, eventManager } = await import('@packages/event');
    const { createRoot } = await import('react-dom/client');
    const { runWorkflow } = await import('@/lib/workflow-runner');
    const { default: FileActionsMenu } = await import('../../src/pages/FileActionsMenu/FileActionsMenu');

    const calls: string[] = [];
    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);

    (mgr as any).runPurposeAnimationStep = async (step: any) => {
      calls.push(`play:${step.trigger ?? step.animationId}`);
    };
    (mgr as any).runPurposeWalkStep = async (step: any) => {
      calls.push(`walk:${typeof step.target === 'string' ? step.target : 'point'}`);
    };
    vi.spyOn(mgr, 'showBusy').mockImplementation((content?: string, progress?: number) => {
      calls.push(`busy-start:${progress}:${content}`);
    });
    vi.spyOn(mgr, 'updateBusy').mockImplementation((progress: number, content?: string) => {
      calls.push(`busy-update:${progress}:${content}`);
      const matched = mgr.emitPurposeEvent({
        source: 'app-event',
        event: 'SPRITE_WORKFLOW_COMPLETE',
        payload: { runId: 'run-menu-1', workflowRunId: 'run-menu-1', progress: 100, message: '处理完成' }
      });
      calls.push(`complete-matched:${matched.matched}`);
    });
    vi.spyOn(mgr, 'clearBusy').mockImplementation(() => {
      calls.push('busy-clear');
    });
    vi.spyOn(mgr, 'showToast').mockImplementation((_content?: string, options?: any) => {
      calls.push(`toast:${options?.category ?? 'none'}`);
    });

    vi.mocked(runWorkflow).mockImplementationOnce(async (request: any) => {
      request.onSuccess('run-menu-1');
    });

    const env = installMiniDom();
    const emitPurposeEvent = vi.fn(async (event: any) => mgr.emitPurposeEvent(event));
    const startPurpose = vi.fn(async (request: any) => mgr.startPurpose(request));
    const closeWindow = vi.fn(async () => undefined);
    const payloadGet = vi.fn(async () => ({
      files: [{ name: 'voice.mp3', path: 'F:/tmp/voice.mp3' }],
      resources: [{ id: 'resource-audio', title: 'voice.mp3', filePath: 'F:/tmp/voice.mp3', workspaceId: 'workspace-1' }],
      source: 'drop',
      correlationId: 'drop-menu'
    }));

    (env.window as any).ipcRenderer = {
      on: vi.fn(),
      off: vi.fn()
    };
    (env.window as any).YUA = {
      sprite: {
        emitPurposeEvent,
        startPurpose
      },
      window: {
        'window:payload:get': payloadGet,
        'window:close': closeWindow,
        'window:open': vi.fn(async () => undefined)
      }
    };

    const root = createRoot(env.container as any);
    await act(async () => {
      root.render(<FileActionsMenu />);
      await flushPromises();
    });
    await waitFor(() => Boolean(radialHarness.latestProps?.items.some((item) => item.id === 'audio-stt')));

    await act(async () => {
      radialHarness.latestProps?.items.find((item) => item.id === 'audio-stt')?.action?.();
      await flushPromises();
    });

    expect(startPurpose).not.toHaveBeenCalled();
    const cleanupListener = initSpriteEventListener(mgr);
    emitInternalAppEvent(eventManager, AppEvent.SPRITE_WORKFLOW_START, {
      runId: 'run-menu-1',
      workflowRunId: 'run-menu-1',
      workflowId: 'sample:transcribe',
      workflowName: 'audio transcription',
      resourceId: 'resource-audio'
    });
    await waitFor(() => getPurposeWaiterEvents(mgr).includes('SPRITE_WORKFLOW_PROGRESS'));
    expect(mgr.getPurposeSnapshot().current).toMatchObject({
      kind: 'workflow.waiting',
      correlationId: 'run-menu-1',
      context: {
        workflowRunId: 'run-menu-1',
        runId: 'run-menu-1',
        workflowId: 'sample:transcribe',
        workflowName: 'audio transcription',
        resourceId: 'resource-audio'
      }
    });

    const progressMatched = mgr.emitPurposeEvent({
      source: 'app-event',
      event: 'SPRITE_WORKFLOW_PROGRESS',
      payload: {
        runId: 'run-menu-1',
        workflowRunId: 'run-menu-1',
        workflowId: 'sample:transcribe',
        progress: 45,
        message: '转写中'
      }
    });

    expect(progressMatched.matched).toBe(1);
    await waitFor(() => mgr.getPurposeSnapshot().current?.kind === 'idle.presence');
    await waitFor(() => closeWindow.mock.calls.length === 1);

    expect(calls).toEqual([
      'busy-start:0:正在处理：audio transcription',
      'busy-update:45:转写中',
      'complete-matched:1',
      'busy-clear',
      'play:success',
      'toast:success',
      'walk:corner'
    ]);
    expect(emitPurposeEvent.mock.calls.map(([event]) => event)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'fileAction:selected',
          correlationId: 'drop-menu',
          payload: expect.objectContaining({ actionId: 'audio-stt', resourceId: 'resource-audio' })
        }),
        expect.objectContaining({
          event: 'fileAction:workflow-started',
          correlationId: 'drop-menu',
          payload: expect.objectContaining({ runId: 'run-menu-1', workflowId: 'sample:transcribe' })
        }),
        expect.objectContaining({
          event: 'fileAction:resolved',
          correlationId: 'drop-menu',
          payload: expect.objectContaining({ outcome: 'selected', resourceId: 'resource-audio' })
        })
      ])
    );

    const history = await mgr.listPurposeHistory({ kind: 'workflow.waiting', limit: 80 });
    expect(history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: 'step:completed', stepId: 'wait-workflow-progress', status: 'completed' }),
        expect.objectContaining({ eventType: 'step:completed', stepId: 'busy-progress', status: 'completed' }),
        expect.objectContaining({ eventType: 'purpose:completed', status: 'completed' })
      ])
    );

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    cleanupListener();
    env.cleanup();
  });
});
