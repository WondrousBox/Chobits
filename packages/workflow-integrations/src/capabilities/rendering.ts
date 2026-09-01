import type { WorkflowHtmlScreenshotRenderer } from '@chobits/workflow';
import { defineCapability } from '@chobits/workflow/sdk';

export interface WorkflowIntegrationRenderingCapability {
  renderHtmlScreenshot: WorkflowHtmlScreenshotRenderer;
}

export const WORKFLOW_RENDERING = defineCapability<WorkflowIntegrationRenderingCapability>('workflow.integration.rendering', {
  description: 'Render host application workflow HTML content to local images'
});
