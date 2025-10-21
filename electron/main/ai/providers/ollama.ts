import { ProviderAdapter, ProviderConfig, ProviderSecrets, ChatRequest, ChatResponse, StreamEvent, EmbeddingRequest, EmbeddingResponse } from '../types';
import { loadProviderSchema } from '../schema-loader';
import { loadProviderModels } from '../models-loader';

type OllamaSecrets = { baseUrl?: string; model?: string };

export class OllamaProvider implements ProviderAdapter {
  readonly id = 'ollama';
  readonly label = 'Ollama (local)';
  private secrets: OllamaSecrets = { baseUrl: 'http://127.0.0.1:11434' };

  isConfigured(): boolean { return true; }
  getConfigSchema(): ProviderConfig {
    const fallback: ProviderConfig = {
      id: this.id,
      label: this.label,
      enabled: true,
      fields: [
        { key: 'baseUrl', label: 'Base URL', type: 'text' },
        { key: 'model', label: '默认模型（如 llama3.1）', type: 'text' },
      ],
    };
    return loadProviderSchema(this.id, fallback);
  }
  setSecrets(secrets: ProviderSecrets) { this.secrets = { ...this.secrets, ...(secrets as any) }; }
  getSecrets(): ProviderSecrets { return this.secrets; }

  private url(path: string) { return `${this.secrets.baseUrl || 'http://127.0.0.1:11434'}${path}`; }

  async chat(req: ChatRequest, onStream?: (event: StreamEvent) => void): Promise<ChatResponse> {
    const model = (req.extras?.model as string) || this.secrets.model || 'llama3.1';
    const messages = req.messages.map(m => ({ role: m.role, content: m.content }));
    if (req.stream && onStream) {
      const r = await fetch(this.url('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, stream: true })
      });
      let full = '';
      const reader = r.body?.getReader();
      const decoder = new TextDecoder();
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split('\n')) {
          if (!line) continue;
          try {
            const obj = JSON.parse(line);
            const delta = obj?.message?.content || '';
            if (delta) {
              full += delta;
              onStream({ type: 'delta', data: { text: delta } });
            }
          } catch {}
        }
      }
      onStream({ type: 'message_completed', data: { message: { role: 'assistant', content: full, createdAt: Date.now() } } });
      return { message: { role: 'assistant', content: full, createdAt: Date.now() }, providerId: this.id };
    }
    const r = await fetch(this.url('/api/chat'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false })
    });
    const data: any = await r.json();
    const text = data?.message?.content || '';
    return { message: { role: 'assistant', content: text, createdAt: Date.now() }, providerId: this.id };
  }

  async embed(req: EmbeddingRequest): Promise<EmbeddingResponse> {
    const model = (req.model as string) || this.secrets.model || 'nomic-embed-text';
    const r = await fetch(this.url('/api/embeddings'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: req.texts })
    });
    const data: any = await r.json();
    const vectors = (data?.embeddings || data?.data || []).map((d: any) => d?.embedding || d).filter(Boolean);
    const dim = vectors[0]?.length || 0;
    return { vectors, dim, model, providerId: this.id };
  }

  async listModels() {
    try {
      const r = await fetch(this.url('/api/tags'));
      const data: any = await r.json();
      const models = Array.isArray(data?.models) ? data.models : Array.isArray(data?.data) ? data.data : [];
      return models.map((m: any) => ({ id: m.name || m.model || m.id || '' })).filter((m: any) => m.id);
    } catch {
      // Prefer curated JSON as fallback
      const curated = loadProviderModels(this.id);
      if (curated.length) return curated;
      return [];
    }
  }
}
