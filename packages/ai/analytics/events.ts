import { buildAiUsageEventFingerprint } from './fingerprint';
import type { RecordAiUsageEventInput } from './types';

export const AI_USAGE_OBSERVED_EVENT = 'ai.usage.observed';

export type AiUsageObservedEvent = {
  emittedAt: number;
  eventFingerprint: string;
  input: RecordAiUsageEventInput;
  producer?: string;
  type: typeof AI_USAGE_OBSERVED_EVENT;
};

export type AiUsageObservedEventListener = (event: AiUsageObservedEvent) => Promise<void> | void;
export type AiUsageObservedEventWriter = (event: AiUsageObservedEvent) => Promise<void> | void;

const listeners = new Set<AiUsageObservedEventListener>();
const writers = new Set<AiUsageObservedEventWriter>();

export function subscribeAiUsageObservedEvent(listener: AiUsageObservedEventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function registerAiUsageObservedEventWriter(writer: AiUsageObservedEventWriter): () => void {
  writers.add(writer);
  return () => {
    writers.delete(writer);
  };
}

export async function emitAiUsageObservedEvent(input: RecordAiUsageEventInput, options?: { producer?: string }): Promise<void> {
  if (!listeners.size && !writers.size) {
    return;
  }

  const event: AiUsageObservedEvent = {
    emittedAt: Date.now(),
    eventFingerprint: buildAiUsageEventFingerprint(input),
    input,
    producer: options?.producer,
    type: AI_USAGE_OBSERVED_EVENT
  };

  const writerResults = await Promise.allSettled(
    Array.from(writers).map(async (writer) => {
      await writer(event);
    })
  );

  for (const result of writerResults) {
    if (result.status === 'rejected') {
      console.warn('[ai][usage-events] Writer execution failed:', result.reason);
    }
  }

  if (!listeners.size) {
    return;
  }

  const results = await Promise.allSettled(
    Array.from(listeners).map(async (listener) => {
      await listener(event);
    })
  );

  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('[ai][usage-events] Listener execution failed:', result.reason);
    }
  }
}
