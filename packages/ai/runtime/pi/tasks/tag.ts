import { normalizeProviderPreset, resolveProviderPresetId } from '../../../provider-preset';
import type { ChatMessage, ChatRequest, ProviderScopedRequest } from '../../../types';
import { PiExecutionService } from '../execution-service';

let piExecutionService: PiExecutionService | undefined;

export interface GeneratePiTagsOptions extends ProviderScopedRequest {
  model?: string;
  segment: string;
}

export function parseTagListFromResponse(txt: string): string[] {
  try {
    const json: any = JSON.parse(txt);
    if (Array.isArray(json)) {
      return json
        .map((value: any) => String(value))
        .map((value: string) => value.trim())
        .filter(Boolean);
    }

    if (json && Array.isArray(json.tags)) {
      return json.tags
        .map((value: any) => String(value))
        .map((value: string) => value.trim())
        .filter(Boolean);
    }
  } catch {
    // Ignore JSON parse errors and fall back to loose parsing.
  }

  return (txt || '')
    .split(/[\n,、，]/)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function getPiExecutionService(): PiExecutionService {
  piExecutionService ||= new PiExecutionService();
  return piExecutionService;
}

export async function generatePiTagsForSegment(options: GeneratePiTagsOptions): Promise<string[]> {
  const { model, providerId, segment } = options;
  const providerPresetId = resolveProviderPresetId(options);
  const messages: ChatMessage[] = [
    {
      role: 'user',
      content: `文本：\n${segment}`
    }
  ];

  const request: ChatRequest = normalizeProviderPreset({
    agentId: 'tagger',
    extras: model
      ? {
        model
      }
      : undefined,
    maxTokens: 256,
    messages,
    persist: false,
    providerId,
    providerPresetId,
    temperature: 0.2
  });

  return parseTagListFromResponse(await getPiExecutionService().completeText(request)).slice(0, 5);
}
