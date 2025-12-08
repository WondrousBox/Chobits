import schedule from 'node-schedule';

import { getWorkflow, runWorkflow } from '../../../packages/workflow';
import { AutomationRulesRepo } from '../db/repositories';
import { AutomationRuleRow } from '../db/schema';

const jobs = new Map<string, schedule.Job>();

export async function initScheduler(): Promise<void> {
  console.log('[Scheduler] Initializing...');
  const rules = await AutomationRulesRepo.list();
  const scheduleRules = rules.filter((r) => r.enabled && r.triggerType === 'schedule');

  console.log(`[Scheduler] Found ${scheduleRules.length} scheduled rules.`);

  for (const rule of scheduleRules) {
    scheduleRule(rule);
  }
}

export function scheduleRule(rule: AutomationRuleRow): void {
  if (!rule.enabled || rule.triggerType !== 'schedule') return;

  const config = rule.triggerConfig as any;
  if (!config || !config.cron) {
    console.warn(`[Scheduler] Rule ${rule.id} has no cron config.`);
    return;
  }

  // Cancel existing job if any (e.g. update)
  if (jobs.has(rule.id)) {
    jobs.get(rule.id)?.cancel();
  }

  try {
    const job = schedule.scheduleJob(config.cron, async () => {
      console.log(`[Scheduler] Triggering rule ${rule.name} (${rule.id})`);
      await executeRuleAction(rule);
    });

    if (job) {
      jobs.set(rule.id, job);
      console.log(`[Scheduler] Scheduled rule ${rule.name} with cron: ${config.cron}`);
    }
  } catch (error) {
    console.error(`[Scheduler] Failed to schedule rule ${rule.id}:`, error);
  }
}

export function unscheduleRule(ruleId: string): void {
  if (jobs.has(ruleId)) {
    jobs.get(ruleId)?.cancel();
    jobs.delete(ruleId);
    console.log(`[Scheduler] Unscheduled rule ${ruleId}`);
  }
}

async function executeRuleAction(rule: AutomationRuleRow): Promise<void> {
  if (rule.actionType === 'workflow') {
    const config = rule.actionConfig as any;
    if (!config || !config.workflowId) {
      console.warn(`[Scheduler] Rule ${rule.id} has no workflow config.`);
      return;
    }

    try {
      const workflow = await getWorkflow(config.workflowId);
      if (!workflow) {
        console.error(`[Scheduler] Workflow ${config.workflowId} not found for rule ${rule.id}`);
        return;
      }

      console.log(`[Scheduler] Running workflow ${workflow.name} for rule ${rule.id}`);
      // Scheduled tasks might not have a specific resource context, or we might need to define what inputs they get.
      // For now, we pass empty inputs or static inputs from config.
      const inputs = config.inputs || {};
      await runWorkflow(workflow, inputs);
    } catch (error) {
      console.error(`[Scheduler] Error executing workflow for rule ${rule.id}:`, error);
    }
  } else {
    console.warn(`[Scheduler] Unsupported action type ${rule.actionType} for rule ${rule.id}`);
  }
}
