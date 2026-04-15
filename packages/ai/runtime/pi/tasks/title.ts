import { normalizeGeneratedConversationTitle } from '../../../conversation-title';
import { getChatMessageUsage } from '../../../message-usage';
import { normalizeProviderPreset, resolveProviderPresetId } from '../../../provider-preset';
import type { ChatMessage, ChatRequest, ProviderScopedRequest, TokenUsage } from '../../../types';
import { PiExecutionService } from '../execution-service';
import { readProviderRequestId } from '../provider-request-id';

const TITLE_SYSTEM_PROMPT = '你是一个标题生成助手。请根据以下用户和AI的对话内容，生成一个简洁的对话标题（不超过20个字）。只输出标题本身，不要加引号、前缀或解释。';
let piExecutionService: PiExecutionService | undefined;

export interface GeneratePiConversationTitleOptions extends ProviderScopedRequest {
  assistantContent: string;
  maxLength?: number;
  model?: string;
  userContent: string;
}

export interface GeneratePiConversationTitleResult {
  model?: string;
  providerRequestId?: string;
  providerId?: string;
  rawUsage?: unknown;
  runtime?: string;
  title: string;
  usage?: TokenUsage;
}

function getPiExecutionService(): PiExecutionService {
  piExecutionService ||= new PiExecutionService();
  return piExecutionService;
}

export async function generatePiConversationTitle(options: GeneratePiConversationTitleOptions): Promise<GeneratePiConversationTitleResult> {
  const { assistantContent, maxLength = 30, model, providerId, userContent } = options;
  const providerPresetId = resolveProviderPresetId(options);
  const messages: ChatMessage[] = [
    { role: 'system', content: TITLE_SYSTEM_PROMPT },
    { role: 'user', content: `用户: ${userContent}\nAI: ${assistantContent.slice(0, 500)}` }
  ];

  const request: ChatRequest = normalizeProviderPreset({
    agentId: 'chat',
    extras: model
      ? {
          model
        }
      : undefined,
    maxTokens: 64,
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
    providerRequestId: readProviderRequestId(messageMetadata) ?? readProviderRequestId(responseMetadata),
    providerId: response.providerId || providerId,
    rawUsage: messageMetadata?.piRawUsage ?? responseMetadata?.rawUsage,
    runtime: typeof responseMetadata?.runtime === 'string' ? responseMetadata.runtime : 'pi',
    title: normalizeGeneratedConversationTitle(response.message?.content || '', maxLength),
    usage: response.usage || getChatMessageUsage(response.message)
  };
}
