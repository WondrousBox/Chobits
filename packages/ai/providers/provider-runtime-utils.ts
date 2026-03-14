import { loadProviderModelsFromBank } from '../models-loader';
import type { ChatMessage, ChatResponse, StreamEvent } from '../types';

export function createAssistantMessage(content: string, createdAt = Date.now()): ChatMessage {
  return {
    role: 'assistant',
    content,
    createdAt
  };
}

export function finalizeStreamingTextResponse(providerId: string, text: string, onStream: (event: StreamEvent) => void): ChatResponse {
  const message = createAssistantMessage(text);
  onStream({ type: 'message_completed', data: { message } });
  return { message, providerId };
}

function dedupeModelEntries<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }

  return result;
}

export async function listProviderModelsFromCuratedOrFallback<T extends { id: string }>(options: {
  providerId: string;
  configuredModel?: string;
  defaultModel?: string;
  loadRemoteModels?: () => Promise<T[]>;
}): Promise<T[]> {
  const curated = await loadProviderModelsFromBank(options.providerId);
  if (curated.length) {
    return dedupeModelEntries(curated as T[]);
  }

  if (options.loadRemoteModels) {
    try {
      const remoteModels = await options.loadRemoteModels();
      if (remoteModels.length) {
        return dedupeModelEntries(remoteModels);
      }
    } catch {
      // Fall back to configured/default ids below.
    }
  }

  const fallbackIds = [options.configuredModel, options.defaultModel].filter(Boolean) as string[];
  return dedupeModelEntries(fallbackIds.map((id) => ({ id }) as T));
}
