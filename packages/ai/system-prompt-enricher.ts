/**
 * System Prompt Enricher Registry
 *
 * Provides a generic extension point for external modules to inject
 * additional system prompt segments into AI conversations.
 *
 * This decouples the AI module from specific consumers — any module can
 * register an enricher without the AI module knowing about it.
 *
 * Usage:
 *   // External module (e.g. sprite-core) registers at startup:
 *   registerSystemPromptEnricher({
 *     id: 'character-persona',
 *     resolve: (ctx) => buildPersonaPrompt(ctx),
 *   });
 *
 *   // AI module calls enrichers when building system prompt:
 *   const segments = await resolveSystemPromptEnrichments(request);
 */

import type { ChatRequest } from './types';

export interface SystemPromptEnricherContext {
  /** The original chat request (includes agentId, extras, etc.) */
  request: ChatRequest;
}

export interface SystemPromptEnricher {
  /** Unique identifier for this enricher */
  id: string;
  /**
   * Resolve additional system prompt text.
   * Return null/undefined/empty to skip.
   * The enricher can inspect request.extras flags to decide whether to activate.
   */
  resolve: (ctx: SystemPromptEnricherContext) => string | null | undefined | Promise<string | null | undefined>;
}

const enrichers = new Map<string, SystemPromptEnricher>();

/** Register a system prompt enricher. Replaces any existing enricher with the same id. */
export function registerSystemPromptEnricher(enricher: SystemPromptEnricher): void {
  enrichers.set(enricher.id, enricher);
}

/** Unregister a system prompt enricher by id. */
export function unregisterSystemPromptEnricher(id: string): void {
  enrichers.delete(id);
}

/**
 * Resolve all registered enrichers and return their non-empty prompt segments.
 * Enrichers are called in registration order.
 */
export async function resolveSystemPromptEnrichments(request: ChatRequest): Promise<string[]> {
  const results: string[] = [];
  for (const enricher of enrichers.values()) {
    try {
      const segment = await enricher.resolve({ request });
      if (typeof segment === 'string' && segment.trim()) {
        results.push(segment.trim());
      }
    } catch {
      // Enricher failures are silently ignored to avoid breaking chat
    }
  }
  return results;
}
