import React, { useEffect, useState } from 'react';
import { TbEdit, TbPlus, TbTrash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface AutomationRule {
  id: string;
  name: string;
  description?: string;
  workspaceId?: string;
  scope: 'global' | 'workspace';
  triggerType: string;
  triggerConfig: any;
  actionType: string;
  actionConfig: any;
  enabled: number;
}

interface WorkflowDefinition {
  id: string;
  name: string;
}

export const AutomationRulesDialog: React.FC<{ open: boolean; onOpenChange: (open: boolean) => void }> = ({ open, onOpenChange }) => {
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

  // Helper to get workflow ID from action config
  const getWorkflowId = (rule: Partial<AutomationRule>): string | undefined => {
    return rule.actionConfig?.workflowId;
  };

  // Helper to set workflow ID to action config
  const setWorkflowId = (workflowId: string): void => {
    setEditingRule((prev) => ({
      ...prev,
      actionConfig: { ...prev?.actionConfig, workflowId }
    }));
  };

  // Helper to get resource type from trigger config
  const getResourceType = (rule: Partial<AutomationRule>): string => {
    return rule.triggerConfig?.resourceType || 'all';
  };

  // Helper to set resource type
  const setResourceType = (resourceType: string): void => {
    setEditingRule((prev) => ({
      ...prev,
      triggerConfig: { ...prev?.triggerConfig, resourceType }
    }));
  };

  // Helper to get event from trigger config
  const getEvent = (rule: Partial<AutomationRule>): string => {
    return rule.triggerConfig?.event || 'created';
  };

  // Helper to set event
  const setEvent = (event: string): void => {
    setEditingRule((prev) => ({
      ...prev,
      triggerConfig: { ...prev?.triggerConfig, event }
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>自动化规则配置</DialogTitle>
        </DialogHeader>

        {!editingRule ? (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setEditingRule({
                    enabled: 1,
                    scope: 'workspace',
                    triggerType: 'resource_event',
                    triggerConfig: { resourceType: 'all', event: 'created' },
                    actionType: 'workflow',
                    actionConfig: {}
                  });
                  setIsEditing(false);
                }}
              >
                <TbPlus className="mr-2" /> 新增规则
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>规则名称</TableHead>
                  <TableHead>触发类型</TableHead>
                  <TableHead>详情</TableHead>
                  <TableHead>执行动作</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>{rule.name}</TableCell>
                    <TableCell>{rule.triggerType === 'resource_event' ? '资源事件' : rule.triggerType}</TableCell>
                    <TableCell>
                      {rule.triggerType === 'resource_event' && (
                        <span className="text-xs text-muted-foreground">
                          {rule.triggerConfig?.resourceType === 'all' ? '任意资源' : rule.triggerConfig?.resourceType} {rule.triggerConfig?.event === 'created' ? '创建' : '更新'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{rule.actionType === 'workflow' && <span>工作流: {workflows.find((w) => w.id === rule.actionConfig?.workflowId)?.name || '未知'}</span>}</TableCell>
                    <TableCell>
                      <Switch checked={!!rule.enabled} onCheckedChange={() => handleToggleEnable(rule)} />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingRule(rule);
                            setIsEditing(true);
                          }}
                        >
                          <TbEdit />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(rule.id)}>
                          <TbTrash />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">规则名称</label>
                <Input value={editingRule.name || ''} onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">触发类型</label>
                <Select value={editingRule.triggerType} onValueChange={(v) => setEditingRule({ ...editingRule, triggerType: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="resource_event">资源事件</SelectItem>
                    {/* Future: Schedule, etc. */}
                  </SelectContent>
                </Select>
              </div>

              {editingRule.triggerType === 'resource_event' && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">资源类型</label>
                    <Select value={getResourceType(editingRule)} onValueChange={setResourceType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">所有类型</SelectItem>
                        <SelectItem value="video">视频</SelectItem>
                        <SelectItem value="image">图片</SelectItem>
                        <SelectItem value="audio">音频</SelectItem>
                        <SelectItem value="text">文本</SelectItem>
                        <SelectItem value="document">文档</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">触发事件</label>
                    <Select value={getEvent(editingRule)} onValueChange={setEvent}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="created">资源添加</SelectItem>
                        <SelectItem value="updated">资源更新</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">执行动作类型</label>
                <Select value={editingRule.actionType} onValueChange={(v) => setEditingRule({ ...editingRule, actionType: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="workflow">执行工作流</SelectItem>
                    {/* Future: Script, Notification */}
                  </SelectContent>
                </Select>
              </div>

              {editingRule.actionType === 'workflow' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">选择工作流</label>
                  <Select value={getWorkflowId(editingRule)} onValueChange={setWorkflowId}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择工作流" />
                    </SelectTrigger>
                    <SelectContent>
                      {workflows.map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingRule(null)}>
                取消
              </Button>
              <Button onClick={handleSave}>保存</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
