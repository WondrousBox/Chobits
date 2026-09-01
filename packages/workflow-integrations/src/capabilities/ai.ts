import { defineCapability } from '@chobits/workflow/sdk';

import type {
  buildWorkflowAiUsageContext,
  executeWorkflowChatRequest,
  executeWorkflowImageGenerationRequest,
  executeWorkflowMusicGenerationRequest,
  executeWorkflowTextRequest,
  readImageAsRichContent
} from '../nodes/ai/ai-workflow-utils';

export interface WorkflowIntegrationAiCapability {
  buildUsageContext: typeof buildWorkflowAiUsageContext;
  executeChat: typeof executeWorkflowChatRequest;
  executeImageGeneration: typeof executeWorkflowImageGenerationRequest;
  executeMusicGeneration: typeof executeWorkflowMusicGenerationRequest;
  executeText: typeof executeWorkflowTextRequest;
  readImage: typeof readImageAsRichContent;
}

export const WORKFLOW_AI = defineCapability<WorkflowIntegrationAiCapability>('workflow.integration.ai', {
  description: 'Execute host application AI provider requests and usage tracking'
});
