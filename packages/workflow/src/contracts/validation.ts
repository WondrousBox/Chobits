import type { WorkflowValidationIssue } from './errors.js';

export type WorkflowMissingModel = {
  pluginId: string;
  modelName: string;
  resourceId?: string;
  displayName?: string;
};

export type WorkflowValidationResult = {
  ok: boolean;
  errors?: string[];
  issues?: WorkflowValidationIssue[];
  missingCapabilities?: WorkflowMissingCapability[];
  missingPlugins?: { id: string; hint?: string }[];
  missingModels?: WorkflowMissingModel[];
};

export type WorkflowMissingCapability = {
  id: string;
  nodeIds: string[];
};

export type MissingModel = WorkflowMissingModel;
export type ValidateResult = WorkflowValidationResult;
