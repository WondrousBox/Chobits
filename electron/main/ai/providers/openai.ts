import OpenAI from 'openai';
import { ProviderAdapter, ProviderConfig, ProviderSecrets, ChatRequest, ChatResponse, StreamEvent, EmbeddingRequest, EmbeddingResponse } from '../types';

type OpenAISecrets = { apiKey?: string; baseUrl?: string; organization?: string; model?: string };

export class OpenAIProvider implements ProviderAdapter {
  readonly id = 'openai';
  readonly label = 'OpenAI';
  private secrets: OpenAISecrets = {};

  isConfigured(): boolean { return !!this.secrets.apiKey; }
  getConfigSchema(): ProviderConfig {
    return {
      id: this.id,
      label: this.label,
      enabled: true,
      fields: [
        { key: 'apiKey', label: 'API Key', type: 'password', required: true },
        { key: 'baseUrl', label: 'Base URL (可选，自定义网关)', type: 'text' },
        { key: 'model', label: '默认模型（如 gpt-4o-mini）', type: 'text' },
      ],
    };
  }
  setSecrets(secrets: ProviderSecrets) { this.secrets = { ...this.secrets, ...(secrets as any) }; }
  getSecrets(): ProviderSecrets { return this.secrets; }

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
    try {
      const client = this.client(opts?.secrets);
      // openai v4 SDK: client.models.list() -> AsyncIterable
      const items: Array<{ id: string; label?: string }> = [];
      const it = await client.models.list();
      // it is a pagination object; coerce to array
      const data = Array.isArray((it as any).data) ? (it as any).data : [];
      for (const m of data) items.push({ id: m.id });
      if (items.length) return items;
    } catch {}
    // Fallback curated set
    return [
      { id: 'gpt-4o' },
      { id: 'gpt-4o-mini' },
      { id: 'o4-mini' },
      { id: 'text-embedding-3-small' },
      { id: 'text-embedding-3-large' },
    ];
  }
}
