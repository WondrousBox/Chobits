import { defineCapability } from '@chobits/workflow/sdk';

import type { recognizeWithPaddleOcr } from '../../../ocr/paddle-ocr-runtime';

export interface WorkflowIntegrationOcrCapability {
  recognizeWithPaddleOcr: typeof recognizeWithPaddleOcr;
}

export const WORKFLOW_OCR = defineCapability<WorkflowIntegrationOcrCapability>('workflow.integration.ocr', {
  description: 'Execute host application local OCR runtimes'
});
