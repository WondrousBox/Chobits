import { GoogleGenerativeAI } from '@google/generative-ai';

import { loadProviderModels } from '../models-loader';
import { loadProviderSchema } from '../schema-loader';
import { ChatRequest, ChatResponse, EmbeddingRequest, EmbeddingResponse, ProviderAdapter, ProviderConfig, ProviderSecrets, StreamEvent } from '../types';

type GeminiSecrets = { apiKey?: string; model?: string };

export class GeminiProvider implements ProviderAdapter {
  readonly id = 'gemini';
  readonly label = 'Google Gemini';
  private secrets: GeminiSecrets = {};

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
        { key: 'model', label: '默认模型（如 gemini-1.5-flash）', type: 'text' }
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

  private modelInstance(model?: string) {
    if (!this.secrets.apiKey) throw new Error('Gemini API key not set');
    const genAI = new GoogleGenerativeAI(this.secrets.apiKey);
    const m = model || this.secrets.model || 'gemini-1.5-flash';
    return genAI.getGenerativeModel({ model: m });
  }

  async chat(req: ChatRequest, onStream?: (event: StreamEvent) => void, signal?: AbortSignal): Promise<ChatResponse> {
    const model = this.modelInstance(req.extras?.model as string | undefined);
    const content = req.messages.map((m) => ({ role: m.role, parts: [{ text: m.content }] }));
    if (req.stream && onStream) {
      const streamResp: any = await (model as any).generateContentStream({ contents: content }, { signal } as any);
      let full = '';
      for await (const chunk of streamResp.stream) {
        const txt = chunk?.text();
        if (txt) {
          full += txt;
          onStream({ type: 'delta', data: { text: txt } });
        }
      }
      onStream({ type: 'message_completed', data: { message: { role: 'assistant', content: full, createdAt: Date.now() } } });
      return { message: { role: 'assistant', content: full, createdAt: Date.now() }, providerId: this.id };
    }
    const resp: any = await (model as any).generateContent({ contents: content }, { signal } as any);
    const text = resp?.response?.text?.() || '';
    return { message: { role: 'assistant', content: text, createdAt: Date.now() }, providerId: this.id };
  }

  async embed(_req: EmbeddingRequest): Promise<EmbeddingResponse> {
    throw new Error('Gemini embeddings not implemented');
  }

  async listModels() {
    const curated = loadProviderModels(this.id);
    if (curated.length) return curated;
    return [];
  }
}
