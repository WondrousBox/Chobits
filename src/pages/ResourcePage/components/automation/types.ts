export interface AutomationRule {
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

export interface WorkflowDefinition {
  id: string;
  name: string;
}
