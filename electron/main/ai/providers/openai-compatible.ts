import OpenAI from 'openai';
import { ProviderAdapter, ProviderConfig, ProviderSecrets, ChatRequest, ChatResponse, StreamEvent, EmbeddingRequest, EmbeddingResponse } from '../types';
import { loadProviderSchema } from '../schema-loader';
import { loadProviderModels } from '../models-loader';

export class OpenAICompatibleProvider implements ProviderAdapter {
  readonly id: string;
  readonly label: string;
  private defaults: { baseUrl?: string; model?: string };
  private secrets: { apiKey?: string; baseUrl?: string; model?: string } = {};

  constructor(opts: { id: string; label: string; baseUrl?: string; model?: string }) {
    this.id = opts.id;
    this.label = opts.label;
    this.defaults = { baseUrl: opts.baseUrl, model: opts.model };
  }

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
        { key: 'baseUrl', label: 'Base URL', type: 'text' },
        { key: 'model', label: '默认模型', type: 'text' }
      ]
    };
    return loadProviderSchema(this.id, fallback);
  }
  setSecrets(secrets: ProviderSecrets) {
    this.secrets = { ...this.defaults, ...(this.secrets || {}), ...(secrets as any) };
  }
  getSecrets(): ProviderSecrets {
    return this.secrets;
  }

  private client(override?: { apiKey?: string; baseUrl?: string }) {
    const cfg: any = {};
    const s = { ...this.secrets, ...(override || {}) };
    if (s.apiKey) cfg.apiKey = s.apiKey;
    if (s.baseUrl || this.defaults.baseUrl) cfg.baseURL = s.baseUrl || this.defaults.baseUrl;
    return new OpenAI(cfg);
  }

  async chat(req: ChatRequest, onStream?: (event: StreamEvent) => void, signal?: AbortSignal): Promise<ChatResponse> {
    const override = (req.extras as any)?.secrets as any;
    console.log(override, req);

    const client = this.client(override);
    const model = (req.extras?.model as string) || override?.model || this.secrets.model || this.defaults.model || 'gpt-3.5-turbo';
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

    console.log(text);

    return { message: { role: 'assistant', content: text, createdAt: Date.now() }, providerId: this.id };
  }

  async embed(req: EmbeddingRequest): Promise<EmbeddingResponse> {
    const client = this.client((req as any)?.extras?.secrets);
    const model = (req.model as string) || (req as any)?.extras?.secrets?.model || this.secrets.model || 'text-embedding-3-small';
    const res = await client.embeddings.create({ model, input: req.texts });
    const vectors = (res as any).data.map((d: any) => d.embedding as number[]);
    const dim = vectors[0]?.length || 0;
    return { vectors, dim, model, providerId: this.id };
  }

  async listModels(opts?: { secrets?: { apiKey?: string; baseUrl?: string; model?: string } }) {
    const curated = loadProviderModels(this.id);
    if (curated.length) return curated;
    try {
      const client = this.client(opts?.secrets);
      const res: any = await (client as any).models.list();
      const data = Array.isArray(res?.data) ? res.data : [];
      return data.map((m: any) => ({ id: m.id }));
    } catch {
      // Best-effort fallbacks: use configured/default model if present
      const ids = [opts?.secrets?.model, this.secrets.model, this.defaults.model].filter(Boolean) as string[];
      return Array.from(new Set(ids)).map((id) => ({ id }));
    }
  }
}
