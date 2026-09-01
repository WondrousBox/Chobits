import type { ExecutionContext } from '@chobits/workflow';
import { defineCapability } from '@chobits/workflow/sdk';

export interface WorkflowIntegrationLocalProcessingCapability {
  resolveContext(context: ExecutionContext): ExecutionContext;
}

export const WORKFLOW_LOCAL_PROCESSING = defineCapability<WorkflowIntegrationLocalProcessingCapability>('workflow.integration.local-processing', {
  description: 'Resolve host application plugin resources, local engines, and resource project directories'
});
