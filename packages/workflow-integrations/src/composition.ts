import { createWorkflowCapabilities, createWorkflowExecutionLimiter, type WorkflowCapabilities, type WorkflowExecutionGroupLimiter } from '@chobits/workflow/runtime';

import { WORKFLOW_AI, type WorkflowIntegrationAiCapability } from './capabilities/ai';
import { WORKFLOW_LOCAL_PROCESSING, type WorkflowIntegrationLocalProcessingCapability } from './capabilities/local-processing';
import { WORKFLOW_OCR, type WorkflowIntegrationOcrCapability } from './capabilities/ocr';
import { WORKFLOW_RENDERING, type WorkflowIntegrationRenderingCapability } from './capabilities/rendering';
import { WORKFLOW_RESOURCE_READ, WORKFLOW_RESOURCE_WRITE, type WorkflowIntegrationResourceReadCapability, type WorkflowIntegrationResourceWriteCapability } from './capabilities/resources';

export interface WorkflowIntegrationCapabilitySet {
  ai: WorkflowIntegrationAiCapability;
  localProcessing: WorkflowIntegrationLocalProcessingCapability;
  ocr: WorkflowIntegrationOcrCapability;
  rendering: WorkflowIntegrationRenderingCapability;
  resourceRead: WorkflowIntegrationResourceReadCapability;
  resourceWrite: WorkflowIntegrationResourceWriteCapability;
}

export const WORKFLOW_INTEGRATION_EXECUTION_GROUP_LIMITS = {
  groups: {
    'resource-io': 4,
    ai: 4,
    ffmpeg: 2,
    'local-asr': 1,
    ocr: 1,
    rendering: 2
  }
} as const;

export function createWorkflowIntegrationCapabilities(set: WorkflowIntegrationCapabilitySet): WorkflowCapabilities {
  return createWorkflowCapabilities()
    .provide(WORKFLOW_RESOURCE_READ, set.resourceRead)
    .provide(WORKFLOW_RESOURCE_WRITE, set.resourceWrite)
    .provide(WORKFLOW_AI, set.ai)
    .provide(WORKFLOW_LOCAL_PROCESSING, set.localProcessing)
    .provide(WORKFLOW_OCR, set.ocr)
    .provide(WORKFLOW_RENDERING, set.rendering);
}

export function createWorkflowIntegrationExecutionLimiter(): WorkflowExecutionGroupLimiter {
  return createWorkflowExecutionLimiter(WORKFLOW_INTEGRATION_EXECUTION_GROUP_LIMITS);
}
