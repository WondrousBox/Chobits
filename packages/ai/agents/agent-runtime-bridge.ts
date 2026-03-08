import type { AgentInput, LLMChunk, LLMProvider, LLMRequest, LLMResponse, Message } from '@packages/ai-agent';
import { DefaultAgentRuntime, generateId, RegistryToolProvider } from '@packages/ai-agent';

import type { AgentContext, ChatMessage, ChatRequest, ChatResponse, ProviderAdapter, StreamEvent } from '../types';

class ProviderLLMAdapter implements LLMProvider {
  constructor(
    private provider: ProviderAdapter,
    private baseReq: ChatRequest
  ) { }

  async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
    if (!this.provider.chat) {
      throw new Error('No provider or chat capability available.');
    }

    const queue: LLMChunk[] = [];
    let done = false;
    let error: unknown;
    let notify: (() => void) | null = null;

    const push = (chunk: LLMChunk): void => {
      queue.push(chunk);
      if (notify) {
        notify();
        notify = null;
      }
    };

    const onStream = (event: StreamEvent): void => {
      if (event?.type === 'delta' && event.data?.text) {
        push({ type: 'text', text: event.data.text });
      }
      if (event?.type === 'tool_call') {
        push({
          type: 'tool_call',
          call: {
            id: event.data.callId || generateId(),
            name: event.data.name,
            params: event.data.args
          }
        });
      }
      if (event?.type === 'error') {
        error = new Error(event.data?.message || 'Provider error');
      }
    };

    const messages = mapToChatMessages(request.messages, request.systemPrompt);
    const reqForProvider: ChatRequest = {
      ...this.baseReq,
      messages,
      stream: true,
      temperature: request.temperature ?? this.baseReq.temperature,
      maxTokens: request.maxTokens ?? this.baseReq.maxTokens,
      extras: {
        ...(this.baseReq.extras || {}),
        tools: request.tools,
        systemPrompt: request.systemPrompt,
        stop: request.stop
      }
    };

    this.provider
      .chat(reqForProvider, onStream)
      .then((resp) => {
        const usage = resp.usage
          ? {
            inputTokens: resp.usage.inputTokens,
            outputTokens: resp.usage.outputTokens,
            cost: resp.usage.cost
          }
          : undefined;
        push({
          type: 'done',
          usage
        });
        done = true;
        if (notify) {
          notify();
          notify = null;
        }
      })
      .catch((err) => {
        error = err;
        done = true;
        if (notify) {
          notify();
          notify = null;
        }
      });

    while (!done || queue.length > 0) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          notify = resolve;
        });
        continue;
      }

      const chunk = queue.shift();
      if (chunk) {
        yield chunk;
      }

      if (error) {
        throw error;
      }
    }
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    if (!this.provider.chat) {
      throw new Error('No provider or chat capability available.');
    }

    const messages = mapToChatMessages(request.messages, request.systemPrompt);
    const reqForProvider: ChatRequest = {
      ...this.baseReq,
      messages,
      stream: false,
      temperature: request.temperature ?? this.baseReq.temperature,
      maxTokens: request.maxTokens ?? this.baseReq.maxTokens,
      extras: {
        ...(this.baseReq.extras || {}),
        tools: request.tools,
        systemPrompt: request.systemPrompt,
        stop: request.stop
      }
    };

    const resp = await this.provider.chat(reqForProvider);

    const usage = resp.usage
      ? {
        inputTokens: resp.usage.inputTokens,
        outputTokens: resp.usage.outputTokens,
        cost: resp.usage.cost
      }
      : undefined;

    return {
      message: {
        role: resp.message.role,
        content: resp.message.content,
        name: resp.message.name,
        toolCallId: resp.message.toolCallId
      },
      usage
    };
  }
}

function mapToChatMessages(messages: Message[], systemPrompt?: string): ChatMessage[] {
  const mapped = (messages || []).map((m) => ({
    role: m.role,
    content: m.content,
    name: m.name,
    toolCallId: m.toolCallId
  }));

  if (systemPrompt) {
    return [{ role: 'system', content: systemPrompt }, ...mapped];
  }

  return mapped;
}

function mapToAgentMessages(messages: ChatMessage[]): Message[] {
  return (messages || []).map((m) => ({
    role: m.role,
    content: m.content,
    name: m.name,
    toolCallId: m.toolCallId
  }));
}

export async function runAgentRuntimeChat(ctx: AgentContext, req: ChatRequest, messages: ChatMessage[], options?: { agentId?: string; signal?: AbortSignal }): Promise<ChatResponse> {
  const provider = ctx.getProvider(req.providerId);
  if (!provider?.chat) {
    return { message: { role: 'assistant', content: 'No provider or chat capability available.' } };
  }

  const runtime = new DefaultAgentRuntime();
  const tools = new RegistryToolProvider();
  // 注册工具（目前为空，可以按需添加其他工具）
  const llm = new ProviderLLMAdapter(provider, req);

  const input: AgentInput = {
    messages: mapToAgentMessages(messages)
  };

  const context = {
    sessionId: req.conversationId || generateId(),
    llm,
    tools,
    options: {
      temperature: req.temperature,
      maxTokens: req.maxTokens,
      enableMemory: false,
      enableLogging: false
    }
  };

  if (options?.signal) {
    if (options.signal.aborted) {
      runtime.abort();
    } else {
      options.signal.addEventListener('abort', () => runtime.abort(), { once: true });
    }
  }

  let finalText = '';
  let usage: ChatResponse['usage'] | undefined;

  for await (const event of runtime.run(input, context)) {
    if (event.type === 'delta') {
      finalText += event.text;
      if (req.stream) {
        ctx.emit?.({ type: 'delta', data: { text: event.text } });
      }
    }
    if (event.type === 'tool_call' && req.stream) {
      ctx.emit?.({ type: 'tool_call', data: { name: event.call.name, args: event.call.params, callId: event.call.id } });
    }
    if (event.type === 'tool_result' && req.stream) {
      ctx.emit?.({ type: 'tool_result', data: { callId: event.callId || '', result: event.result } });
    }
    if (event.type === 'error' && req.stream) {
      ctx.emit?.({ type: 'error', data: { message: event.error.message, cause: event.error.cause } });
    }
    if (event.type === 'done') {
      usage = event.usage ? { inputTokens: event.usage.inputTokens, outputTokens: event.usage.outputTokens, cost: event.usage.cost } : undefined;
    }
  }

  return {
    message: {
      role: 'assistant',
      content: finalText,
      createdAt: Date.now()
    },
    providerId: req.providerId,
    agentId: options?.agentId,
    usage
  };
}
