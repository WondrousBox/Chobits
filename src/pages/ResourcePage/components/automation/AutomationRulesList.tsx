import React from 'react';
import { TbEdit, TbPlus, TbTrash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import type { AutomationRule, WorkflowDefinition } from './types';

interface AutomationRulesListProps {
  rules: AutomationRule[];
  workflows: WorkflowDefinition[];
  onAddRule: () => void;
  onEditRule: (rule: AutomationRule) => void;
  onDeleteRule: (id: string) => void;
  onToggleEnable: (rule: AutomationRule) => void;
}

export const AutomationRulesList: React.FC<AutomationRulesListProps> = ({ rules, workflows, onAddRule, onEditRule, onDeleteRule, onToggleEnable }) => {
  return (
    <div className="space-y-4 h-96 overflow-auto">
      <div className="flex justify-end">
        <Button onClick={onAddRule}>
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
              <TableCell>
                {rule.triggerType === 'resource_event' ? '资源事件' : rule.triggerType === 'schedule' ? '定时任务' : rule.triggerType === 'system_event' ? '系统事件' : rule.triggerType}
              </TableCell>
              <TableCell>
                {rule.triggerType === 'resource_event' && (
                  <span className="text-xs text-muted-foreground">
                    {rule.triggerConfig?.resourceType === 'all' ? '任意资源' : rule.triggerConfig?.resourceType} {rule.triggerConfig?.event === 'created' ? '创建' : '更新'}
                  </span>
                )}
                {rule.triggerType === 'schedule' && <span className="text-xs text-muted-foreground">Cron: {rule.triggerConfig?.cron}</span>}
                {rule.triggerType === 'system_event' && (
                  <span className="text-xs text-muted-foreground">事件: {rule.triggerConfig?.event === 'app_started' ? '应用启动' : rule.triggerConfig?.event}</span>
                )}
              </TableCell>
              <TableCell>{rule.actionType === 'workflow' && <span>工作流: {workflows.find((w) => w.id === rule.actionConfig?.workflowId)?.name || '未知'}</span>}</TableCell>
              <TableCell>
                <Switch checked={!!rule.enabled} onCheckedChange={() => onToggleEnable(rule)} />
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => onEditRule(rule)}>
                    <TbEdit />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onDeleteRule(rule.id)}>
                    <TbTrash />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
