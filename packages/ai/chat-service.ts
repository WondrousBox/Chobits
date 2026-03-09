import { randomUUID } from 'node:crypto';

import { Agent } from '@mastra/core/agent';
import { BrowserWindow, ipcMain, WebContents } from 'electron';

import { ChatRepo } from '../common/db';
import { eventManager } from '../event';
import { AppEvent } from '../event/events';
import { getAgent, getFilteredTools } from './agents';
import { InstancesStore } from './instances-store';
import { createModel } from './models/index';
import { getProvider } from './registry';
import { getAllSecrets, getFirstApiKey } from './settings-store';
import { getAllInstanceSecrets } from './settings-store';
import { pushCardToolContext } from './tools/push-card-tool-context';
import { summaryToolContext } from './tools/summary-tool-context';
import { translationToolContext } from './tools/translation-tool-context';
import { ChatMessage, ChatRequest, ChatResponse, EmbeddingResponse, StreamEvent } from './types';

// local UUID fallback if uuid not present
function safeUuid(): string {
  try {
    return randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/** IPC channel for broadcasting conversation title updates to all renderer windows */
const CONV_TITLE_UPDATED_CHANNEL = 'ai:conversation-title-updated';

export class ChatService {
  private controllers = new Map<string, AbortController>();
  // Use defaultWin as a fallback when sender window is unavailable
  constructor(private defaultWin?: BrowserWindow) {
    //
  }

  registerIpc(): void {
    ipcMain.handle('ai:chat', async (e, req: ChatRequest) => this.chat(BrowserWindow.fromWebContents(e.sender) || this.defaultWin, req));
    ipcMain.handle('ai:chatStream', async (e, req: ChatRequest) => this.chatStream(e.sender, req));
    ipcMain.handle('ai:cancel', async (_e, payload: { requestId: string }) => this.cancel(payload.requestId));
    ipcMain.handle('ai:embed', async (_e, payload: { texts: string[]; providerId?: string; model?: string; normalize?: boolean }) => this.embed(payload));
    // Stateless chat (no history persistence)
    ipcMain.handle('ai:chatEphemeral', async (e, req: ChatRequest) => this.chatEphemeral(BrowserWindow.fromWebContents(e.sender) || this.defaultWin, req));
  }

  private async chat(win: BrowserWindow | undefined, req: ChatRequest): Promise<ChatResponse> {
    // Merge instance config if provided
    req = await this.withInstance(req);
    // Ensure conversation and persist last user message (if any)
    const conv = await ChatRepo.ensureConversation({
      id: req.conversationId,
      agentId: req.agentId,
      providerId: req.providerId,
      providerInstanceId: (req as any).providerInstanceId
    });
    const last = (req.messages || [])
      .slice()
      .reverse()
      .find((m) => m.role === 'user');
    if (last) {
      await ChatRepo.addMessage(conv.id, {
        role: 'user',
        content: last.content,
        name: last.name,
        toolCallId: last.toolCallId,
        metadata: last.metadata ? (JSON.stringify(last.metadata) as any) : null,
        createdAt: last.createdAt || Date.now()
      } as any);
    }

    // 使用 Mastra Agent
    const agent = await this.getConfiguredAgent(req);
    if (!agent) {
      const prov = getProvider(req.providerId);
      if (!prov?.chat) return { message: { role: 'assistant', content: 'No provider available.' } };
      const resp = await prov.chat({ ...req, stream: false });
      // persist assistant reply
      await ChatRepo.addMessage(conv.id, {
        role: 'assistant',
        content: resp.message?.content || '',
        createdAt: resp.message?.createdAt || Date.now(),
        metadata: resp.metadata ? (JSON.stringify(resp.metadata) as any) : null
      } as any);
      return { ...resp, metadata: { ...(resp.metadata || {}), conversationId: conv.id } } as any;
    }

    // 使用 Mastra agent.generate() 进行非流式调用
    const messages = req.messages || [];
    const input = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    const result = await agent.generate(input, { maxSteps: 10 });

    const resp: ChatResponse = {
      message: { role: 'assistant', content: result.text, createdAt: Date.now() },
      providerId: req.providerId,
      agentId: req.agentId
    };

    await ChatRepo.addMessage(conv.id, {
      role: 'assistant',
      content: resp.message?.content || '',
      createdAt: resp.message?.createdAt || Date.now(),
      metadata: resp.metadata ? (JSON.stringify(resp.metadata) as any) : null
    } as any);
    return { ...resp, metadata: { ...(resp.metadata || {}), conversationId: conv.id } } as any;
  }

  // Ephemeral chat: call provider/agent and return response without touching conversation history
  async chatEphemeral(win: BrowserWindow | undefined, req: ChatRequest): Promise<ChatResponse> {
    // Still allow instance merge (model, secrets, system prompt), but do NOT persist anything
    const resolved = await this.withInstance(req);
    const agent = await this.getConfiguredAgent(resolved);

    if (!agent) {
      const prov = getProvider(resolved.providerId);
      if (!prov?.chat) return { message: { role: 'assistant', content: 'No provider available.' } } as any;
      const resp = await prov.chat({ ...resolved, stream: false });
      // Ensure no conversationId is injected in metadata
      return { ...resp, metadata: { ...(resp.metadata || {}) } } as any;
    }

    // 使用 Mastra agent.generate() 进行非流式调用
    const messages = resolved.messages || [];
    const input = messages.map(m => `${m.role}: ${m.content}`).join('\n');

    const result = await agent.generate(input, {
      maxSteps: 10
    });

    return {
      message: { role: 'assistant', content: result.text, createdAt: Date.now() },
      providerId: resolved.providerId,
      agentId: resolved.agentId
    };
  }

  private async chatStream(sender: WebContents, req: ChatRequest): Promise<{ requestId: string; eventsChannel: string }> {
    // Prepare identifiers and controller
    const requestId = req.abortId || req['requestId'] || safeUuid();
    const eventsChannel = `ai:stream:${requestId}`;
    const ctrl = new AbortController();
    this.controllers.set(requestId, ctrl);

    console.log(`
=========================================================
Starting chat stream
${JSON.stringify(req, null, 2)}
=========================================================
`);

    const emit = (event: StreamEvent): void => {
      (sender || this.defaultWin?.webContents)?.send(eventsChannel, event);
    };

    // Start the actual streaming on next tick to avoid missing early events
    setTimeout(async () => {
      try {
        const resolved = await this.withInstance(req);
        const agent = await this.getConfiguredAgent(resolved);

        emit({ type: 'connected' });

        // 触发精灵动画：AI 开始思考（通过事件解耦）
        eventManager.emit(AppEvent.SPRITE_AI_START, { message: '思考中...' });

        if (!agent) {
          eventManager.emit(AppEvent.SPRITE_AI_ERROR, { message: 'Agent 不可用' });
          emit({ type: 'error', data: { message: 'Agent 不可用' } });
          emit({ type: 'done' });
          return;
        }
        console.log('resolved chat request:', resolved);

        const shouldPersist = resolved.persist !== false;

        // ==============================================数据库处理
        // Ensure conversation and persist the last user message once per request
        const lastUserMessage = (resolved.messages || [])
          .slice()
          .reverse()
          .find((m) => m.role === 'user');
        let conv = undefined;
        if (shouldPersist) {
          conv = await ChatRepo.ensureConversation({
            id: resolved.conversationId,
            agentId: resolved.agentId,
            providerId: resolved.providerId,
            providerInstanceId: (resolved as any).providerInstanceId
          });
        }
        if (shouldPersist && lastUserMessage && conv) {
          try {
            await ChatRepo.addMessage(conv.id, {
              role: 'user',
              content: lastUserMessage.content,
              name: lastUserMessage.name,
              toolCallId: lastUserMessage.toolCallId,
              metadata: lastUserMessage.metadata ? (JSON.stringify(lastUserMessage.metadata) as any) : null,
              createdAt: lastUserMessage.createdAt || Date.now()
            } as any);
          } catch {
            //
          }
        }
        // ================================================================
        // ==============================================数据库处理结束
        // ================================================================

        if (conv) {
          emit({ type: 'metadata', data: { conversationId: conv.id } });
        }

        let contextMessages: ChatMessage[] | undefined = (resolved.messages || []).length ? resolved.messages : undefined;
        if (!contextMessages && shouldPersist && conv?.id) {
          try {
            const rows = await ChatRepo.listMessages(conv.id, 2000, 0);
            if (rows?.length) {
              contextMessages = rows.map((row) => {
                let metadata: Record<string, any> | undefined;
                if (row.metadata) {
                  try {
                    metadata = JSON.parse(row.metadata as any);
                  } catch {
                    metadata = undefined;
                  }
                }
                return {
                  role: row.role as ChatMessage['role'],
                  content: row.content,
                  name: row.name ?? undefined,
                  toolCallId: row.toolCallId ?? undefined,
                  metadata,
                  createdAt: row.createdAt ?? undefined
                };
              });
            }
          } catch {
            // ignore db read errors
          }
        }

        let recentMessages;

        if (contextMessages?.length) {
          const systemMessages = contextMessages.filter((m) => m.role === 'system');
          const dialogMessages = contextMessages.filter((m) => m.role !== 'system');
          const recentDialog = dialogMessages.slice(-6);
          recentMessages = [...systemMessages, ...recentDialog];
        }

        // 获取模型名称
        const modelName = (resolved.extras?.model as string) || 'default';

        // 设置翻译工具执行上下文
        translationToolContext.setContext({
          chatFn: translationToolContext.createChatFn(agent),
          emit: translationToolContext.createEmitFn(requestId, 'translation'),
          requestId,
          taskLabel: `${resolved.providerId}/${modelName}`,
          providerId: resolved.providerId,
          model: modelName
        });

        // 设置总结工具执行上下文
        summaryToolContext.setContext({
          chatFn: summaryToolContext.createChatFn(agent),
          emit: summaryToolContext.createEmitFn(requestId, 'summary'),
          requestId,
          taskLabel: `${resolved.providerId}/${modelName}`,
          providerId: resolved.providerId,
          model: modelName
        });

        // 设置推送卡片工具执行上下文
        pushCardToolContext.setContext({
          conversationId: conv?.id
        });

        try {
          // 流式调用（使用字符串输入）
          const streamInput = recentMessages?.length ? recentMessages : lastUserMessage?.content || '';
          const stream = await agent.stream(streamInput as any, {
            maxSteps: 10,
            abortSignal: ctrl.signal
          });

          let fullText = '';

          for await (const chunk of stream.textStream) {
            if (ctrl.signal.aborted) break;

            fullText += chunk;
            emit({ type: 'delta', data: { text: chunk } });
          }

          const finalResp: ChatResponse = {
            message: {
              role: 'assistant',
              content: fullText,
              createdAt: Date.now()
            },
            providerId: req.providerId,
            agentId: resolved?.agentId
            // usage
          };
          emit({
            type: 'message_completed',
            data: finalResp
          });
          if (conv) {
            // Always send conversationId metadata at end as well (idempotent for renderer)
            emit({ type: 'metadata', data: { conversationId: conv.id } });
            // Persist assistant message at the end (regardless of who emitted deltas)
            try {
              const msg = finalResp?.message;
              if (msg) {
                await ChatRepo.addMessage(conv.id, {
                  role: 'assistant',
                  content: msg.content || '',
                  name: msg.name,
                  toolCallId: msg.toolCallId,
                  metadata: msg.metadata ? (JSON.stringify(msg.metadata) as any) : null,
                  createdAt: msg.createdAt || Date.now()
                } as any);
              }
            } catch {
              //
            }
          }
          // Auto-generate title for new conversations (title is null)
          if (conv && !conv.title) {
            this.generateConversationTitle(conv.id, lastUserMessage?.content || '', fullText, resolved).catch((e) => {
              console.warn('[ChatService] Auto title generation failed:', e);
            });
          }

          // 触发精灵动画：AI 回复完成（通过事件解耦）
          eventManager.emit(AppEvent.SPRITE_AI_COMPLETE);

          emit({ type: 'done' });
        } finally {
          // 清理翻译工具上下文
          translationToolContext.clearContext();
          // 清理总结工具上下文
          summaryToolContext.clearContext();
          // 清理推送卡片工具上下文
          pushCardToolContext.clearContext();
        }
      } catch (error: any) {
        console.error('Stream 错误:', error);

        // 触发精灵动画：AI 出错（通过事件解耦）
        eventManager.emit(AppEvent.SPRITE_AI_ERROR, {
          message: error instanceof Error ? error.message : String(error)
        });

        emit({
          type: 'error',
          data: {
            message: error instanceof Error ? error.message : String(error)
          }
        });
        emit({ type: 'done' });
      } finally {
        this.controllers.delete(requestId);
      }
    }, 0);

    // Return immediately so renderer can attach listeners to eventsChannel
    return { requestId, eventsChannel };
  }

  private cancel(requestId: string): { ok: boolean } {
    const ctrl = this.controllers.get(requestId);
    if (ctrl) {
      ctrl.abort();
      this.controllers.delete(requestId);
      return { ok: true };
    }
    return { ok: false };
  }

  private async embed(payload: { texts: string[]; providerId?: string; model?: string; normalize?: boolean }): Promise<EmbeddingResponse> {
    const prov = getProvider(payload.providerId);
    if (!prov?.embed) throw new Error('Provider has no embeddings');
    return prov.embed(payload);
  }

  /**
   * 获取配置好的 Agent
   */
  private async getConfiguredAgent(req: ChatRequest): Promise<Agent | undefined> {
    const agentId = req.agentId || 'assistant';
    const baseAgent = getAgent(agentId);
    if (!baseAgent) return undefined;

    // 获取 provider 配置
    const providerId = req.providerId || 'openai';
    const providerConfig = this.getProviderConfig(providerId);
    if (!providerConfig) return baseAgent;

    // 获取 secrets
    const fields = providerConfig.fields as Array<{ key: string; required?: boolean }>;
    const keys = fields.map((f) => f.key);
    const secrets = await getAllSecrets(providerId, keys);
    const apiKey = getFirstApiKey(secrets.apiKey);

    if (!apiKey && fields.some((f) => f.key === 'apiKey' && f.required)) {
      console.warn(`Provider ${providerId} 未配置 API Key`);
      return baseAgent;
    }

    // 创建模型实例并配置 Agent
    try {
      const modelConfig = {
        apiKey: apiKey || '',
        baseUrl: secrets.baseUrl as string,
        model: (req.extras?.model as string) || providerConfig.defaultModel
      };
      const model = createModel(providerId, modelConfig);

      // 根据实例配置的 enabledTools 过滤工具
      const enabledTools = req.extras?.enabledTools as string[] | undefined;
      const filteredTools = enabledTools !== undefined ? getFilteredTools(enabledTools) : undefined;

      // 创建配置好的 Agent 副本
      const toolsToUse = filteredTools || (baseAgent as any).tools || {};
      const agent = new Agent({
        name: baseAgent.name,
        instructions: (baseAgent as any).instructions || '',
        model,
        tools: toolsToUse
      });

      // ============================================================
      // 日志：打印传给 AI 的工具定义（分析 token 占用）
      // ============================================================
      console.log('\n' + '='.repeat(80));
      console.log('[Tool Definition Log] 传给 AI 的工具定义:');
      console.log('='.repeat(80));

      const toolEntries = Object.entries(toolsToUse);
      console.log(`[Tool Count] 共 ${toolEntries.length} 个工具\n`);

      let totalDescriptionLength = 0;
      let totalSchemaLength = 0;

      for (const [toolName, tool] of toolEntries) {
        const t = tool as any;
        const desc = t.description || '';
        const id = t.id || toolName;

        // 估算 schema 大小
        let schemaStr = '';
        try {
          schemaStr = JSON.stringify(t.inputSchema || {}, null, 2);
        } catch {
          schemaStr = '[无法序列化]';
        }

        const descLen = desc.length;
        const schemaLen = schemaStr.length;
        totalDescriptionLength += descLen;
        totalSchemaLength += schemaLen;

        console.log(`\n--- Tool: ${toolName} (id: ${id}) ---`);
        console.log(`[Description] (${descLen} chars):\n${desc}`);
        console.log(`[InputSchema] (${schemaLen} chars):\n${schemaStr.slice(0, 500)}${schemaStr.length > 500 ? '...(truncated)' : ''}`);
      }

      console.log('\n' + '-'.repeat(80));
      console.log(`[Summary] 描述总字符数: ${totalDescriptionLength}`);
      console.log(`[Summary] Schema 总字符数: ${totalSchemaLength}`);
      console.log(`[Summary] 估算总大小: ~${Math.ceil((totalDescriptionLength + totalSchemaLength) / 4)} tokens (按 1 token ≈ 4 chars 估算)`);
      console.log('='.repeat(80) + '\n');

      return agent;
    } catch (error) {
      console.error('创建模型失败:', error);
      return baseAgent;
    }
  }

  private async withInstance(req: ChatRequest): Promise<ChatRequest> {
    const instId = (req as any).providerInstanceId as string | undefined;
    if (!instId) return req;
    const inst = InstancesStore.get(instId);
    if (!inst) return req;
    // Merge instance fields
    const extras = { ...(req.extras || {}) } as any;
    if (inst.model && !extras.model) extras.model = inst.model;
    // Pass enabledTools to extras for agent configuration
    if (inst.enabledTools?.length) extras.enabledTools = inst.enabledTools;
    // Load secrets for this instance to allow provider overrides
    try {
      const schema = getProvider(inst.providerId)?.getConfigSchema?.();
      const keys = (schema?.fields || []).map((f) => f.key);
      const secrets = await getAllInstanceSecrets(instId, keys);
      if (Object.keys(secrets).length) extras.secrets = secrets;
    } catch {
      // Ignore
    }
    // Prepend system prompt
    const messages = [...(req.messages || [])];
    if (inst.systemPrompt) messages.unshift({ role: 'system', content: inst.systemPrompt });
    return { ...req, providerId: inst.providerId, messages, extras };
  }

  getProviderConfig(providerId: string): any {
    const prov = getProvider(providerId);
    return prov?.getConfigSchema?.();
  }

  /**
   * Generate a conversation title using AI in the main process.
   * Runs in the background after the first assistant reply.
   * Broadcasts the updated title to all renderer windows.
   */
  private async generateConversationTitle(conversationId: string, userContent: string, assistantContent: string, resolved: ChatRequest): Promise<void> {
    // Notify all windows that title generation has started (for shimmer animation)
    this.broadcastToAllWindows(CONV_TITLE_UPDATED_CHANNEL, { conversationId, title: null, status: 'generating' });

    try {
      const titleReq: ChatRequest = {
        providerId: resolved.providerId,
        providerInstanceId: (resolved as any).providerInstanceId,
        messages: [
          { role: 'system', content: '你是一个标题生成助手。请根据以下用户和AI的对话内容，生成一个简洁的对话标题（不超过20个字）。只输出标题本身，不要加引号、前缀或解释。' },
          { role: 'user', content: `用户: ${userContent}\nAI: ${assistantContent.slice(0, 500)}` }
        ],
        persist: false
      };
      const resp = await this.chatEphemeral(this.defaultWin, titleReq);
      let title = (resp?.message?.content || '').trim().replace(/^["'\u300c]|["'\u300d]$/g, '');
      if (title && title.length > 30) title = title.slice(0, 30) + '\u2026';

      if (title && title.length > 0) {
        await ChatRepo.renameConversation(conversationId, title);
        this.broadcastToAllWindows(CONV_TITLE_UPDATED_CHANNEL, { conversationId, title, status: 'done' });
      } else {
        this.broadcastToAllWindows(CONV_TITLE_UPDATED_CHANNEL, { conversationId, title: null, status: 'done' });
      }
    } catch (e) {
      console.warn('[ChatService] Title generation failed:', e);
      this.broadcastToAllWindows(CONV_TITLE_UPDATED_CHANNEL, { conversationId, title: null, status: 'error' });
    }
  }

  /** Broadcast a message to all open renderer windows */
  private broadcastToAllWindows(channel: string, data: any): void {
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) {
        try {
          w.webContents.send(channel, data);
        } catch {
          // window may have been destroyed between check and send
        }
      }
    });
  }
}
