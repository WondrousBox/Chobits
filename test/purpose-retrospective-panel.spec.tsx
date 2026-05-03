import { describe, expect, it } from 'vitest';

import { installMiniDom } from './utils/minidom';

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('PurposeRetrospectivePanel', () => {
  it('renders recent purpose retrospectives and empty state', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { default: PurposeRetrospectivePanel } = await import('../src/features/sprite-assistant/ui/PurposeRetrospectivePanel');
    const env = installMiniDom();
    const root = createRoot(env.container as any);

    await act(async () => {
      root.render(
        <PurposeRetrospectivePanel
          retrospective={{
            date: '2026-05-03',
            generatedAt: 1000,
            totalPurposeCount: 2,
            terminalPurposeCount: 2,
            completedCount: 1,
            cancelledCount: 0,
            failedCount: 1,
            kindCounts: { 'file.drop.intake': 1, 'workflow.waiting': 1 },
            memoryCandidateCount: 1,
            recallCues: ['- [event] Sprite purpose file.drop.intake completed'],
            items: [
              {
                purposeId: 'purpose-file',
                purposeKind: 'file.drop.intake',
                status: 'completed',
                source: 'user-event',
                priority: 100,
                startedAt: 100,
                endedAt: 1100,
                durationMs: 1000,
                summary: '用户把文件拖给角色处理',
                outcome: 'completed after 1000ms with 6 steps',
                stepCount: 6,
                completedStepIds: ['wait-menu-result'],
                failedStepIds: [],
                memoryWorthiness: 0.82,
                memoryCandidate: true,
                recallCue: '- [event] Sprite purpose file.drop.intake completed'
              },
              {
                purposeId: 'purpose-workflow',
                purposeKind: 'workflow.waiting',
                status: 'failed',
                source: 'app-event',
                priority: 65,
                startedAt: 200,
                endedAt: 4200,
                durationMs: 4000,
                summary: '等待工作流完成',
                outcome: 'failed after 4000ms with 3 steps',
                stepCount: 3,
                completedStepIds: [],
                failedStepIds: ['wait-workflow-terminal'],
                memoryWorthiness: 0.61,
                memoryCandidate: false
              }
            ]
          }}
        />
      );
      await flushPromises();
    });

    expect(env.container.textContent).toContain('今日目的');
    expect(env.container.textContent).toContain('文件处理');
    expect(env.container.textContent).toContain('完成');
    expect(env.container.textContent).toContain('任务等待');
    expect(env.container.textContent).toContain('失败');

    await act(async () => {
      root.render(
        <PurposeRetrospectivePanel
          retrospective={{
            date: '2026-05-03',
            generatedAt: 1000,
            totalPurposeCount: 0,
            terminalPurposeCount: 0,
            completedCount: 0,
            cancelledCount: 0,
            failedCount: 0,
            kindCounts: {},
            memoryCandidateCount: 0,
            recallCues: [],
            items: []
          }}
        />
      );
      await flushPromises();
    });

    expect(env.container.textContent).toContain('今天还没有需要复盘的目的');

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    env.cleanup();
  });
});
