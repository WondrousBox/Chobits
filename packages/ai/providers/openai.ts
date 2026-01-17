import OpenAI from 'openai';

import { loadProviderModelsFromBank } from '../models-loader';
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
  setSecrets(secrets: ProviderSecrets): void {
    this.secrets = { ...this.secrets, ...(secrets as any) };
  }
  getSecrets(): ProviderSecrets {
    return this.secrets;
  }

  private client(override?: Partial<OpenAISecrets>): OpenAI {
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
    const toolDefs = (req.extras as any)?.tools as Array<{ name: string; description: string; parameters: any }> | undefined;
    const tools = toolDefs?.length ? toolDefs.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })) : undefined;
    if (req.stream && onStream) {
      const stream = await client.chat.completions.create(
        {
          model,
          messages,
          temperature: req.temperature,
          max_tokens: req.maxTokens as any,
          tools,
          tool_choice: tools?.length ? 'auto' : undefined,
          stream: true
        },
        { signal }
      );
      let finalText = '';
      const toolCalls = new Map<number, { id?: string; name?: string; args: string }>();
      for await (const part of stream) {
        const choice = part?.choices?.[0];
        const delta = choice?.delta?.content;
        if (delta) {
          finalText += delta;
          onStream({ type: 'delta', data: { text: delta } });
        }

        const toolDelta = choice?.delta?.tool_calls;
        if (Array.isArray(toolDelta)) {
          for (const call of toolDelta) {
            const index = (call as any)?.index ?? 0;
            const current = toolCalls.get(index) || { id: undefined, name: undefined, args: '' };
            if (call?.id) current.id = call.id;
            if ((call as any)?.function?.name) current.name = (call as any).function.name;
            if ((call as any)?.function?.arguments) current.args += (call as any).function.arguments;
            toolCalls.set(index, current);
          }
        }
      }

      for (const entry of toolCalls.values()) {
        if (!entry.name) continue;
        let args: any = entry.args;
        try {
          args = entry.args ? JSON.parse(entry.args) : {};
        } catch {
          // keep raw string
        }
        onStream({ type: 'tool_call', data: { name: entry.name, args, callId: entry.id || '' } });
      }

      onStream({ type: 'message_completed', data: { message: { role: 'assistant', content: finalText, createdAt: Date.now() } } });
      return { message: { role: 'assistant', content: finalText, createdAt: Date.now() }, providerId: this.id };
    }
    const resp = await client.chat.completions.create(
      {
        model,
        messages,
        temperature: req.temperature,
        max_tokens: req.maxTokens as any,
        tools,
        tool_choice: tools?.length ? 'auto' : undefined
      },
      { signal }
    );
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

  async listModels(opts?: { secrets?: Partial<OpenAISecrets> }): Promise<Array<{ id: string }>> {
    // Prefer curated JSON if present; otherwise, try live API; finally fallback
    const curated = await loadProviderModelsFromBank(this.id);
    if (curated.length) return curated;
    try {
      const client = this.client(opts?.secrets);
      const res: any = await client.models.list();
      const data = Array.isArray(res?.data) ? res.data : [];
      const items = data.map((m: any) => ({ id: m.id }));
      if (items.length) return items;
    } catch (error) {
      console.error(error);
    }
    return [];
  }
}
