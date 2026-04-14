import { getChatMessageUsage } from '../../../message-usage';
import { normalizeProviderPreset, resolveProviderPresetId } from '../../../provider-preset';
import type { ChatMessage, ChatRequest, ProviderScopedRequest, TokenUsage } from '../../../types';
import { PiExecutionService } from '../execution-service';
import { buildTaggingUserPrompt, TAGGING_SYSTEM_PROMPT } from './tag-prompt';

let piExecutionService: PiExecutionService | undefined;

export interface GeneratePiTagsOptions extends ProviderScopedRequest {
  model?: string;
  segment: string;
}

export interface GeneratePiTagsResult {
  model?: string;
  providerId?: string;
  rawUsage?: unknown;
  runtime?: string;
  tags: string[];
  usage?: TokenUsage;
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

export async function generatePiTagsForSegment(options: GeneratePiTagsOptions): Promise<GeneratePiTagsResult> {
  const { model, providerId, segment } = options;
  const providerPresetId = resolveProviderPresetId(options);
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: TAGGING_SYSTEM_PROMPT
    },
    {
      role: 'user',
      content: buildTaggingUserPrompt(segment)
    }
  ];

  const request: ChatRequest = normalizeProviderPreset({
    agentId: 'chat',
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

  const response = await getPiExecutionService().chatEphemeral(request);
  const responseMetadata = response.metadata as Record<string, unknown> | undefined;
  const messageMetadata = response.message?.metadata as Record<string, unknown> | undefined;

  return {
    model: typeof responseMetadata?.model === 'string' ? responseMetadata.model : model,
    providerId: response.providerId || providerId,
    rawUsage: messageMetadata?.piRawUsage ?? responseMetadata?.rawUsage,
    runtime: typeof responseMetadata?.runtime === 'string' ? responseMetadata.runtime : 'pi',
    tags: parseTagListFromResponse(response.message?.content || '').slice(0, 5),
    usage: response.usage || getChatMessageUsage(response.message)
  };
}
