import { ipcMain } from 'electron';

import { eventManager } from '../../../../packages/event';
import { AppEvent } from '../../../../packages/event/events';
import { AutomationRulesRepo } from '../../db/repositories';
import { NewAutomationRule } from '../../db/schema';
import { runAutomationRule, scheduleRule, unscheduleRule } from '../scheduler';

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
    return runAutomationRule(rule, { type: 'manual' });
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
      await runAutomationRule(rule, { type: 'system_event', eventType });
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
      await runAutomationRule(rule, { type: 'resource_event', eventType, resource });
    } catch (error) {
      console.error(`[Automation] Error executing rule ${rule.id}:`, error);
    }
  }
}
