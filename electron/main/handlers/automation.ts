import { ipcMain } from 'electron';

import { getWorkflow, runWorkflow } from '../../../packages/workflow';
import { AutomationRulesRepo } from '../db/repositories';
import { NewAutomationRule } from '../db/schema';
import { eventManager } from './event-manager';
import { AppEvent } from './events';
import { scheduleRule, unscheduleRule } from './scheduler';

export function initAutomationHandlers(): void {
  // IPC Handlers for Automation Rules
  ipcMain.handle('automation:listRules', async () => {
    return AutomationRulesRepo.list();
  });

  ipcMain.handle('automation:createRule', async (_event, rule: NewAutomationRule) => {
    const created = await AutomationRulesRepo.create(rule);
    scheduleRule(created);
    return created;
  });

  ipcMain.handle('automation:updateRule', async (_event, id: string, patch: Partial<NewAutomationRule>) => {
    const updated = await AutomationRulesRepo.update(id, patch);
    if (updated) {
      scheduleRule(updated);
    }
    return updated;
  });

  ipcMain.handle('automation:deleteRule', async (_event, id: string) => {
    await AutomationRulesRepo.delete(id);
    unscheduleRule(id);
  });

  ipcMain.handle('automation:triggerRule', async (_event, id: string) => {
    const rule = await AutomationRulesRepo.getById(id);
    if (!rule) return;

    console.log(`[Automation] Manually triggering rule ${rule.name} (${rule.id})`);
    if (rule.actionType === 'workflow') {
      const config = rule.actionConfig as any;
      if (!config || !config.workflowId) {
        console.warn(`[Automation] Invalid workflow config for rule ${rule.id}`);
        return;
      }

      const workflowDef = await getWorkflow(config.workflowId);
      if (!workflowDef) {
        console.warn(`[Automation] Workflow ${config.workflowId} not found for rule ${rule.id}`);
        return;
      }

      // Run workflow
      const inputs = { ...(config.inputs || {}), triggerType: 'manual' };
      await runWorkflow(workflowDef, inputs);
    }
  });

  // Event Listeners
  eventManager.on(AppEvent.RESOURCE_CREATED, async (resource: any) => {
    await handleResourceEvent(resource, 'resource_created');
  });

  eventManager.on(AppEvent.RESOURCE_UPDATED, async (resource: any) => {
    await handleResourceEvent(resource, 'resource_updated');
  });

  eventManager.on(AppEvent.APP_STARTED, async () => {
    await handleSystemEvent('app_started');
  });
}

async function handleSystemEvent(eventType: string): Promise<void> {
  const rules = await AutomationRulesRepo.findBySystemEvent(eventType);
  if (rules.length === 0) return;

  console.log(`[Automation] Found ${rules.length} rules for system event ${eventType}`);

  for (const rule of rules) {
    try {
      if (rule.actionType === 'workflow') {
        const config = rule.actionConfig as any;
        if (!config || !config.workflowId) {
          console.warn(`[Automation] Invalid workflow config for rule ${rule.id}`);
          continue;
        }

        const workflowDef = await getWorkflow(config.workflowId);
        if (!workflowDef) {
          console.warn(`[Automation] Workflow ${config.workflowId} not found for rule ${rule.id}`);
          continue;
        }

        console.log(`[Automation] Triggering workflow ${workflowDef.name} for system event ${eventType}`);

        // Run workflow
        const inputs = { ...(config.inputs || {}), eventType };
        await runWorkflow(workflowDef, inputs);
      }
    } catch (error) {
      console.error(`[Automation] Error executing rule ${rule.id}:`, error);
    }
  }
}

async function handleResourceEvent(resource: any, eventType: string): Promise<void> {
  if (!resource || !resource.type) return;

  // eventType is 'resource_created' or 'resource_updated'
  const rules = await AutomationRulesRepo.findByEvent(resource.type, eventType, resource.workspaceId, resource.folderId);
  if (rules.length === 0) return;

  console.log(`[Automation] Found ${rules.length} rules for ${eventType} on ${resource.type}`);

  for (const rule of rules) {
    try {
      if (rule.actionType === 'workflow') {
        const config = rule.actionConfig as any;
        if (!config || !config.workflowId) {
          console.warn(`[Automation] Invalid workflow config for rule ${rule.id}`);
          continue;
        }

        const workflowDef = await getWorkflow(config.workflowId);
        if (!workflowDef) {
          console.warn(`[Automation] Workflow ${config.workflowId} not found for rule ${rule.id}`);
          continue;
        }

        console.log(`[Automation] Triggering workflow ${workflowDef.name} for resource ${resource.id}`);

        // Run workflow
        // Pass inputs from config if any, plus resourceId
        const inputs = { ...(config.inputs || {}), resourceId: resource.id, resource };
        await runWorkflow(workflowDef, inputs);
      } else {
        console.warn(`[Automation] Unsupported action type ${rule.actionType} for rule ${rule.id}`);
      }
    } catch (error) {
      console.error(`[Automation] Error executing rule ${rule.id}:`, error);
    }
  }
}
