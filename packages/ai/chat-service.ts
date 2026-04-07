import { randomUUID } from 'node:crypto';

import { BrowserWindow, ipcMain, WebContents } from 'electron';

import { ChatRepo, WorkspacesRepo } from '../common/db';
import { eventManager } from '../event';
import { AppEvent } from '../event/events';
import { normalizeProviderPreset, resolveProviderPresetId } from './provider-preset';
import { getProviderDefinitionSchema } from './providers/service';
import { PiExecutionService } from './runtime/pi/execution-service';
import { PiSessionService } from './runtime/pi/session-service';
import { generatePiConversationTitle, normalizeGeneratedConversationTitle } from './runtime/pi/tasks/title';
import type { AgentLoopCompletePayload } from './services/memory-types';
import { ChatMessage, ChatRequest, ChatResponse, EmbeddingRequest, EmbeddingResponse, StreamEvent } from './types';

// local UUID fallback if uuid not present
function safeUuid(): string {
  try {
    return randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function forcePiRuntime(req: ChatRequest): ChatRequest {
  return {
    ...req,
    extras: {
      ...(req.extras || {}),
      runtime: 'pi'
    }
  };
}

/** IPC channel for broadcasting conversation title updates to all renderer windows */
const CONV_TITLE_UPDATED_CHANNEL = 'ai:conversation-title-updated';

export class ChatService {
  private controllers = new Map<string, AbortController>();
  private piExecutionService?: PiExecutionService;
  private readonly piSessionService = new PiSessionService();
  // Use defaultWin as a fallback when sender window is unavailable
  constructor(private defaultWin?: BrowserWindow) {
    //
  }

  registerIpc(): void {
    ipcMain.handle('ai:chat', async (e, req: ChatRequest) => this.chat(BrowserWindow.fromWebContents(e.sender) || this.defaultWin, normalizeProviderPreset(req)));
    ipcMain.handle('ai:chatStream', async (e, req: ChatRequest) => this.chatStream(e.sender, normalizeProviderPreset(req)));
    ipcMain.handle('ai:cancel', async (_e, payload: { requestId: string }) => this.cancel(payload.requestId));
    ipcMain.handle('ai:embed', async (_e, payload: EmbeddingRequest) => this.embed(normalizeProviderPreset(payload)));
    // Stateless chat (no history persistence)
    ipcMain.handle('ai:chatEphemeral', async (e, req: ChatRequest) => this.chatEphemeral(BrowserWindow.fromWebContents(e.sender) || this.defaultWin, normalizeProviderPreset(req)));
  }

  private async chat(win: BrowserWindow | undefined, req: ChatRequest): Promise<ChatResponse> {
    void win;
    return this.chatWithPi(this.toPiRequest(req));
  }

  // Ephemeral chat: call provider/agent and return response without touching conversation history
  async chatEphemeral(win: BrowserWindow | undefined, req: ChatRequest): Promise<ChatResponse> {
    void win;
    return this.piSessionService.chatEphemeral(this.toPiRequest(req));
  }

  private async chatStream(sender: WebContents, req: ChatRequest): Promise<{ requestId: string; eventsChannel: string }> {
    // Prepare identifiers and controller
    const requestId = req.abortId || req['requestId'] || safeUuid();
    const eventsChannel = `ai:stream:${requestId}`;
    const ctrl = new AbortController();
    this.controllers.set(requestId, ctrl);

    const emit = (event: StreamEvent): void => {
      (sender || this.defaultWin?.webContents)?.send(eventsChannel, event);
    };

    // Start the actual streaming on next tick to avoid missing early events
    setTimeout(async () => {
      try {
        console.log(`
====  Starting chat stream  =============================

${JSON.stringify(forcePiRuntime(req), null, 2)}
=========================================================
`);
        await this.chatStreamWithPi(sender, forcePiRuntime(req), emit, ctrl);
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

  private async chatWithPi(req: ChatRequest): Promise<ChatResponse> {
    const preview = await this.piSessionService.preview(req);
    const providerPresetId = resolveProviderPresetId(req);

    if (!preview.availability.available) {
      throw new Error(preview.availability.reason || 'Pi runtime packages are not installed yet.');
    }

    const conv = await this.ensureHistoricalConversationRecord({
      id: req.conversationId,
      agentId: req.agentId || preview.resolved.profile.id,
      providerId: preview.resolved.model.providerId,
      providerPresetId,
      workspaceId: await this.resolveWorkspaceId(req)
    });

    const lastUserMessage = this.getLastUserMessage(req.messages);
    if (lastUserMessage) {
      await this.persistConversationMessage(conv.id, lastUserMessage);
    }

    const resp = await this.piSessionService.chat({
      ...req,
      conversationId: conv.id
    });

    if (resp.message) {
      await this.persistConversationMessage(conv.id, resp.message);
    }

    return {
      ...resp,
      metadata: {
        ...(resp.metadata || {}),
        conversationId: conv.id
      }
    } as any;
  }

  private async chatStreamWithPi(sender: WebContents, req: ChatRequest, emit: (event: StreamEvent) => void, ctrl: AbortController): Promise<void> {
    const preview = await this.piSessionService.preview(req);
    const providerPresetId = resolveProviderPresetId(req);

    if (!preview.availability.available) {
      await this.piSessionService.chatStream(req, emit, ctrl.signal);
      return;
    }

    const shouldPersist = req.persist !== false;
    const lastUserMessage = this.getLastUserMessage(req.messages);
    let conv = undefined;

    if (shouldPersist) {
      conv = await this.ensureHistoricalConversationRecord({
        id: req.conversationId,
        agentId: req.agentId || preview.resolved.profile.id,
        providerId: preview.resolved.model.providerId,
        providerPresetId,
        workspaceId: await this.resolveWorkspaceId(req)
      });
    }

    if (shouldPersist && lastUserMessage && conv) {
      await this.persistConversationMessageSafely(conv.id, lastUserMessage, emit, 'user');
    }

    let contextMessages: ChatMessage[] | undefined = (req.messages || []).length ? req.messages : undefined;
    if (!contextMessages && shouldPersist && conv?.id) {
      contextMessages = await this.loadConversationContextMessages(conv.id);
    }

    const streamMessages = this.selectRecentMessages(contextMessages) || req.messages;
    const targetWindowId = BrowserWindow.fromWebContents(sender)?.id;
    const streamRequest: ChatRequest = {
      ...req,
      conversationId: conv?.id || req.conversationId,
      extras: {
        ...(req.extras || {}),
        ...(targetWindowId !== undefined ? { piTargetWindowId: targetWindowId } : {})
      },
      messages: streamMessages
    };

    let emittedConversationMetadata = false;
    let finalMessage: ChatMessage | undefined;
    let fullText = '';
    let thinkingText = '';
    let errorMessage: string | undefined;
    const collectedToolCalls: Array<{ callId: string; name: string; args?: any; result?: any }> = [];

    eventManager.emit(AppEvent.SPRITE_AI_START, { message: '思考中...' });

    await this.piSessionService.chatStream(
      streamRequest,
      (event) => {
        if (event.type === 'connected') {
          emit(event);
          if (conv && !emittedConversationMetadata) {
            emit({ type: 'metadata', data: { conversationId: conv.id } });
            emittedConversationMetadata = true;
          }
          return;
        }

        if (event.type === 'delta' && event.data?.text) {
          fullText += event.data.text;
        }

        if (event.type === 'thinking_delta' && event.data?.text) {
          thinkingText += event.data.text;
        }

        if (event.type === 'message_completed' && event.data?.message) {
          finalMessage = event.data.message;
          if (!fullText && event.data.message.content) {
            fullText = event.data.message.content;
          }
        }

        if (event.type === 'tool_call' && event.data) {
          collectedToolCalls.push({ callId: event.data.callId, name: event.data.name, args: event.data.args });
        }

        if (event.type === 'tool_result' && event.data) {
          const tc = collectedToolCalls.find((t) => t.callId === event.data.callId);
          if (tc) tc.result = event.data.result;
        }

        if (event.type === 'error') {
          errorMessage = event.data?.message;
        }

        emit(event);
      },
      ctrl.signal
    );

    if (!finalMessage && fullText) {
      finalMessage = {
        content: fullText,
        createdAt: Date.now(),
        role: 'assistant',
        ...(thinkingText ? { metadata: { thinkingBlocks: [{ type: 'thinking', thinking: thinkingText }] } } : {})
      };
    }

    if (finalMessage && collectedToolCalls.length > 0) {
      finalMessage = { ...finalMessage, metadata: { ...finalMessage.metadata, toolCalls: collectedToolCalls } };
    }

    if (conv && finalMessage) {
      await this.persistConversationMessageSafely(conv.id, finalMessage, emit, 'assistant');
    }

    if (conv && finalMessage?.content && !conv.title) {
      this.generateConversationTitle(conv.id, lastUserMessage?.content || '', finalMessage.content, req).catch((e) => {
        console.warn('[ChatService] Auto title generation failed:', e);
      });
    }

    if (errorMessage) {
      eventManager.emit(AppEvent.SPRITE_AI_ERROR, { message: errorMessage });
    } else {
      eventManager.emit(AppEvent.SPRITE_AI_COMPLETE, {
        conversationId: conv?.id,
        messageCount: streamMessages.length,
        toolCallCount: collectedToolCalls.length,
        assistantContentLength: fullText.length
      });

      if (conv?.id) {
        const payload: AgentLoopCompletePayload = {
          conversationId: conv.id,
          toolCalls: collectedToolCalls,
          hasToolCalls: collectedToolCalls.length > 0,
          assistantContentLength: fullText.length,
          runtime: 'pi',
          persisted: shouldPersist,
          agentId: req.agentId || preview.resolved.profile.id,
          providerId: preview.resolved.model.providerId,
          providerPresetId
        };
        console.log(
          `[ChatService] Emitting AGENT_LOOP_COMPLETE: conv=${conv.id}, persisted=${shouldPersist}, ` + `toolCalls=${collectedToolCalls.length}, agentId=${payload.agentId}, textLen=${fullText.length}`
        );
        eventManager.emit(AppEvent.AGENT_LOOP_COMPLETE, payload);
      }
    }
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

  private async embed(payload: EmbeddingRequest): Promise<EmbeddingResponse> {
    return this.getPiExecutionService().embed(payload);
  }

  getProviderConfig(providerId: string): any {
    return getProviderDefinitionSchema(providerId);
  }

  private getPiExecutionService(): PiExecutionService {
    this.piExecutionService ||= new PiExecutionService();
    return this.piExecutionService;
  }

  private toPiRequest(req: ChatRequest): ChatRequest {
    const normalizedRequest = normalizeProviderPreset(req);
    return this.piSessionService.shouldHandle(normalizedRequest) ? normalizedRequest : forcePiRuntime(normalizedRequest);
  }

  private getLastUserMessage(messages?: ChatMessage[]): ChatMessage | undefined {
    return (messages || [])
      .slice()
      .reverse()
      .find((message) => message.role === 'user');
  }

  private async persistConversationMessage(conversationId: string, message: ChatMessage): Promise<void> {
    await ChatRepo.addMessage(conversationId, {
      content: message.content,
      createdAt: message.createdAt || Date.now(),
      metadata: message.metadata ? (JSON.stringify(message.metadata) as any) : null,
      name: message.name,
      role: message.role,
      toolCallId: message.toolCallId
    } as any);
  }

  private async ensureHistoricalConversationRecord(params: {
    id?: string;
    agentId: string;
    providerId: string;
    providerPresetId?: string;
    workspaceId?: string;
  }): Promise<Awaited<ReturnType<typeof ChatRepo.ensureConversation>>> {
    const { agentId, id, providerId, providerPresetId, workspaceId } = params;

    return ChatRepo.ensureConversation({
      id,
      agentId,
      providerId,
      providerPresetId,
      workspaceId
    });
  }

  private async resolveWorkspaceId(req: ChatRequest): Promise<string | undefined> {
    const requestedWorkspaceId = typeof req.extras?.workspaceId === 'string' && req.extras.workspaceId.trim() ? req.extras.workspaceId.trim() : undefined;
    if (requestedWorkspaceId) return requestedWorkspaceId;

    if (req.conversationId) {
      const existing = await ChatRepo.ensureConversation({ id: req.conversationId });
      if (existing?.workspaceId) return existing.workspaceId;
    }

    const defaultWorkspace = await WorkspacesRepo.getDefault();
    return defaultWorkspace?.id || undefined;
  }

  private async loadConversationContextMessages(conversationId: string): Promise<ChatMessage[] | undefined> {
    try {
      const rows = await ChatRepo.listMessages(conversationId, 2000, 0);
      if (!rows?.length) return undefined;

      return rows.map((row) => {
        let metadata: Record<string, any> | undefined;
        if (row.metadata) {
          try {
            metadata = JSON.parse(row.metadata as any);
          } catch {
            metadata = undefined;
          }
        }

        return {
          content: row.content,
          createdAt: row.createdAt ?? undefined,
          metadata,
          name: row.name ?? undefined,
          role: row.role as ChatMessage['role'],
          toolCallId: row.toolCallId ?? undefined
        };
      });
    } catch (error) {
      console.warn('[ChatService] Failed to load conversation context messages:', error);
      return undefined;
    }
  }

  private async persistConversationMessageSafely(conversationId: string, message: ChatMessage, emit: (event: StreamEvent) => void, phase: 'assistant' | 'user'): Promise<boolean> {
    try {
      await this.persistConversationMessage(conversationId, message);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`[ChatService] Failed to persist ${phase} conversation message:`, error);
      emit({
        type: 'metadata',
        data: {
          conversationId,
          persistenceWarning: {
            message: errorMessage,
            phase
          }
        }
      });
      return false;
    }
  }

  private selectRecentMessages(messages?: ChatMessage[]): ChatMessage[] | undefined {
    if (!messages?.length) return undefined;

    const systemMessages = messages.filter((message) => message.role === 'system');
    const dialogMessages = messages.filter((message) => message.role !== 'system');

    return [...systemMessages, ...dialogMessages.slice(-6)];
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
      const titleMessages: ChatMessage[] = [
        { role: 'system', content: '你是一个标题生成助手。请根据以下用户和AI的对话内容，生成一个简洁的对话标题（不超过20个字）。只输出标题本身，不要加引号、前缀或解释。' },
        { role: 'user', content: `用户: ${userContent}\nAI: ${assistantContent.slice(0, 500)}` }
      ];
      const titleReq: ChatRequest = normalizeProviderPreset({
        agentId: 'chat',
        providerId: resolved.providerId,
        providerPresetId: resolveProviderPresetId(resolved),
        extras: resolved.extras?.model
          ? {
            model: resolved.extras.model
          }
          : undefined,
        messages: titleMessages,
        persist: false
      });
      let title = '';
      const shouldFallbackToLegacy = !this.piSessionService.getAvailability(titleReq).available;

      try {
        title = await generatePiConversationTitle({
          assistantContent,
          model: resolved.extras?.model as string | undefined,
          providerId: resolved.providerId,
          providerPresetId: resolveProviderPresetId(resolved),
          userContent
        });
      } catch (error) {
        if (!shouldFallbackToLegacy) {
          throw error;
        }

        console.warn('[ChatService] Pi title generation unavailable, falling back to legacy:', error);
        const resp = await this.chatEphemeral(this.defaultWin, titleReq);
        title = normalizeGeneratedConversationTitle(resp?.message?.content || '');
      }

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
