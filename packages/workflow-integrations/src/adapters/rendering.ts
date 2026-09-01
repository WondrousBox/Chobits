import type { WorkflowIntegrationRenderingCapability } from '../capabilities/rendering';

export { renderWorkflowHtmlScreenshot } from './html-screenshot';

export function createWorkflowIntegrationRenderingCapability(capability: WorkflowIntegrationRenderingCapability): WorkflowIntegrationRenderingCapability {
  return capability;
}
