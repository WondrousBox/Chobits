import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetSpriteCapabilityRuntime } from '../packages/sprite-core/capability-runtime';
import { SpriteManager } from '../packages/sprite-core/manager/sprite-manager';
import { resetPersonaRulesRuntime } from '../packages/sprite-core/persona-rules';

async function waitFor(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
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
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'workflow-waiting-purpose-'));
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

describe('workflow waiting purpose integration', () => {
  const dataDirs = new Set<string>();

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetPersonaRulesRuntime();
    resetSpriteCapabilityRuntime();
    await destroyManager();
    for (const dataDir of dataDirs) {
      removeDir(dataDir);
    }
    dataDirs.clear();
  });

  it('updates busy from workflow progress events and finishes on terminal events', async () => {
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
        payload: { runId: 'run-42', workflowRunId: 'run-42', progress: 100, message: '处理完成' }
      });
      calls.push(`complete-matched:${matched.matched}`);
    });
    vi.spyOn(mgr, 'clearBusy').mockImplementation(() => {
      calls.push('busy-clear');
    });
    vi.spyOn(mgr, 'showToast').mockImplementation((_content?: string, options?: any) => {
      calls.push(`toast:${options?.category ?? 'none'}`);
    });

    const result = await mgr.startPurpose({
      kind: 'workflow.waiting',
      reason: '等待工作流完成',
      source: 'app-event',
      presetId: 'workflow.waiting',
      priority: 65,
      correlationId: 'workflow-run-42',
      context: {
        workflowRunId: 'run-42',
        workflowName: '转录音频',
        workflowId: 'sample:transcribe',
        resourceId: 'resource-audio'
      }
    });

    expect(result.accepted).toBe(true);
    await waitFor(() => getPurposeWaiterEvents(mgr).includes('SPRITE_WORKFLOW_PROGRESS'));

    const progressMatched = mgr.emitPurposeEvent({
      source: 'app-event',
      event: 'SPRITE_WORKFLOW_PROGRESS',
      payload: {
        runId: 'run-42',
        workflowRunId: 'run-42',
        workflowId: 'sample:transcribe',
        progress: 42,
        message: '转录中'
      }
    });

    expect(progressMatched.matched).toBe(1);
    await waitFor(() => mgr.getPurposeSnapshot().current?.kind === 'idle.presence');
    expect(calls).toEqual([
      'busy-start:0:正在处理：转录音频',
      'busy-update:42:转录中',
      'complete-matched:1',
      'busy-clear',
      'play:success',
      'toast:success',
      'walk:corner'
    ]);

    const history = await mgr.listPurposeHistory({ kind: 'workflow.waiting', limit: 80 });
    expect(history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: 'step:completed', stepId: 'wait-workflow-progress', status: 'completed' }),
        expect.objectContaining({ eventType: 'step:completed', stepId: 'busy-progress', status: 'completed' }),
        expect.objectContaining({ eventType: 'step:completed', stepId: 'wait-workflow-terminal', status: 'completed' }),
        expect.objectContaining({ eventType: 'purpose:completed', purposeId: result.purpose.id, status: 'completed' })
      ])
    );
  });
});
