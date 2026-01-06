import React, { useEffect, useState } from 'react';
import { TbArrowLeft } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { AutomationRuleForm } from './AutomationRuleForm';
import { AutomationRulesList } from './AutomationRulesList';
import type { AutomationRule, WorkflowDefinition } from './types';

// 视图模式：列表或表单
type ViewMode = 'list' | 'form';

export const AutomationRulesDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentWorkspaceId?: string;
  currentFolderId?: string;
}> = ({ open, onOpenChange, currentWorkspaceId, currentFolderId }) => {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [editingRule, setEditingRule] = useState<Partial<AutomationRule> | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
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

  // 弹窗关闭时重置视图到列表
  useEffect(() => {
    if (!open) {
      // 延迟重置，避免关闭动画时闪烁
      setTimeout(() => {
        setViewMode('list');
        setEditingRule(null);
        setIsEditing(false);
      }, 200);
    }
  }, [open]);

  const handleSave = async (): Promise<void> => {
    if (!editingRule?.name || !editingRule.triggerType || !editingRule.actionType) return;

    // 确保 config 对象存在
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
    // 保存成功后返回列表
    setEditingRule(null);
    setIsEditing(false);
    setViewMode('list');
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
    setViewMode('form');
  };

  const handleEditRule = (rule: AutomationRule): void => {
    setEditingRule(rule);
    setIsEditing(true);
    setViewMode('form');
  };

  // 返回列表视图
  const handleBackToList = (): void => {
    setViewMode('list');
    setEditingRule(null);
    setIsEditing(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl w-[800px] h-[600px] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          {viewMode === 'form' && (
            <Button variant="ghost" size="sm" className="w-fit -ml-2 mb-2" onClick={handleBackToList}>
              <TbArrowLeft className="mr-1" />
              返回列表
            </Button>
          )}
          <DialogTitle>{viewMode === 'list' ? '自动化规则配置' : isEditing ? '编辑自动化规则' : '新增自动化规则'}</DialogTitle>
          {viewMode === 'list' && <DialogDescription>配置自动化规则，当满足触发条件时自动执行指定动作</DialogDescription>}
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {viewMode === 'list' ? (
            <AutomationRulesList rules={rules} workflows={workflows} onAddRule={handleAddRule} onEditRule={handleEditRule} onDeleteRule={handleDelete} onToggleEnable={handleToggleEnable} />
          ) : (
            editingRule && (
              <AutomationRuleForm
                rule={editingRule}
                workflows={workflows}
                currentWorkspaceId={currentWorkspaceId}
                currentFolderId={currentFolderId}
                onRuleChange={setEditingRule}
                onSave={handleSave}
                onCancel={handleBackToList}
              />
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
