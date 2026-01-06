import React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import type { AutomationRule, WorkflowDefinition } from './types';

interface AutomationRuleFormProps {
  rule: Partial<AutomationRule>;
  workflows: WorkflowDefinition[];
  currentWorkspaceId?: string;
  currentFolderId?: string;
  onRuleChange: (rule: Partial<AutomationRule>) => void;
  onSave: () => void;
  onCancel?: () => void;
}

export const AutomationRuleForm: React.FC<AutomationRuleFormProps> = ({ rule, workflows, currentWorkspaceId, currentFolderId, onRuleChange, onSave, onCancel }) => {
  // 获取工作流 ID
  const getWorkflowId = (rule: Partial<AutomationRule>): string | undefined => {
    return rule.actionConfig?.workflowId;
  };

  // 设置工作流 ID
  const setWorkflowId = (workflowId: string): void => {
    onRuleChange({
      ...rule,
      actionConfig: { ...rule.actionConfig, workflowId }
    });
  };

  // 获取资源类型
  const getResourceType = (rule: Partial<AutomationRule>): string => {
    return rule.triggerConfig?.resourceType || 'all';
  };

  // 设置资源类型
  const setResourceType = (resourceType: string): void => {
    onRuleChange({
      ...rule,
      triggerConfig: { ...rule.triggerConfig, resourceType }
    });
  };

  // 获取触发事件
  const getEvent = (rule: Partial<AutomationRule>): string => {
    return rule.triggerConfig?.event || 'created';
  };

  // 设置触发事件
  const setEvent = (event: string): void => {
    onRuleChange({
      ...rule,
      triggerConfig: { ...rule.triggerConfig, event }
    });
  };

  // 获取生效范围类型
  const getScopeType = (rule: Partial<AutomationRule>): 'global' | 'workspace' | 'folder' => {
    if (rule.scope === 'global') return 'global';
    if (rule.triggerConfig?.folderId) return 'folder';
    return 'workspace';
  };

  // 设置生效范围类型
  const setScopeType = (type: 'global' | 'workspace' | 'folder'): void => {
    const newRule = { ...rule };
    if (type === 'global') {
      newRule.scope = 'global';
      newRule.workspaceId = undefined;
      if (newRule.triggerConfig) {
        const { folderId, ...rest } = newRule.triggerConfig;
        newRule.triggerConfig = rest;
      }
    } else if (type === 'workspace') {
      newRule.scope = 'workspace';
      newRule.workspaceId = currentWorkspaceId;
      if (newRule.triggerConfig) {
        const { folderId, ...rest } = newRule.triggerConfig;
        newRule.triggerConfig = rest;
      }
    } else if (type === 'folder') {
      newRule.scope = 'workspace';
      newRule.workspaceId = currentWorkspaceId;
      newRule.triggerConfig = { ...newRule.triggerConfig, folderId: currentFolderId };
    }
    onRuleChange(newRule);
  };

  // 验证表单是否可以保存
  const canSave = (): boolean => {
    if (!rule?.name) return false;
    if (!rule.triggerType) return false;

    // 验证触发配置
    if (rule.triggerType === 'resource_event') {
      if (!getResourceType(rule) || !getEvent(rule)) return false;
    }
    if (rule.triggerType === 'schedule') {
      if (!rule.triggerConfig?.cron) return false;
    }
    if (rule.triggerType === 'system_event') {
      if (!rule.triggerConfig?.event) return false;
    }

    // 验证动作配置
    if (rule.actionType === 'workflow') {
      if (!getWorkflowId(rule)) return false;
    }

    return true;
  };

  return (
    <div className="flex flex-col h-full">
      {/* 表单内容区域 */}
      <div className="flex-1 overflow-auto space-y-6">
        {/* 规则名称 */}
        <div className="space-y-2">
          <Label>规则名称</Label>
          <Input placeholder="请输入规则名称" value={rule.name || ''} onChange={(e) => onRuleChange({ ...rule, name: e.target.value })} />
        </div>

        {/* IF 触发条件卡片 */}
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 text-xs font-semibold">IF</span>
            <span>当满足以下条件时</span>
          </div>

          {/* 生效范围 + 触发类型 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>生效范围</Label>
              <Select value={getScopeType(rule)} onValueChange={(v) => setScopeType(v as 'global' | 'workspace' | 'folder')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">全局</SelectItem>
                  <SelectItem value="workspace" disabled={!currentWorkspaceId}>
                    当前空间
                  </SelectItem>
                  <SelectItem value="folder" disabled={!currentFolderId}>
                    当前文件夹
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>触发类型</Label>
              <Select value={rule.triggerType} onValueChange={(v) => onRuleChange({ ...rule, triggerType: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="选择触发类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="resource_event">资源事件</SelectItem>
                  <SelectItem value="schedule">定时任务</SelectItem>
                  <SelectItem value="system_event">系统事件</SelectItem>
                  <SelectItem value="manual">手动触发</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 资源事件配置 */}
          {rule.triggerType === 'resource_event' && (
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-dashed">
              <div className="space-y-2">
                <Label>资源类型</Label>
                <Select value={getResourceType(rule)} onValueChange={setResourceType}>
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
                <Label>触发事件</Label>
                <Select value={getEvent(rule)} onValueChange={setEvent}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created">资源添加</SelectItem>
                    <SelectItem value="updated">资源更新</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* 定时任务配置 */}
          {rule.triggerType === 'schedule' && (
            <div className="space-y-2 pt-2 border-t border-dashed">
              <Label>Cron 表达式</Label>
              <Input
                placeholder="* * * * *"
                value={rule.triggerConfig?.cron || ''}
                onChange={(e) =>
                  onRuleChange({
                    ...rule,
                    triggerConfig: { ...rule.triggerConfig, cron: e.target.value }
                  })
                }
              />
              <p className="text-xs text-muted-foreground">格式: [秒] 分 时 日 月 周 (例如: 0 0 * * * 每天零点; */30 * * * * * 每30秒)</p>
            </div>
          )}

          {/* 系统事件配置 */}
          {rule.triggerType === 'system_event' && (
            <div className="space-y-2 pt-2 border-t border-dashed">
              <Label>系统事件</Label>
              <Select
                value={rule.triggerConfig?.event || 'app_started'}
                onValueChange={(v) =>
                  onRuleChange({
                    ...rule,
                    triggerConfig: { ...rule.triggerConfig, event: v }
                  })
                }
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="app_started">应用启动</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* 手动触发提示 */}
          {rule.triggerType === 'manual' && (
            <div className="pt-2 border-t border-dashed">
              <p className="text-sm text-muted-foreground">ℹ️ 该规则需要手动点击执行按钮触发</p>
            </div>
          )}
        </div>

        {/* 连接箭头 */}
        <div className="flex justify-center">
          <div className="w-0.5 h-6 bg-border" />
        </div>

        {/* THEN 执行动作卡片 */}
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-xs font-semibold">THEN</span>
            <span>执行以下动作</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>动作类型</Label>
              <Select value={rule.actionType} onValueChange={(v) => onRuleChange({ ...rule, actionType: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="选择动作类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="workflow">执行工作流</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {rule.actionType === 'workflow' && (
              <div className="space-y-2">
                <Label>选择工作流</Label>
                <Select value={getWorkflowId(rule)} onValueChange={setWorkflowId}>
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
        </div>
      </div>

      {/* 底部按钮 */}
      <div className="flex justify-end gap-2 pt-4 border-t mt-4">
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
        )}
        <Button onClick={onSave} disabled={!canSave()}>
          保存
        </Button>
      </div>
    </div>
  );
};
