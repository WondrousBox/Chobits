import { ProviderAdapter, ProviderConfig, ProviderSecrets, ChatRequest, ChatResponse, EmbeddingRequest, EmbeddingResponse, StreamEvent } from '../types';
import { loadProviderSchema } from '../schema-loader';

export class DummyProvider implements ProviderAdapter {
  readonly id = 'dummy';
  readonly label = 'Dummy (local)';
  private secrets: ProviderSecrets = {};

  isConfigured(): boolean { return true; }
  getConfigSchema(): ProviderConfig {
    const fallback: ProviderConfig = {
      id: this.id,
      label: this.label,
      enabled: true,
      fields: [
        { key: 'note', label: 'This is a dummy provider for testing', type: 'text' },
      ],
    };
    return loadProviderSchema(this.id, fallback);
  }
  setSecrets(secrets: ProviderSecrets) { this.secrets = secrets; }
  getSecrets(): ProviderSecrets { return this.secrets; }

  async chat(req: ChatRequest, onStream?: (event: StreamEvent) => void): Promise<ChatResponse> {
    const last = req.messages[req.messages.length - 1];
    const reversed = (last?.content || '').split('').reverse().join('');
    if (req.stream && onStream) {
      const chunks = reversed.match(/.{1,8}/g) || [reversed];
      for (const c of chunks) onStream({ type: 'delta', data: { text: c } });
      onStream({ type: 'done' });
    }
    return {
      message: { role: 'assistant', content: reversed, createdAt: Date.now() },
      providerId: this.id,
    };
  }

  async embed(req: EmbeddingRequest): Promise<EmbeddingResponse> {
    // return trivial embeddings for testing deterministically
    const vectors = req.texts.map((t) => {
      const out = new Array(16).fill(0);
      for (let i = 0; i < t.length; i++) out[i % 16] += t.charCodeAt(i) % 13;
      return out.map((v) => v / 100);
    });
    return { vectors, dim: 16, providerId: this.id };
  }
}
