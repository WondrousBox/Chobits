import React, { useState } from 'react';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { AutomationRuleForm } from './AutomationRuleForm';
import type { AutomationRule, WorkflowDefinition } from './types';

interface AutomationRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: Partial<AutomationRule> | null;
  workflows: WorkflowDefinition[];
  currentWorkspaceId?: string;
  currentFolderId?: string;
  onSave: (rule: Partial<AutomationRule>) => Promise<void>;
}

export const AutomationRuleDialog: React.FC<AutomationRuleDialogProps> = ({ open, onOpenChange, rule, workflows, currentWorkspaceId, currentFolderId, onSave }) => {
  const [editingRule, setEditingRule] = useState<Partial<AutomationRule> | null>(rule);

  // 当 rule prop 变化时，更新本地状态
  React.useEffect(() => {
    setEditingRule(rule);
  }, [rule]);

  const handleSave = async (): Promise<void> => {
    if (!editingRule) return;
    await onSave(editingRule);
    onOpenChange(false);
  };

  if (!editingRule) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>{rule?.id ? '编辑自动化规则' : '新增自动化规则'}</DialogTitle>
          <DialogDescription></DialogDescription>
        </DialogHeader>

        <AutomationRuleForm rule={editingRule} workflows={workflows} currentWorkspaceId={currentWorkspaceId} currentFolderId={currentFolderId} onRuleChange={setEditingRule} onSave={handleSave} />
      </DialogContent>
    </Dialog>
  );
};
