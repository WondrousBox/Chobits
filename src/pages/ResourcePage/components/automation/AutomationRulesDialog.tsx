import React, { useEffect, useState } from 'react';

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

import { AutomationRuleDialog } from './AutomationRuleDialog';
import { AutomationRulesList } from './AutomationRulesList';
import type { AutomationRule, WorkflowDefinition } from './types';

export const AutomationRulesDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentWorkspaceId?: string;
  currentFolderId?: string;
}> = ({ open, onOpenChange, currentWorkspaceId, currentFolderId }) => {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [editingRule, setEditingRule] = useState<Partial<AutomationRule> | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const loadRules = async (): Promise<void> => {
    const res = await window.ipcRenderer.invoke('automation:listRules');
    setRules(res);
  };

  const loadWorkflows = async (): Promise<void> => {
    const res = await window.ipcRenderer.invoke('wf:listDefinitions');
    setWorkflows(res);
  };

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        loadRules();
        loadWorkflows();
      }, 0);
    }
  }, [open]);

  const handleSave = async (rule: Partial<AutomationRule>): Promise<void> => {
    if (!rule?.name || !rule.triggerType || !rule.actionType) return;

    // Ensure config objects are set
    const ruleToSave = {
      ...rule,
      triggerConfig: rule.triggerConfig || {},
      actionConfig: rule.actionConfig || {}
    };

    if (isEditing && rule.id) {
      await window.ipcRenderer.invoke('automation:updateRule', rule.id, ruleToSave);
    } else {
      await window.ipcRenderer.invoke('automation:createRule', ruleToSave);
    }
    setEditingRule(null);
    setIsEditing(false);
    setIsDialogOpen(false);
    loadRules();
  };

  const handleDelete = async (id: string): Promise<void> => {
    await window.ipcRenderer.invoke('automation:deleteRule', id);
    loadRules();
  };

  const handleToggleEnable = async (rule: AutomationRule): Promise<void> => {
    await window.ipcRenderer.invoke('automation:updateRule', rule.id, { enabled: rule.enabled ? 0 : 1 });
    loadRules();
  };

  const handleAddRule = (): void => {
    setEditingRule({
      enabled: 1,
      scope: 'workspace',
      triggerType: 'resource_event',
      triggerConfig: { resourceType: 'all', event: 'created' },
      actionType: 'workflow',
      actionConfig: {}
    });
    setIsEditing(false);
    setIsDialogOpen(true);
  };

  const handleEditRule = (rule: AutomationRule): void => {
    setEditingRule(rule);
    setIsEditing(true);
    setIsDialogOpen(true);
  };

  const handleDialogClose = (open: boolean): void => {
    setIsDialogOpen(open);
    if (!open) {
      setEditingRule(null);
      setIsEditing(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-[600px] sm:max-w-[600px] flex flex-col">
          <SheetHeader>
            <SheetTitle>自动化规则配置</SheetTitle>
            <SheetDescription>自动化规则配置，可用于自动化执行工作流，支持资源事件、定时任务、系统事件、手动触发</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-hidden mt-6">
            <AutomationRulesList rules={rules} workflows={workflows} onAddRule={handleAddRule} onEditRule={handleEditRule} onDeleteRule={handleDelete} onToggleEnable={handleToggleEnable} />
          </div>
        </SheetContent>
      </Sheet>

      <AutomationRuleDialog
        open={isDialogOpen}
        onOpenChange={handleDialogClose}
        rule={editingRule}
        workflows={workflows}
        currentWorkspaceId={currentWorkspaceId}
        currentFolderId={currentFolderId}
        onSave={handleSave}
      />
    </>
  );
};
