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
  /**
   * Optional pre-warm hook. Called at the start of chatStream, before
   * buildPiContext / resolve. Enrichers can use this to start async work
   * early (e.g., prefetch memory search) so the result is ready by the
   * time resolve() is called.
   *
   * This is fire-and-forget — exceptions are silently caught.
   */
  preWarm?: (ctx: SystemPromptEnricherContext) => void;
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
 * Enrichers are resolved in parallel for reduced latency.
 * Results are returned in registration order.
 */
export async function resolveSystemPromptEnrichments(request: ChatRequest): Promise<string[]> {
  const entries = [...enrichers.values()];
  console.log(`[SystemPromptEnricher] resolve: running ${entries.length} enrichers [${entries.map((e) => e.id).join(', ')}]`);
  const t0 = Date.now();
  const settled = await Promise.allSettled(entries.map((enricher) => enricher.resolve({ request })));
  const results: string[] = [];
  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    if (outcome.status === 'fulfilled') {
      const segment = outcome.value;
      if (typeof segment === 'string' && segment.trim()) {
        results.push(segment.trim());
      }
    } else {
      console.warn(`[SystemPromptEnricher] enricher "${entries[i].id}" rejected:`, outcome.reason);
    }
  }
  console.log(`[SystemPromptEnricher] resolve done in ${Date.now() - t0}ms: ${results.length} segments injected`);
  return results;
}

/**
 * Fire all registered enrichers' preWarm hooks.
 * Should be called at the start of chatStream, before preview / buildPiContext.
 * This gives enrichers a head start on async work (e.g., memory prefetch).
 */
export function preWarmEnrichers(request: ChatRequest): void {
  const ids = [...enrichers.keys()];
  console.log(`[SystemPromptEnricher] preWarm: ${ids.length} enrichers registered [${ids.join(', ')}]`);
  const ctx: SystemPromptEnricherContext = { request };
  for (const enricher of enrichers.values()) {
    if (enricher.preWarm) {
      try {
        enricher.preWarm(ctx);
      } catch {
        // Pre-warm failures are silently ignored
      }
    }
  }
}
