import { describe, expect, it } from 'vitest';

import { WORKFLOW_AI, WORKFLOW_LOCAL_PROCESSING, WORKFLOW_OCR, WORKFLOW_RENDERING, WORKFLOW_RESOURCE_READ, WORKFLOW_RESOURCE_WRITE } from '../packages/workflow-integrations/src/capabilities';
import {
  WORKFLOW_INTEGRATION_EXECUTION_GROUP_LIMITS,
  type WorkflowIntegrationCapabilitySet,
  createWorkflowIntegrationCapabilities,
  createWorkflowIntegrationExecutionLimiter
} from '../packages/workflow-integrations/src/composition';

describe('workflow integration composition', () => {
  it('provides every private capability through one resolver', () => {
    const marker = {};
    const capabilities = createWorkflowIntegrationCapabilities({
      ai: marker,
      localProcessing: marker,
      ocr: marker,
      rendering: marker,
      resourceRead: marker,
      resourceWrite: marker
    } as WorkflowIntegrationCapabilitySet);

    for (const token of [WORKFLOW_RESOURCE_READ, WORKFLOW_RESOURCE_WRITE, WORKFLOW_AI, WORKFLOW_LOCAL_PROCESSING, WORKFLOW_OCR, WORKFLOW_RENDERING]) {
      expect(capabilities.has(token)).toBe(true);
    }
  });

  it('applies integration execution limits across runs', async () => {
    expect(WORKFLOW_INTEGRATION_EXECUTION_GROUP_LIMITS.groups).toMatchObject({ ffmpeg: 2, 'local-asr': 1, ocr: 1 });
    const limiter = createWorkflowIntegrationExecutionLimiter();
    const first = await limiter.acquire('local-asr');
    let secondAcquired = false;
    const secondPromise = limiter.acquire('local-asr').then((lease) => {
      secondAcquired = true;
      return lease;
    });

    await Promise.resolve();
    expect(secondAcquired).toBe(false);
    await first.release();
    const second = await secondPromise;
    expect(secondAcquired).toBe(true);
    await second.release();
  });
});
