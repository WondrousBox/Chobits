import { createHash } from 'node:crypto';

import type { RecordAiUsageEventInput } from './types';

export function buildAiUsageEventFingerprint(
  input: Pick<RecordAiUsageEventInput, 'traceId' | 'requestId' | 'sourceType' | 'sourceId' | 'usageFeature' | 'usageStage' | 'operationKey' | 'attemptIndex' | 'providerId' | 'model'>
): string {
  const payload = JSON.stringify({
    attemptIndex: input.attemptIndex ?? 0,
    model: input.model,
    operationKey: input.operationKey,
    providerId: input.providerId,
    requestId: input.requestId,
    sourceId: input.sourceId,
    sourceType: input.sourceType,
    traceId: input.traceId,
    usageFeature: input.usageFeature,
    usageStage: input.usageStage
  });

  return createHash('sha256').update(payload).digest('hex');
}
