import Anthropic from '@anthropic-ai/sdk';

import { loadProviderModelsFromBank } from '../models-loader';
import { loadProviderSchema } from '../schema-loader';
import { ChatRequest, ChatResponse, EmbeddingRequest, EmbeddingResponse, ProviderAdapter, ProviderConfig, ProviderSecrets, StreamEvent } from '../types';

type AnthropicSecrets = { apiKey?: string; baseUrl?: string; model?: string };

export class AnthropicProvider implements ProviderAdapter {
  readonly id = 'anthropic';
  readonly label = 'Anthropic (Claude)';
  private secrets: AnthropicSecrets = {};

  isConfigured(): boolean {
    return !!this.secrets.apiKey;
  }
  getConfigSchema(): ProviderConfig {
    const fallback: ProviderConfig = {
      id: this.id,
      label: this.label,
      enabled: true,
      fields: [
        { key: 'apiKey', label: 'API Key', type: 'password', required: true },
        { key: 'baseUrl', label: 'Base URL (可选，自定义网关)', type: 'text' },
        { key: 'model', label: '默认模型（如 claude-3-5-sonnet-latest）', type: 'text' }
      ]
    };
    return loadProviderSchema(this.id, fallback);
  }
  setSecrets(secrets: ProviderSecrets) {
    this.secrets = { ...this.secrets, ...(secrets as any) };
  }
  getSecrets(): ProviderSecrets {
    return this.secrets;
  }

  private client() {
    const cfg: any = {};
    if (this.secrets.apiKey) cfg.apiKey = this.secrets.apiKey;
    if (this.secrets.baseUrl) cfg.baseURL = this.secrets.baseUrl;
    return new Anthropic(cfg);
  }

  async chat(req: ChatRequest, onStream?: (event: StreamEvent) => void, signal?: AbortSignal): Promise<ChatResponse> {
    const client = this.client();
    const model = (req.extras?.model as string) || this.secrets.model || 'claude-3-5-sonnet-latest';
    const messages = req.messages.map((m) => ({ role: m.role as any, content: m.content }));
    if (req.stream && onStream) {
      // Use streaming API; fall back if not available
      try {
        const stream: any = await (client as any).messages.create({ model, messages, stream: true }, { signal });
        let full = '';
        for await (const event of stream) {
          const delta = (event?.delta?.text || event?.content_block?.text) as string | undefined;
          if (delta) {
            full += delta;
            onStream({ type: 'delta', data: { text: delta } });
          }
        }
        onStream({ type: 'message_completed', data: { message: { role: 'assistant', content: full, createdAt: Date.now() } } });
        return { message: { role: 'assistant', content: full, createdAt: Date.now() }, providerId: this.id };
      } catch (e) {
        // fallback non-stream
      }
    }
    const resp: any = await (client as any).messages.create({ model, messages }, { signal });
    const text = resp?.content?.[0]?.text || resp?.content?.[0]?.content || resp?.output_text || '';
    return { message: { role: 'assistant', content: text, createdAt: Date.now() }, providerId: this.id };
  }

  async embed(_req: EmbeddingRequest): Promise<EmbeddingResponse> {
    throw new Error('Anthropic embeddings not supported via API');
  }

  async listModels() {
    const curated = await loadProviderModelsFromBank(this.id);
    if (curated.length) return curated;
    return [];
  }
}
