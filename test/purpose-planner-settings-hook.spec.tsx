import { describe, expect, it, vi } from 'vitest';

import { installMiniDom } from './utils/minidom';

describe('usePurposePlannerSettings', () => {
  it('loads planner preferences/status and persists preference updates', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');

    const env = installMiniDom();
    const getPurposePlannerPreferences = vi.fn(async () => ({ enabled: false, historyLimit: 20 }));
    const getPurposePlannerStatus = vi.fn(async () => ({
      enabled: false,
      historyLimit: 20,
      hasExecutor: true,
      lastResult: {
        status: 'disabled' as const,
        timestamp: 1700000000000,
        reason: 'planner-disabled'
      }
    }));
    const updatePurposePlannerPreferences = vi.fn(async (patch: { enabled?: boolean; historyLimit?: number }) => ({
      enabled: patch.enabled ?? true,
      historyLimit: patch.historyLimit ?? 20
    }));
    const listPurposeHistory = vi.fn(async () => [
      {
        timestamp: 1700000002000,
        eventType: 'planner:planned' as const,
        purposeId: 'purpose-1',
        purposeKind: 'file.drop.intake',
        status: 'planned'
      }
    ]);
    const startPurpose = vi.fn(async (request: any) => ({
      accepted: true,
      status: 'started',
      purpose: {
        id: 'purpose-smoke',
        kind: request.kind,
        title: request.title,
        reason: request.reason,
        source: request.source,
        status: 'active',
        priority: request.priority,
        interruptPolicy: request.interruptPolicy,
        presetId: request.presetId
      }
    }));

    (env.window as any).YUA = {
      sprite: {
        getPurposePlannerPreferences,
        getPurposePlannerStatus,
        updatePurposePlannerPreferences,
        listPurposeHistory,
        startPurpose
      }
    };

    const { usePurposePlannerSettings } = await import('../src/pages/ExtensionSettings/usePurposePlannerSettings');

    let current: ReturnType<typeof usePurposePlannerSettings> | null = null;

    function Probe(): JSX.Element {
      current = usePurposePlannerSettings();
      return (
        <div
          data-loading={current.loading ? 'yes' : 'no'}
          data-enabled={String(current.preferences.enabled)}
          data-limit={String(current.preferences.historyLimit)}
          data-executor={String(current.status?.hasExecutor ?? false)}
          data-history={String(current.history.length)}
          data-smoke={current.lastSmokeResult?.status ?? 'none'}
        />
      );
    }

    const root = createRoot(env.container as any);

    await act(async () => {
      root.render(<Probe />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const probe = env.container.firstChild as any;
    expect(getPurposePlannerPreferences).toHaveBeenCalledTimes(1);
    expect(getPurposePlannerStatus).toHaveBeenCalledTimes(1);
    expect(listPurposeHistory).toHaveBeenCalledWith({
      limit: 40,
      eventType: ['planner:planned', 'planner:fallback']
    });
    expect(probe.getAttribute('data-loading')).toBe('no');
    expect(probe.getAttribute('data-enabled')).toBe('false');
    expect(probe.getAttribute('data-limit')).toBe('20');
    expect(probe.getAttribute('data-executor')).toBe('true');
    expect(probe.getAttribute('data-history')).toBe('1');

    getPurposePlannerStatus.mockResolvedValueOnce({
      enabled: true,
      historyLimit: 37,
      hasExecutor: true,
      lastResult: {
        status: 'planned' as const,
        timestamp: 1700000001000,
        stepCount: 4,
        validationOk: true
      }
    });

    await act(async () => {
      await current?.updatePreferences({ enabled: true, historyLimit: 37 });
      await Promise.resolve();
    });

    expect(updatePurposePlannerPreferences).toHaveBeenCalledWith({ enabled: true, historyLimit: 37 });
    expect(probe.getAttribute('data-enabled')).toBe('true');
    expect(probe.getAttribute('data-limit')).toBe('37');

    await act(async () => {
      await current?.runSmokeTest();
      await Promise.resolve();
    });

    expect(startPurpose).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'daily.care.reminder',
        title: '目的规划器试跑',
        source: 'manual',
        presetId: 'daily.care.reminder',
        priority: 52,
        interruptPolicy: 'interruptible',
        context: expect.objectContaining({
          routineKind: 'plannerSmokeTest',
          source: 'purpose-planner-settings',
          manual: true
        })
      })
    );
    expect(probe.getAttribute('data-smoke')).toBe('started');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    env.cleanup();
  });
});
