import React, { useEffect, useState } from 'react';
import { TbCheck, TbChevronRight } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

import type { AutomationRule, WorkflowDefinition } from './types';

interface AutomationRuleFormProps {
  rule: Partial<AutomationRule>;
  workflows: WorkflowDefinition[];
  currentWorkspaceId?: string;
  currentFolderId?: string;
  onRuleChange: (rule: Partial<AutomationRule>) => void;
  onSave: () => void;
}

export const AutomationRuleForm: React.FC<AutomationRuleFormProps> = ({ rule, workflows, currentWorkspaceId, currentFolderId, onRuleChange, onSave }) => {
  const [currentStep, setCurrentStep] = useState(0);

  // 当规则 ID 变化时，重置步骤到第一步
  useEffect(() => {
    setTimeout(() => {
      setCurrentStep(0);
    }, 0);
  }, [rule.id]);

  // Helper to get workflow ID from action config
  const getWorkflowId = (rule: Partial<AutomationRule>): string | undefined => {
    return rule.actionConfig?.workflowId;
  };

  // Helper to set workflow ID to action config
  const setWorkflowId = (workflowId: string): void => {
    onRuleChange({
      ...rule,
      actionConfig: { ...rule.actionConfig, workflowId }
    });
  };

  // Helper to get resource type from trigger config
  const getResourceType = (rule: Partial<AutomationRule>): string => {
    return rule.triggerConfig?.resourceType || 'all';
  };

  // Helper to set resource type
  const setResourceType = (resourceType: string): void => {
    onRuleChange({
      ...rule,
      triggerConfig: { ...rule.triggerConfig, resourceType }
    });
  };

  // Helper to get event from trigger config
  const getEvent = (rule: Partial<AutomationRule>): string => {
    return rule.triggerConfig?.event || 'created';
  };

  // Helper to set event
  const setEvent = (event: string): void => {
    onRuleChange({
      ...rule,
      triggerConfig: { ...rule.triggerConfig, event }
    });
  };

  // Helper to get scope type (global, workspace, folder)
  const getScopeType = (rule: Partial<AutomationRule>): 'global' | 'workspace' | 'folder' => {
    if (rule.scope === 'global') return 'global';
    if (rule.triggerConfig?.folderId) return 'folder';
    return 'workspace';
  };

  // Helper to set scope type
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

  // 验证当前步骤是否完成
  const isStepValid = (step: number): boolean => {
    if (!rule) return false;

    switch (step) {
      case 0: // 设置范围
        return true;
      case 1: // 设置触发器
        return !!rule.scope && !!getResourceType(rule);
      case 2: // 执行动作
        if (!rule.triggerType) return false;
        if (rule.triggerType === 'resource_event') {
          return !!getEvent(rule);
        }
        if (rule.triggerType === 'schedule') {
          return !!rule.triggerConfig?.cron;
        }
        if (rule.triggerType === 'system_event') {
          return !!rule.triggerConfig?.event;
        }
        return true; // manual
      case 3: // 执行动作
        if (rule.actionType === 'workflow') {
          return !!getWorkflowId(rule);
        }
        return !!rule.actionType;
      default:
        return false;
    }
  };

  const handleNext = (): void => {
    if (currentStep < 2 && isStepValid(currentStep)) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = (): void => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleStepClick = (step: number): void => {
    // 可以点击：当前步骤、已完成的步骤、或者下一步（如果当前步骤已完成）
    if (step === currentStep) {
      return; // 当前步骤，无需切换
    }
    if (step < currentStep) {
      // 返回之前的步骤，总是允许
      setCurrentStep(step);
      return;
    }
    if (step === currentStep + 1 && isStepValid(currentStep)) {
      // 前进到下一步，需要当前步骤验证通过
      setCurrentStep(step);
    }
  };

  return (
    <div className="space-y-6">
      <Input placeholder="请输入规则名称" value={rule.name || ''} onChange={(e) => onRuleChange({ ...rule, name: e.target.value })} />

      {/* 步骤条 */}
      <div className="flex items-center justify-between pt-6">
        {[
          { label: '设置范围', step: 0 },
          { label: '设置触发器', step: 1 },
          { label: '执行动作', step: 2 }
        ].map((item, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isValid = isStepValid(index);
          const canClick = index <= currentStep || (index === currentStep + 1 && isValid);

          return (
            <React.Fragment key={item.step}>
              <div className="flex items-center flex-1">
                <button
                  type="button"
                  onClick={() => handleStepClick(item.step)}
                  className={cn('flex items-center gap-2 transition-colors', !canClick && 'cursor-not-allowed opacity-50', canClick && !isCurrent && 'cursor-pointer hover:opacity-80')}
                  disabled={!canClick}
                >
                  <div
                    className={cn(
                      'flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors',
                      isCurrent && 'border-primary bg-primary text-primary-foreground',
                      isCompleted && 'border-primary bg-primary text-primary-foreground',
                      !isCurrent && !isCompleted && isValid && 'border-primary/50 bg-primary/10 text-primary',
                      !isCurrent && !isCompleted && !isValid && 'border-muted-foreground/30 bg-muted text-muted-foreground'
                    )}
                  >
                    {isCompleted ? <TbCheck className="w-4 h-4" /> : <span className="text-sm font-medium">{item.step + 1}</span>}
                  </div>
                  <span
                    className={cn(
                      'text-sm font-medium transition-colors',
                      isCurrent && 'text-foreground',
                      isCompleted && 'text-primary',
                      !isCurrent && !isCompleted && isValid && 'text-primary/70',
                      !isCurrent && !isCompleted && !isValid && 'text-muted-foreground'
                    )}
                  >
                    {item.label}
                  </span>
                </button>
              </div>
              {index < 2 && (
                <div className="flex-1 mx-4">
                  <div className={cn('h-0.5 transition-colors', isCompleted ? 'bg-primary' : 'bg-muted')} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* 步骤内容 */}
      <div className="min-h-[200px]">
        {currentStep === 0 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>生效范围</Label>
              <Select value={getScopeType(rule)} onValueChange={(v) => setScopeType(v as any)}>
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
          </div>
        )}

        {currentStep === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>触发类型</Label>
              <Select value={rule.triggerType} onValueChange={(v) => onRuleChange({ ...rule, triggerType: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="resource_event">资源事件</SelectItem>
                  <SelectItem value="schedule">定时任务</SelectItem>
                  <SelectItem value="system_event">系统事件</SelectItem>
                  <SelectItem value="manual">手动触发</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {rule.triggerType === 'resource_event' && (
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
            )}
            {rule.triggerType === 'manual' && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">该规则需要手动点击执行按钮触发。</p>
              </div>
            )}
            {rule.triggerType === 'system_event' && (
              <div className="space-y-2">
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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="app_started">应用启动</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {rule.triggerType === 'schedule' && (
              <div className="space-y-2">
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
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>设置动作</Label>
              <Select value={rule.actionType} onValueChange={(v) => onRuleChange({ ...rule, actionType: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="workflow">执行工作流</SelectItem>
                  {/* Future: Script, Notification */}
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
        )}
      </div>

      {/* 步骤导航按钮 */}
      <div className="flex justify-between pt-4 border-t">
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={currentStep === 0} onClick={handlePrev}>
            上一步
          </Button>
        </div>
        <div className="flex gap-2">
          {currentStep < 2 ? (
            <Button size="sm" onClick={handleNext} disabled={!isStepValid(currentStep)}>
              下一步
              <TbChevronRight />
            </Button>
          ) : (
            <Button size={'sm'} onClick={onSave} disabled={!(isStepValid(0) && isStepValid(1) && isStepValid(2) && isStepValid(3)) || !rule?.name}>
              完成
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
