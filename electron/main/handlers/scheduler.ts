import type { WorkflowRuntimeFacade } from '@chobits/workflow/application';

import { AutomationRulesRepo } from '../db/repositories';
import { AutomationRuleRow } from '../db/schema';
import { getMainSchedulerService, type MainSchedulerService, type SchedulerJobDefinition, type SchedulerRunContext, type SchedulerRunTrigger, type ScheduleSpec } from '../scheduler';

const AUTOMATION_OWNER = 'automation';
const automationScheduler = getMainSchedulerService();
let workflowRuntime: WorkflowRuntimeFacade | undefined;

export type AutomationRuleTrigger =
  | { type: 'schedule'; scheduledFor?: number; triggeredAt?: number }
  | { type: 'manual' }
  | { type: 'system_event'; eventType: string }
  | { type: 'resource_event'; eventType: string; resource: any };

export interface AutomationRuleExecutionResult {
  ok: boolean;
  reason?: string;
}

interface AutomationSchedulerPayload {
  rule: AutomationRuleRow;
  trigger?: AutomationRuleTrigger;
}

automationScheduler.registerHandler(AUTOMATION_OWNER, async (context: SchedulerRunContext<AutomationSchedulerPayload>) => {
  const result = await executeAutomationRule(
    context.payload?.rule,
    context.payload?.trigger ?? {
      type: 'schedule',
      scheduledFor: context.scheduledFor,
      triggeredAt: context.triggeredAt
    }
  );
  if (!result.ok) {
    return {
      status: 'failed' as const,
      reason: result.reason ?? 'automation-rule-execution-failed'
    };
  }
  return { status: 'success' as const };
});

export async function initScheduler(runtime: WorkflowRuntimeFacade): Promise<void> {
  workflowRuntime = runtime;
  console.log('[Scheduler] Initializing...');
  const rules = await AutomationRulesRepo.list();
  const enabledRules = rules.filter((r) => r.enabled);

  console.log(`[Scheduler] Found ${enabledRules.length} enabled automation rules.`);

  for (const rule of enabledRules) {
    scheduleRule(rule);
  }

  automationScheduler.start();
}

export function scheduleRule(rule: AutomationRuleRow): void {
  unscheduleRule(rule.id);

  if (!rule.enabled) return;

  const definition = buildAutomationSchedulerDefinition(rule);
  if (!definition) {
    return;
  }

  automationScheduler.start();
  const snapshot = automationScheduler.upsert<AutomationSchedulerPayload>(definition);

  if (snapshot.runtime.lastStatus === 'failed') {
    console.error(`[Scheduler] Failed to schedule rule ${rule.id}: ${snapshot.runtime.lastError ?? 'unknown error'}`);
    return;
  }

  if (definition.schedule.kind === 'cron') {
    console.log(`[Scheduler] Scheduled rule ${rule.name} with cron: ${definition.schedule.expression}`);
  } else {
    console.log(`[Scheduler] Registered ${definition.schedule.kind} rule ${rule.name}`);
  }
}

export function unscheduleRule(ruleId: string): void {
  if (automationScheduler.remove(buildAutomationSchedulerJobId(ruleId))) {
    console.log(`[Scheduler] Unscheduled rule ${ruleId}`);
  }
}

export async function executeAutomationRule(
  rule: AutomationRuleRow | undefined,
  trigger: AutomationRuleTrigger,
  runtime: WorkflowRuntimeFacade = getWorkflowRuntime()
): Promise<AutomationRuleExecutionResult> {
  if (!rule) {
    return { ok: false, reason: 'missing-rule' };
  }

  if (rule.actionType === 'workflow') {
    const config = rule.actionConfig as any;
    if (!config || !config.workflowId) {
      console.warn(`[Scheduler] Rule ${rule.id} has no workflow config.`);
      return { ok: false, reason: 'missing-workflow-config' };
    }

    try {
      const workflow = await runtime.getDefinition(config.workflowId, rule.workspaceId ?? undefined);
      if (!workflow) {
        console.error(`[Scheduler] Workflow ${config.workflowId} not found for rule ${rule.id}`);
        return { ok: false, reason: 'workflow-not-found' };
      }

      console.log(`[Scheduler] Running workflow ${workflow.name} for rule ${rule.id}`);
      const inputs = buildWorkflowInputs(config.inputs || {}, trigger);
      const record = await runtime.runDefinition(workflow, inputs, { workspaceId: rule.workspaceId ?? workflow.workspaceId });
      if (record.status !== 'completed') {
        console.error(`[Scheduler] Workflow ${workflow.id} finished with status ${record.status}: ${record.error ?? 'unknown error'}`);
        return {
          ok: false,
          reason: record.status === 'canceled' ? 'workflow-canceled' : record.error || 'workflow-execution-failed'
        };
      }
      return { ok: true };
    } catch (error) {
      console.error(`[Scheduler] Error executing workflow for rule ${rule.id}:`, error);
      return { ok: false, reason: 'workflow-execution-failed' };
    }
  } else {
    console.warn(`[Scheduler] Unsupported action type ${rule.actionType} for rule ${rule.id}`);
    return { ok: false, reason: 'unsupported-action-type' };
  }
}

export function configureAutomationWorkflowRuntime(runtime: WorkflowRuntimeFacade | undefined): void {
  workflowRuntime = runtime;
}

function getWorkflowRuntime(): WorkflowRuntimeFacade {
  if (!workflowRuntime) throw new Error('Workflow runtime is not initialized');
  return workflowRuntime;
}

export async function runAutomationRule(rule: AutomationRuleRow | undefined, trigger: AutomationRuleTrigger): Promise<AutomationRuleExecutionResult> {
  if (!rule) {
    return { ok: false, reason: 'missing-rule' };
  }

  const definition = buildAutomationSchedulerDefinition(rule, trigger);
  if (!definition) {
    return { ok: false, reason: 'unsupported-trigger' };
  }

  const state = await automationScheduler.runAdHoc<AutomationSchedulerPayload>(definition, {
    trigger: toSchedulerRunTrigger(trigger),
    scheduledFor: trigger.type === 'schedule' ? trigger.scheduledFor : undefined,
    payload: { rule, trigger }
  });

  if (state.lastStatus === 'success') {
    return { ok: true };
  }

  return {
    ok: false,
    reason: state.lastError ?? state.lastSkipReason ?? 'automation-rule-execution-failed'
  };
}

export function getAutomationSchedulerSnapshot(): ReturnType<MainSchedulerService['listJobs']> {
  return automationScheduler.listJobs();
}

function buildAutomationSchedulerJobId(ruleId: string): string {
  return `automation:${ruleId}`;
}

function buildAutomationSchedulerDefinition(rule: AutomationRuleRow, trigger?: AutomationRuleTrigger): SchedulerJobDefinition<AutomationSchedulerPayload> | null {
  const schedule = trigger ? buildAutomationScheduleForTrigger(rule, trigger) : buildAutomationScheduleForRule(rule);
  if (!schedule) {
    return null;
  }

  const jobId = buildAutomationSchedulerJobId(rule.id);
  return {
    id: jobId,
    owner: AUTOMATION_OWNER,
    name: rule.name,
    enabled: rule.enabled !== 0,
    schedule,
    payload: { rule },
    runPolicy: {
      singletonKey: jobId,
      maxConcurrent: 1,
      misfire: 'skip'
    }
  };
}

function buildAutomationScheduleForRule(rule: AutomationRuleRow): ScheduleSpec | null {
  if (rule.triggerType === 'schedule') {
    const config = rule.triggerConfig as any;
    if (!config || !config.cron) {
      console.warn(`[Scheduler] Rule ${rule.id} has no cron config.`);
      return null;
    }
    return {
      kind: 'cron',
      expression: config.cron
    };
  }

  if (rule.triggerType === 'manual') {
    return { kind: 'manual' };
  }

  if (rule.triggerType === 'system_event') {
    const config = rule.triggerConfig as any;
    return {
      kind: 'event',
      eventType: config?.event ?? 'system_event'
    };
  }

  if (rule.triggerType === 'resource_event') {
    const config = rule.triggerConfig as any;
    const eventType = config?.event ? `resource_${config.event}` : 'resource_event';
    return {
      kind: 'event',
      eventType
    };
  }

  return null;
}

function buildAutomationScheduleForTrigger(rule: AutomationRuleRow, trigger: AutomationRuleTrigger): ScheduleSpec {
  if (trigger.type === 'manual') {
    return { kind: 'manual' };
  }

  if (trigger.type === 'system_event') {
    return {
      kind: 'event',
      eventType: trigger.eventType
    };
  }

  if (trigger.type === 'resource_event') {
    return {
      kind: 'event',
      eventType: trigger.eventType
    };
  }

  return buildAutomationScheduleForRule(rule) ?? { kind: 'manual' };
}

function toSchedulerRunTrigger(trigger: AutomationRuleTrigger): SchedulerRunTrigger {
  if (trigger.type === 'manual') return 'manual';
  if (trigger.type === 'schedule') return 'scheduled';
  return 'event';
}

function buildWorkflowInputs(baseInputs: Record<string, unknown>, trigger: AutomationRuleTrigger): Record<string, unknown> {
  if (trigger.type === 'schedule') {
    return {
      ...baseInputs,
      triggerType: 'schedule',
      scheduledFor: trigger.scheduledFor,
      triggeredAt: trigger.triggeredAt
    };
  }

  if (trigger.type === 'manual') {
    return {
      ...baseInputs,
      triggerType: 'manual'
    };
  }

  if (trigger.type === 'system_event') {
    return {
      ...baseInputs,
      triggerType: 'system_event',
      eventType: trigger.eventType
    };
  }

  return {
    ...baseInputs,
    triggerType: 'resource_event',
    eventType: trigger.eventType,
    resourceId: trigger.resource?.id,
    resource: trigger.resource
  };
}
