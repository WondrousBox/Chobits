import { ipcMain } from 'electron';

import { runWorkflow } from '../../../packages/workflow';
import { WorkflowStore } from '../../../packages/workflow/store';
import { AutomationRulesRepo } from '../db/repositories';
import { NewAutomationRule } from '../db/schema';
import { eventManager } from './event-manager';
import { AppEvent } from './events';

export function initAutomationHandlers(): void {
  // IPC Handlers for Automation Rules
  ipcMain.handle('automation:listRules', async () => {
    return AutomationRulesRepo.list();
  });

  ipcMain.handle('automation:createRule', async (_event, rule: NewAutomationRule) => {
    return AutomationRulesRepo.create(rule);
  });

  ipcMain.handle('automation:updateRule', async (_event, id: string, patch: Partial<NewAutomationRule>) => {
    return AutomationRulesRepo.update(id, patch);
  });

  ipcMain.handle('automation:deleteRule', async (_event, id: string) => {
    return AutomationRulesRepo.delete(id);
  });

  // Event Listeners
  eventManager.on(AppEvent.RESOURCE_CREATED, async (resource: any) => {
    await handleResourceEvent(resource, 'resource_created');
  });

  eventManager.on(AppEvent.RESOURCE_UPDATED, async (resource: any) => {
    await handleResourceEvent(resource, 'resource_updated');
  });
}

async function handleResourceEvent(resource: any, eventType: string): Promise<void> {
  if (!resource || !resource.type) return;

  // eventType is 'resource_created' or 'resource_updated'
  const rules = await AutomationRulesRepo.findByEvent(resource.type, eventType, resource.workspaceId);
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

        const workflowDef = await WorkflowStore.get(config.workflowId);
        if (!workflowDef) {
          console.warn(`[Automation] Workflow ${config.workflowId} not found for rule ${rule.id}`);
          continue;
        }

        console.log(`[Automation] Triggering workflow ${workflowDef.name} for resource ${resource.id}`);

        // Run workflow
        // Pass inputs from config if any, plus resourceId
        const inputs = { ...(config.inputs || {}), resourceId: resource.id };
        await runWorkflow(workflowDef, inputs);
      } else {
        console.warn(`[Automation] Unsupported action type ${rule.actionType} for rule ${rule.id}`);
      }
    } catch (error) {
      console.error(`[Automation] Error executing rule ${rule.id}:`, error);
    }
  }
}
