import React, { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { AutomationRuleForm } from './AutomationRuleForm';
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
      loadRules();
      loadWorkflows();
    }
  }, [open]);

  const handleSave = async (): Promise<void> => {
    if (!editingRule?.name || !editingRule.triggerType || !editingRule.actionType) return;

    // Ensure config objects are set
    const ruleToSave = {
      ...editingRule,
      triggerConfig: editingRule.triggerConfig || {},
      actionConfig: editingRule.actionConfig || {}
    };

    if (isEditing && editingRule.id) {
      await window.ipcRenderer.invoke('automation:updateRule', editingRule.id, ruleToSave);
    } else {
      await window.ipcRenderer.invoke('automation:createRule', ruleToSave);
    }
    setEditingRule(null);
    setIsEditing(false);
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
  };

  const handleEditRule = (rule: AutomationRule): void => {
    setEditingRule(rule);
    setIsEditing(true);
  };

  const handleCancel = (): void => {
    setEditingRule(null);
    setIsEditing(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>自动化规则配置</DialogTitle>
          <DialogDescription>自动化规则配置，可用于自动化执行工作流，支持资源事件、定时任务、系统事件、手动触发</DialogDescription>
        </DialogHeader>

        {!editingRule ? (
          <AutomationRulesList rules={rules} workflows={workflows} onAddRule={handleAddRule} onEditRule={handleEditRule} onDeleteRule={handleDelete} onToggleEnable={handleToggleEnable} />
        ) : (
          <>
            <AutomationRuleForm
              rule={editingRule}
              workflows={workflows}
              currentWorkspaceId={currentWorkspaceId}
              currentFolderId={currentFolderId}
              onRuleChange={setEditingRule}
              onSave={handleSave}
              onCancel={handleCancel}
            />
            <DialogFooter>
              <Button variant="outline" onClick={handleCancel}>
                取消
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
