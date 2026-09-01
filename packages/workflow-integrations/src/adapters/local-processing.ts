import type { ExecutionContext } from '@chobits/workflow';

import type { WorkflowIntegrationLocalProcessingCapability } from '../capabilities/local-processing';

export type WorkflowIntegrationLocalProcessingPorts = Pick<ExecutionContext, 'ffmpegPath' | 'ffprobePath' | 'getResourceProjectDirs' | 'pluginResourceManager'>;

export function createWorkflowIntegrationLocalProcessingCapability(ports: WorkflowIntegrationLocalProcessingPorts): WorkflowIntegrationLocalProcessingCapability {
  return {
    resolveContext: (context) => ({ ...context, ...ports })
  };
}
