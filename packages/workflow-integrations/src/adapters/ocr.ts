import { recognizeWithPaddleOcr } from '../../../ocr/paddle-ocr-runtime';
import type { WorkflowIntegrationOcrCapability } from '../capabilities/ocr';

export function createWorkflowIntegrationOcrCapability(): WorkflowIntegrationOcrCapability {
  return { recognizeWithPaddleOcr };
}
