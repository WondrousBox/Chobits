import { normalizeProviderPreset, resolveProviderPresetId } from '../../../provider-preset';
import type { ChatMessage, ChatRequest, ProviderScopedRequest } from '../../../types';
import { PiExecutionService } from '../execution-service';

const TITLE_SYSTEM_PROMPT = '你是一个标题生成助手。请根据以下用户和AI的对话内容，生成一个简洁的对话标题（不超过20个字）。只输出标题本身，不要加引号、前缀或解释。';
let piExecutionService: PiExecutionService | undefined;

export interface GeneratePiConversationTitleOptions extends ProviderScopedRequest {
  assistantContent: string;
  maxLength?: number;
  model?: string;
  userContent: string;
}

export function normalizeGeneratedConversationTitle(title: string, maxLength: number = 30): string {
  const normalized = (title || '').trim().replace(/^["'\u300c]|["'\u300d]$/g, '');
  if (!normalized) return '';
  return normalized.length > maxLength ? normalized.slice(0, maxLength) + '\u2026' : normalized;
}

function getPiExecutionService(): PiExecutionService {
  piExecutionService ||= new PiExecutionService();
  return piExecutionService;
}

export async function generatePiConversationTitle(options: GeneratePiConversationTitleOptions): Promise<string> {
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

  return normalizeGeneratedConversationTitle(await getPiExecutionService().completeText(request), maxLength);
}
