import OpenAI from 'openai';

import { loadProviderModels } from '../models-loader';
import { loadProviderSchema } from '../schema-loader';
import { ChatRequest, ChatResponse, EmbeddingRequest, EmbeddingResponse, ProviderAdapter, ProviderConfig, ProviderSecrets, StreamEvent } from '../types';

type OpenAISecrets = { apiKey?: string; baseUrl?: string; organization?: string; model?: string };

export class OpenAIProvider implements ProviderAdapter {
  readonly id = 'openai';
  readonly label = 'OpenAI';
  private secrets: OpenAISecrets = {};

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
        { key: 'model', label: '默认模型（如 gpt-4o-mini）', type: 'text' }
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

  private client(override?: Partial<OpenAISecrets>) {
    const cfg: any = {};
    const s = { ...this.secrets, ...(override || {}) };
    if (s.apiKey) cfg.apiKey = s.apiKey;
    if (s.baseUrl) cfg.baseURL = s.baseUrl;
    if ((s as any).organization) cfg.organization = (s as any).organization;
    return new OpenAI(cfg);
  }

  async chat(req: ChatRequest, onStream?: (event: StreamEvent) => void, signal?: AbortSignal): Promise<ChatResponse> {
    const overrideSecrets = (req.extras as any)?.secrets as Partial<OpenAISecrets> | undefined;
    const client = this.client(overrideSecrets);
    const model = (req.extras?.model as string) || overrideSecrets?.model || this.secrets.model || 'gpt-4o-mini';
    const messages = req.messages.map((m) => ({ role: m.role as any, content: m.content }));
    if (req.stream && onStream) {
      const stream = await client.chat.completions.create({ model, messages, temperature: req.temperature, max_tokens: req.maxTokens as any, stream: true }, { signal });
      let finalText = '';
      for await (const part of stream) {
        const delta = part?.choices?.[0]?.delta?.content;
        if (delta) {
          finalText += delta;
          onStream({ type: 'delta', data: { text: delta } });
        }
      }
      onStream({ type: 'message_completed', data: { message: { role: 'assistant', content: finalText, createdAt: Date.now() } } });
      return { message: { role: 'assistant', content: finalText, createdAt: Date.now() }, providerId: this.id };
    }
    const resp = await client.chat.completions.create({ model, messages, temperature: req.temperature, max_tokens: req.maxTokens as any }, { signal });
    const text = resp?.choices?.[0]?.message?.content || '';
    return { message: { role: 'assistant', content: text, createdAt: Date.now() }, providerId: this.id };
  }

  async embed(req: EmbeddingRequest): Promise<EmbeddingResponse> {
    const client = this.client((req as any)?.extras?.secrets);
    const model = (req.model as string) || (req as any)?.extras?.secrets?.model || 'text-embedding-3-small';
    const res = await client.embeddings.create({ model, input: req.texts });
    const vectors = res.data.map((d: any) => d.embedding as number[]);
    const dim = vectors[0]?.length || 0;
    return { vectors, dim, model, providerId: this.id };
  }

  async listModels(opts?: { secrets?: Partial<OpenAISecrets> }) {
    // Prefer curated JSON if present; otherwise, try live API; finally fallback
    const curated = loadProviderModels(this.id);
    if (curated.length) return curated;
    try {
      const client = this.client(opts?.secrets);
      const res: any = await client.models.list();
      const data = Array.isArray(res?.data) ? res.data : [];
      const items = data.map((m: any) => ({ id: m.id }));
      if (items.length) return items;
    } catch { }
    return [];
  }
}
