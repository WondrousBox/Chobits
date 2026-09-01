import { rmSync } from 'node:fs';

import type { WorkflowRuntimeFacade } from '@chobits/workflow/application';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const scheduleJobMock = vi.hoisted(() => vi.fn());
const listRulesMock = vi.hoisted(() => vi.fn());
const getWorkflowMock = vi.hoisted(() => vi.fn());
const runWorkflowMock = vi.hoisted(() => vi.fn());
const userDataDir = vi.hoisted(() => '/tmp/chobits-automation-scheduler-test');

vi.mock('electron', () => ({
  app: {
    getPath: () => userDataDir
  }
}));

vi.mock('node-schedule', () => ({
  default: {
    scheduleJob: scheduleJobMock
  }
}));

vi.mock('../electron/main/db/repositories', () => ({
  AutomationRulesRepo: {
    list: listRulesMock
  }
}));

function createRule(patch?: Record<string, unknown>): any {
  return {
    id: 'rule-1',
    name: 'Scheduled Workflow',
    enabled: 1,
    triggerType: 'schedule',
    triggerConfig: { cron: '* * * * *' },
    actionType: 'workflow',
    actionConfig: { workflowId: 'workflow-1' },
    workspaceId: 'workspace-1',
    ...patch
  };
}

function createWorkflowRuntime(): WorkflowRuntimeFacade {
  return {
    getDefinition: getWorkflowMock,
    runDefinition: runWorkflowMock
  } as unknown as WorkflowRuntimeFacade;
}

describe('automation scheduler', () => {
  beforeEach(() => {
    vi.resetModules();
    scheduleJobMock.mockReset();
    listRulesMock.mockReset();
    getWorkflowMock.mockReset();
    runWorkflowMock.mockReset();
    rmSync(userDataDir, { recursive: true, force: true });
  });

  it('cancels an existing cron job when a rule is disabled', async () => {
    const cancel = vi.fn();
    scheduleJobMock.mockReturnValue({ cancel });

    const { configureAutomationWorkflowRuntime, scheduleRule } = await import('../electron/main/handlers/scheduler');
    configureAutomationWorkflowRuntime(createWorkflowRuntime());

    scheduleRule(createRule());
    scheduleRule(createRule({ enabled: 0 }));

    expect(scheduleJobMock).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('cancels an existing cron job when a rule changes away from schedule', async () => {
    const cancel = vi.fn();
    scheduleJobMock.mockReturnValue({ cancel });

    const { scheduleRule } = await import('../electron/main/handlers/scheduler');

    scheduleRule(createRule());
    scheduleRule(createRule({ triggerType: 'resource_event', triggerConfig: { resourceType: 'all', event: 'created' } }));

    expect(scheduleJobMock).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('executes scheduled workflow rules through the shared automation executor', async () => {
    let scheduledCallback: ((fireDate: Date) => Promise<void>) | undefined;
    scheduleJobMock.mockImplementation((_spec, callback) => {
      scheduledCallback = callback;
      return {
        cancel: vi.fn(),
        nextInvocation: () => new Date('2026-05-05T09:05:00Z')
      };
    });
    const workflow = { id: 'workflow-1', name: 'Workflow One' };
    getWorkflowMock.mockResolvedValue(workflow);
    runWorkflowMock.mockResolvedValue({ runId: 'run-1', status: 'completed' });

    const { configureAutomationWorkflowRuntime, scheduleRule } = await import('../electron/main/handlers/scheduler');
    configureAutomationWorkflowRuntime(createWorkflowRuntime());

    scheduleRule(createRule({ actionConfig: { workflowId: 'workflow-1', inputs: { source: 'rule' } } }));
    await scheduledCallback?.(new Date('2026-05-05T09:05:00Z'));

    expect(getWorkflowMock).toHaveBeenCalledWith('workflow-1', 'workspace-1');
    expect(runWorkflowMock).toHaveBeenCalledWith(
      workflow,
      expect.objectContaining({
        source: 'rule',
        triggerType: 'schedule',
        scheduledFor: new Date('2026-05-05T09:05:00Z').getTime(),
        triggeredAt: expect.any(Number)
      }),
      { workspaceId: 'workspace-1' }
    );
  });

  it('executes manual, system, and resource rules through scheduler audit and control', async () => {
    const workflow = { id: 'workflow-1', name: 'Workflow One' };
    getWorkflowMock.mockResolvedValue(workflow);
    runWorkflowMock.mockResolvedValue({ runId: 'run-1', status: 'completed' });

    const { getMainSchedulerService } = await import('../electron/main/scheduler');
    const { configureAutomationWorkflowRuntime, getAutomationSchedulerSnapshot, runAutomationRule, scheduleRule } = await import('../electron/main/handlers/scheduler');
    configureAutomationWorkflowRuntime(createWorkflowRuntime());

    const manualRule = createRule({
      id: 'manual-rule',
      name: 'Manual Workflow',
      triggerType: 'manual',
      triggerConfig: null,
      actionConfig: { workflowId: 'workflow-1', inputs: { source: 'manual' } }
    });
    const systemRule = createRule({
      id: 'system-rule',
      name: 'System Workflow',
      triggerType: 'system_event',
      triggerConfig: { event: 'app_started' },
      actionConfig: { workflowId: 'workflow-1', inputs: { source: 'system' } }
    });
    const resourceRule = createRule({
      id: 'resource-rule',
      name: 'Resource Workflow',
      triggerType: 'resource_event',
      triggerConfig: { resourceType: 'video', event: 'created' },
      actionConfig: { workflowId: 'workflow-1', inputs: { source: 'resource' } }
    });

    scheduleRule(manualRule);
    scheduleRule(systemRule);
    scheduleRule(resourceRule);

    await expect(runAutomationRule(manualRule, { type: 'manual' })).resolves.toEqual({ ok: true });
    await expect(runAutomationRule(systemRule, { type: 'system_event', eventType: 'app_started' })).resolves.toEqual({ ok: true });
    await expect(runAutomationRule(resourceRule, { type: 'resource_event', eventType: 'resource_created', resource: { id: 'res-1', type: 'video' } })).resolves.toEqual({ ok: true });

    expect(runWorkflowMock).toHaveBeenNthCalledWith(
      1,
      workflow,
      expect.objectContaining({
        source: 'manual',
        triggerType: 'manual'
      }),
      { workspaceId: 'workspace-1' }
    );
    expect(runWorkflowMock).toHaveBeenNthCalledWith(
      2,
      workflow,
      expect.objectContaining({
        source: 'system',
        triggerType: 'system_event',
        eventType: 'app_started'
      }),
      { workspaceId: 'workspace-1' }
    );
    expect(runWorkflowMock).toHaveBeenNthCalledWith(
      3,
      workflow,
      expect.objectContaining({
        source: 'resource',
        triggerType: 'resource_event',
        eventType: 'resource_created',
        resourceId: 'res-1'
      }),
      { workspaceId: 'workspace-1' }
    );

    expect(
      getAutomationSchedulerSnapshot()
        .map((job) => ({ id: job.definition.id, active: job.active, schedule: job.definition.schedule }))
        .sort((a, b) => a.id.localeCompare(b.id))
    ).toEqual([
      { id: 'automation:manual-rule', active: false, schedule: { kind: 'manual' } },
      { id: 'automation:resource-rule', active: false, schedule: { kind: 'event', eventType: 'resource_created' } },
      { id: 'automation:system-rule', active: false, schedule: { kind: 'event', eventType: 'app_started' } }
    ]);

    expect(getMainSchedulerService().listAuditLog({ owner: 'automation', limit: 5 })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ jobId: 'automation:manual-rule', status: 'success', trigger: 'manual' }),
        expect.objectContaining({ jobId: 'automation:system-rule', status: 'success', trigger: 'event' }),
        expect.objectContaining({ jobId: 'automation:resource-rule', status: 'success', trigger: 'event' })
      ])
    );
  });

  it('reports a failed workflow run as an automation failure', async () => {
    const workflow = { id: 'workflow-1', name: 'Workflow One' };
    getWorkflowMock.mockResolvedValue(workflow);
    runWorkflowMock.mockResolvedValue({ runId: 'run-1', status: 'failed', error: 'node failed' });

    const { executeAutomationRule } = await import('../electron/main/handlers/scheduler');

    await expect(executeAutomationRule(createRule(), { type: 'manual' }, createWorkflowRuntime())).resolves.toEqual({
      ok: false,
      reason: 'node failed'
    });
  });

  it('maps a canceled workflow run to a scheduler cancellation reason', async () => {
    getWorkflowMock.mockResolvedValue({ id: 'workflow-1', name: 'Workflow One' });
    runWorkflowMock.mockResolvedValue({ runId: 'run-1', status: 'canceled' });
    const { executeAutomationRule } = await import('../electron/main/handlers/scheduler');

    await expect(executeAutomationRule(createRule(), { type: 'manual' }, createWorkflowRuntime())).resolves.toEqual({
      ok: false,
      reason: 'workflow-canceled'
    });
  });
});
