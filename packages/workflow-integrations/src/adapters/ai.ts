import type { WorkflowIntegrationAiCapability } from '../capabilities/ai';
import {
  buildWorkflowAiUsageContext,
  executeWorkflowChatRequest,
  executeWorkflowImageGenerationRequest,
  executeWorkflowMusicGenerationRequest,
  executeWorkflowTextRequest,
  readImageAsRichContent
} from '../nodes/ai/ai-workflow-utils';

export function createWorkflowIntegrationAiCapability(): WorkflowIntegrationAiCapability {
  return {
    buildUsageContext: buildWorkflowAiUsageContext,
    executeChat: executeWorkflowChatRequest,
    executeImageGeneration: executeWorkflowImageGenerationRequest,
    executeMusicGeneration: executeWorkflowMusicGenerationRequest,
    executeText: executeWorkflowTextRequest,
    readImage: readImageAsRichContent
  };
}
