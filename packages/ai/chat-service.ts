import { randomUUID } from 'node:crypto';

import { BrowserWindow, ipcMain, WebContents } from 'electron';

import { ChatRepo, WorkspacesRepo } from '../common/db';
import { eventManager } from '../event';
import { AppEvent } from '../event/events';
import { emitAiUsageObservedEvent } from './analytics/events';
import { AI_USAGE_CATEGORIES, AI_USAGE_FEATURES, AI_USAGE_SOURCE_TYPES, AI_USAGE_STAGES, type RecordAiUsageEventInput } from './analytics/types';
import { buildConversationPlaceholderTitle, normalizeGeneratedConversationTitle } from './conversation-title';
import { getChatMessageUsage, withChatMessageUsage } from './message-usage';
import { normalizeProviderPreset, resolveProviderPresetId } from './provider-preset';
import { getProviderDefinitionSchema } from './providers/service';
import { PiExecutionService } from './runtime/pi/execution-service';
import { readProviderRequestId } from './runtime/pi/provider-request-id';
import { PiSessionService } from './runtime/pi/session-service';
import { generatePiConversationTitle } from './runtime/pi/tasks/title';
import type { AgentLoopCompletePayload } from './services/memory-types';
import { attachSpeechDisplayTextFilterToMessage, getRealtimeSpeechDisplayTextFilter } from './speech-display-filter';
import { appendRealtimeSpeechPromptGuidance } from './speech-synthesis-guidance';
import { createThinkingTagStreamParser, extractThinkingTextFromMetadata, readThinkingBlocksFromMetadata, splitThinkingTagsFromText, type ThinkingMetadataBlock } from './thinking-content';
import {
  CHAT_MESSAGE_DISPLAY_PARTS_METADATA_KEY,
  ChatMessage,
  ChatMessageDisplayPart,
  ChatRequest,
  ChatResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  StreamEvent,
  type ToolCallDisplay
} from './types';

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

type ChatUsageOverride = Partial<Pick<RecordAiUsageEventInput, 'operationKey' | 'sourceType' | 'sourceId' | 'sourceLabel' | 'usageCategory' | 'usageFeature' | 'usageStage'>> & {
  metadata?: Record<string, unknown>;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function shouldNormalizeInlineThinkingTags(providerId?: string): boolean {
  return providerId === 'minimax';
}

function toThinkingBlocks(thinking: string): ThinkingMetadataBlock[] | undefined {
  if (!thinking.trim()) {
    return undefined;
  }

  return [{ type: 'thinking', thinking }];
}

function getSpriteRealtimeSpeechScope(req: ChatRequest): 'mainChat' | 'resourceChatSidebar' | undefined {
  const scope = req.extras?.spriteRealtimeSpeechScope;
  return scope === 'mainChat' || scope === 'resourceChatSidebar' ? scope : undefined;
}

function appendTextDisplayPart(parts: ChatMessageDisplayPart[], text: string): void {
  const last = parts[parts.length - 1];
  if (last?.type === 'text') {
    last.text += text;
    return;
  }

  parts.push({ text, type: 'text' });
}

function appendThinkingDisplayPart(parts: ChatMessageDisplayPart[], thinking: string): void {
  const last = parts[parts.length - 1];
  if (last?.type === 'thinking') {
    last.thinking += thinking;
    return;
  }

  parts.push({ thinking, type: 'thinking' });
}

function appendToolDisplayPart(parts: ChatMessageDisplayPart[], callId: string): void {
  if (!callId || parts.some((part) => part.type === 'tool' && part.callId === callId)) {
    return;
  }

  parts.push({ callId, type: 'tool' });
}

function extractResourceContextIds(req: ChatRequest, messages?: ChatMessage[], toolCalls?: Array<{ args?: any; name?: string; result?: any }>): string[] {
  const ids = new Set<string>();
  const visit = (value: unknown, hint?: string): void => {
    if (!value) return;
    if (typeof value === 'string') {
      for (const match of value.matchAll(/\[card:(?:resource|video|audio|image|document|link|file):([a-zA-Z0-9_-]+)\]/g)) {
        ids.add(match[1]);
      }
      if ((hint === 'resource-id' || hint === 'resource') && value.trim()) {
        ids.add(value.trim());
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, hint));
      return;
    }
    if (typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (hint === 'resource' && typeof record.id === 'string' && record.id.trim()) {
      ids.add(record.id.trim());
    }
    for (const key of ['resourceId', 'resourceIds']) {
      visit(record[key], 'resource-id');
    }
    visit(record.resources, 'resource');
    for (const key of ['content', 'text', 'parts', 'messages']) {
      visit(record[key]);
    }
  };

  visit(req.extras);
  visit(messages ?? req.messages);
  visit(toolCalls);
  return Array.from(ids);
}

function shouldAppendToolDisplayPart(display?: ToolCallDisplay): boolean {
  return display?.mode !== 'hidden';
}

function normalizeDisplayParts(parts: ChatMessageDisplayPart[]): ChatMessageDisplayPart[] | undefined {
  const normalized = parts.filter((part) => {
    if (part.type === 'text') return !!part.text;
    if (part.type === 'thinking') return !!part.thinking;
    return !!part.callId;
  });

  if (!normalized.length || isLegacyEquivalentDisplayParts(normalized)) {
    return undefined;
  }

  return normalized;
}

function isLegacyEquivalentDisplayParts(parts: ChatMessageDisplayPart[]): boolean {
  let phase: 'thinking' | 'tool' | 'text' = 'thinking';

  for (const part of parts) {
    if (part.type === 'thinking') {
      if (phase !== 'thinking') return false;
      continue;
    }

    if (part.type === 'tool') {
      if (phase === 'text') return false;
      phase = 'tool';
      continue;
    }

    phase = 'text';
  }

  return true;
}

function attachDisplayParts(message: ChatMessage, parts: ChatMessageDisplayPart[]): ChatMessage {
  const displayParts = normalizeDisplayParts(parts);
  if (!displayParts) {
    return message;
  }

  return {
    ...message,
    metadata: {
      ...(message.metadata || {}),
      [CHAT_MESSAGE_DISPLAY_PARTS_METADATA_KEY]: displayParts
    }
  };
}

function finalizeDisplayParts(parts: ChatMessageDisplayPart[], message?: ChatMessage): ChatMessageDisplayPart[] {
  const next = parts.slice();

  if (message) {
    const thinking = extractThinkingTextFromMetadata(message.metadata);
    const thinkingPartIndexes = next.flatMap((part, index) => (part.type === 'thinking' && part.thinking ? [index] : []));
    if (thinkingPartIndexes.length === 1 && thinking) {
      next[thinkingPartIndexes[0]] = { thinking, type: 'thinking' };
    } else if (thinkingPartIndexes.length === 0 && thinking) {
      next.unshift({ thinking, type: 'thinking' });
    }

    const textPartIndexes = next.flatMap((part, index) => (part.type === 'text' && part.text ? [index] : []));
    if (textPartIndexes.length === 1 && message.content) {
      next[textPartIndexes[0]] = { text: message.content, type: 'text' };
    } else if (textPartIndexes.length === 0 && message.content) {
      next.push({ text: message.content, type: 'text' });
    }
  }

  return normalizeDisplayParts(next) || [];
}

function normalizeAssistantThinkingMessage(
  message: ChatMessage | undefined,
  options: {
    fallbackContent?: string;
    fallbackThinking?: string;
    providerId?: string;
  }
): ChatMessage | undefined {
  if (!message) {
    return undefined;
  }

  const metadata = isPlainRecord(message.metadata) ? message.metadata : undefined;
  const existingBlocks = readThinkingBlocksFromMetadata(metadata);
  const metadataThinking = extractThinkingTextFromMetadata(metadata);
  const inlineThinking = typeof message.content === 'string' && shouldNormalizeInlineThinkingTags(options.providerId) ? splitThinkingTagsFromText(message.content) : undefined;
  const normalizedContent = options.fallbackContent ?? (inlineThinking?.hadThinkingTags ? inlineThinking.content : message.content);
  const normalizedThinking = options.fallbackThinking ?? metadataThinking ?? inlineThinking?.thinking;
  const normalizedBlocks = existingBlocks || (normalizedThinking ? toThinkingBlocks(normalizedThinking) : undefined);

  if (normalizedContent === message.content && normalizedBlocks === existingBlocks) {
    return message;
  }

  return {
    ...message,
    content: normalizedContent,
    ...(normalizedBlocks ? { metadata: { ...(metadata || {}), thinkingBlocks: normalizedBlocks } } : metadata ? { metadata } : {})
  };
}

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
    const streamReq = this.withRealtimeSpeechPrompt({
      ...req,
      requestId
    });
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

${JSON.stringify(forcePiRuntime(streamReq), null, 2)}
=========================================================
`);
        await this.chatStreamWithPi(sender, forcePiRuntime(streamReq), emit, ctrl);
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
    const runtimeReq: ChatRequest = {
      ...req,
      requestId: req.requestId || safeUuid()
    };
    const usageOverride = this.resolveUsageOverride(runtimeReq);
    const preview = await this.piSessionService.preview(runtimeReq);
    const providerPresetId = resolveProviderPresetId(req);

    if (!preview.availability.available) {
      throw new Error(preview.availability.reason || 'Pi runtime packages are not installed yet.');
    }

    const lastUserMessage = this.getLastUserMessage(req.messages);
    const placeholderTitle = this.buildPlaceholderConversationTitle(lastUserMessage?.content);
    const conv = await this.ensureHistoricalConversationRecord({
      id: runtimeReq.conversationId,
      agentId: runtimeReq.agentId || preview.resolved.profile.id,
      providerId: preview.resolved.model.providerId,
      providerPresetId,
      title: placeholderTitle || undefined,
      workspaceId: await this.resolveWorkspaceId(runtimeReq)
    });

    if (lastUserMessage) {
      await this.persistConversationMessage(conv.id, lastUserMessage);
    }

    const startedAt = Date.now();
    let resp: ChatResponse;

    try {
      resp = await this.piSessionService.chat({
        ...runtimeReq,
        conversationId: conv.id
      });
    } catch (error) {
      await this.recordChatUsageEvent({
        agentId: runtimeReq.agentId || preview.resolved.profile.id,
        completedAt: Date.now(),
        conversationId: conv.id,
        model: preview.resolved.model.modelId,
        providerId: preview.resolved.model.providerId,
        providerPresetId,
        requestId: runtimeReq.requestId!,
        startedAt,
        status: 'failed',
        usageOverride,
        workspaceId: conv.workspaceId || undefined
      });
      throw error;
    }

    resp = {
      ...resp,
      ...(resp.message
        ? {
            message: attachSpeechDisplayTextFilterToMessage(
              normalizeAssistantThinkingMessage(resp.message, {
                providerId: preview.resolved.model.canonicalProviderId
              }) || resp.message,
              getRealtimeSpeechDisplayTextFilter(runtimeReq.extras)
            )
          }
        : {})
    };

    let assistantMessageId: string | undefined;
    if (resp.message) {
      try {
        assistantMessageId = (await this.persistConversationMessage(conv.id, resp.message)).id;
      } catch (error) {
        console.warn('[ChatService] Failed to persist assistant conversation message:', error);
      }
    }

    await this.recordChatUsageEvent({
      agentId: resp.agentId || runtimeReq.agentId || preview.resolved.profile.id,
      assistantMessageId,
      completedAt: Date.now(),
      conversationId: conv.id,
      model: String(resp.metadata?.model || preview.resolved.model.modelId),
      providerId: resp.providerId || preview.resolved.model.providerId,
      providerPresetId,
      providerRequestId: this.getProviderRequestId(resp.message?.metadata) ?? this.getProviderRequestId(resp.metadata),
      rawUsage: this.getMessageRawUsage(resp.message) ?? resp.metadata?.rawUsage,
      requestId: runtimeReq.requestId!,
      startedAt,
      status: 'completed',
      usage: resp.usage || getChatMessageUsage(resp.message),
      usageOverride,
      workspaceId: conv.workspaceId || undefined
    });

    return {
      ...resp,
      metadata: {
        ...(resp.metadata || {}),
        conversationId: conv.id
      }
    } as any;
  }

  private async chatStreamWithPi(sender: WebContents, req: ChatRequest, emit: (event: StreamEvent) => void, ctrl: AbortController): Promise<void> {
    const requestId = req.requestId || safeUuid();
    const usageOverride = this.resolveUsageOverride(req);
    const preview = await this.piSessionService.preview(req);
    const providerPresetId = resolveProviderPresetId(req);

    if (!preview.availability.available) {
      await this.piSessionService.chatStream(req, emit, ctrl.signal);
      return;
    }

    const shouldPersist = req.persist !== false;
    const lastUserMessage = this.getLastUserMessage(req.messages);
    const placeholderTitle = this.buildPlaceholderConversationTitle(lastUserMessage?.content);
    const resolvedWorkspaceId = await this.resolveWorkspaceId(req);
    let conv = undefined;

    if (shouldPersist) {
      conv = await this.ensureHistoricalConversationRecord({
        id: req.conversationId,
        agentId: req.agentId || preview.resolved.profile.id,
        providerId: preview.resolved.model.providerId,
        providerPresetId,
        title: placeholderTitle || undefined,
        workspaceId: resolvedWorkspaceId
      });
    }

    if (shouldPersist && lastUserMessage && conv) {
      await this.persistConversationMessageSafely(conv.id, lastUserMessage, emit, 'user');
    }

    let contextMessages: ChatMessage[] | undefined = (req.messages || []).length ? req.messages : undefined;
    if (!contextMessages && shouldPersist && conv?.id) {
      contextMessages = await this.loadConversationContextMessages(conv.id);
    }

    const streamMessages = appendRealtimeSpeechPromptGuidance(this.selectRecentMessages(contextMessages) || req.messages, req.extras);
    const targetWindowId = BrowserWindow.fromWebContents(sender)?.id;
    const streamRequest: ChatRequest = {
      ...req,
      requestId,
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
    const startedAt = Date.now();
    const collectedToolCalls: Array<{ callId: string; name: string; args?: any; label?: string; display?: ToolCallDisplay; result?: any }> = [];
    const displayParts: ChatMessageDisplayPart[] = [];
    const inlineThinkingParser = shouldNormalizeInlineThinkingTags(preview.resolved.model.canonicalProviderId) ? createThinkingTagStreamParser() : undefined;
    const speechDisplayTextFilter = getRealtimeSpeechDisplayTextFilter(req.extras);

    const spriteRealtimeSpeechScope = getSpriteRealtimeSpeechScope(req);
    eventManager.emit(AppEvent.SPRITE_AI_START, {
      message: '思考中...',
      ...(spriteRealtimeSpeechScope ? { spriteRealtimeSpeechScope } : {})
    });

    try {
      await this.piSessionService.chatStream(
        streamRequest,
        (event) => {
          const emitInlineThinkingSegments = (segments: Array<{ kind: 'text' | 'thinking'; text: string }>): void => {
            for (const segment of segments) {
              if (!segment.text) continue;

              if (segment.kind === 'thinking') {
                thinkingText += segment.text;
                appendThinkingDisplayPart(displayParts, segment.text);
                emit({ type: 'thinking_delta', data: { text: segment.text } });
                continue;
              }

              fullText += segment.text;
              appendTextDisplayPart(displayParts, segment.text);
              emit({ type: 'delta', data: { text: segment.text } });
            }
          };

          if (event.type === 'connected') {
            emit(event);
            if (!emittedConversationMetadata && (conv || speechDisplayTextFilter)) {
              emit({
                type: 'metadata',
                data: {
                  ...(conv ? { conversationId: conv.id, title: conv.title || null } : {}),
                  ...(speechDisplayTextFilter ? { speechDisplayTextFilter } : {})
                }
              });
              emittedConversationMetadata = true;
            }
            return;
          }

          if (event.type === 'delta' && event.data?.text && inlineThinkingParser) {
            emitInlineThinkingSegments(inlineThinkingParser.push(event.data.text));
            return;
          }

          if (event.type === 'delta' && event.data?.text) {
            fullText += event.data.text;
            appendTextDisplayPart(displayParts, event.data.text);
          }

          if (event.type === 'thinking_delta' && event.data?.text) {
            thinkingText += event.data.text;
            appendThinkingDisplayPart(displayParts, event.data.text);
          }

          if (event.type === 'message_completed' && event.data?.message) {
            if (inlineThinkingParser) {
              emitInlineThinkingSegments(inlineThinkingParser.flush());
            }

            finalMessage =
              normalizeAssistantThinkingMessage(event.data.message, {
                fallbackContent: fullText || undefined,
                fallbackThinking: thinkingText || undefined,
                providerId: preview.resolved.model.canonicalProviderId
              }) || event.data.message;

            const metadataThinking = extractThinkingTextFromMetadata(finalMessage.metadata);
            if (!thinkingText && metadataThinking) {
              thinkingText = metadataThinking;
            }

            if (!fullText && finalMessage.content) {
              fullText = finalMessage.content;
            }

            finalMessage = attachSpeechDisplayTextFilterToMessage(attachDisplayParts(finalMessage, finalizeDisplayParts(displayParts, finalMessage)), speechDisplayTextFilter);

            emit({
              ...event,
              data: {
                ...(event.data || {}),
                message: finalMessage
              }
            });
            return;
          }

          if (event.type === 'tool_call' && event.data) {
            collectedToolCalls.push({ callId: event.data.callId, name: event.data.name, args: event.data.args, label: event.data.label, display: event.data.display });
            if (shouldAppendToolDisplayPart(event.data.display)) {
              appendToolDisplayPart(displayParts, event.data.callId);
            }
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
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      await this.recordChatUsageEvent({
        agentId: req.agentId || preview.resolved.profile.id,
        completedAt: Date.now(),
        conversationId: conv?.id || req.conversationId,
        model: preview.resolved.model.modelId,
        providerId: preview.resolved.model.providerId,
        providerPresetId,
        requestId,
        startedAt,
        status: ctrl.signal.aborted ? 'cancelled' : 'failed',
        usageOverride,
        workspaceId: conv?.workspaceId || resolvedWorkspaceId
      });
      throw error;
    }

    if (!finalMessage && inlineThinkingParser) {
      for (const segment of inlineThinkingParser.flush()) {
        if (segment.kind === 'thinking') {
          thinkingText += segment.text;
        } else {
          fullText += segment.text;
        }
      }
    }

    if (!finalMessage && fullText) {
      finalMessage = {
        content: fullText,
        createdAt: Date.now(),
        role: 'assistant',
        ...(thinkingText ? { metadata: { thinkingBlocks: [{ type: 'thinking', thinking: thinkingText }] } } : {})
      };
    }

    finalMessage =
      normalizeAssistantThinkingMessage(finalMessage, {
        fallbackContent: fullText || undefined,
        fallbackThinking: thinkingText || undefined,
        providerId: preview.resolved.model.canonicalProviderId
      }) || finalMessage;

    if (finalMessage) {
      finalMessage = attachSpeechDisplayTextFilterToMessage(attachDisplayParts(finalMessage, finalizeDisplayParts(displayParts, finalMessage)), speechDisplayTextFilter);
    }

    if (finalMessage && collectedToolCalls.length > 0) {
      finalMessage = { ...finalMessage, metadata: { ...finalMessage.metadata, toolCalls: collectedToolCalls } };
    }

    const assistantMessageId = conv && finalMessage ? await this.persistConversationMessageSafely(conv.id, finalMessage, emit, 'assistant') : undefined;

    await this.recordChatUsageEvent({
      agentId: req.agentId || preview.resolved.profile.id,
      assistantMessageId,
      completedAt: Date.now(),
      conversationId: conv?.id || req.conversationId,
      model: preview.resolved.model.modelId,
      providerId: preview.resolved.model.providerId,
      providerPresetId,
      providerRequestId: this.getProviderRequestId(finalMessage?.metadata),
      rawUsage: this.getMessageRawUsage(finalMessage),
      requestId,
      startedAt,
      status: ctrl.signal.aborted ? 'cancelled' : errorMessage && !finalMessage ? 'failed' : 'completed',
      usage: finalMessage ? getChatMessageUsage(finalMessage) : undefined,
      usageOverride,
      workspaceId: conv?.workspaceId || resolvedWorkspaceId
    });

    if (conv && finalMessage?.content && this.shouldAutoGenerateConversationTitle(conv.title, placeholderTitle)) {
      this.generateConversationTitle(conv.id, lastUserMessage?.content || '', finalMessage.content, req, placeholderTitle).catch((e) => {
        console.warn('[ChatService] Auto title generation failed:', e);
      });
    }

    if (errorMessage) {
      eventManager.emit(AppEvent.SPRITE_AI_ERROR, {
        message: errorMessage,
        ...(spriteRealtimeSpeechScope ? { spriteRealtimeSpeechScope } : {})
      });
    } else {
      const resourceContextIds = extractResourceContextIds(req, streamMessages, collectedToolCalls);
      eventManager.emit(AppEvent.SPRITE_AI_COMPLETE, {
        conversationId: conv?.id,
        messageCount: streamMessages.length,
        toolCallCount: collectedToolCalls.length,
        assistantContentLength: fullText.length,
        hasResourceContext: resourceContextIds.length > 0,
        resourceIds: resourceContextIds,
        ...(spriteRealtimeSpeechScope ? { spriteRealtimeSpeechScope } : {})
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
    const requestWithRealtimeSpeechPrompt = this.withRealtimeSpeechPrompt(normalizedRequest);
    return this.piSessionService.shouldHandle(requestWithRealtimeSpeechPrompt) ? requestWithRealtimeSpeechPrompt : forcePiRuntime(requestWithRealtimeSpeechPrompt);
  }

  private withRealtimeSpeechPrompt(req: ChatRequest): ChatRequest {
    return {
      ...req,
      messages: appendRealtimeSpeechPromptGuidance(req.messages || [], req.extras)
    };
  }

  private getLastUserMessage(messages?: ChatMessage[]): ChatMessage | undefined {
    return (messages || [])
      .slice()
      .reverse()
      .find((message) => message.role === 'user');
  }

  private async persistConversationMessage(conversationId: string, message: ChatMessage): Promise<Awaited<ReturnType<typeof ChatRepo.addMessage>>> {
    const metadata = withChatMessageUsage(message.metadata, getChatMessageUsage(message));
    return ChatRepo.addMessage(conversationId, {
      content: message.content,
      createdAt: message.createdAt || Date.now(),
      metadata: metadata ? (JSON.stringify(metadata) as any) : null,
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
    title?: string;
    workspaceId?: string;
  }): Promise<Awaited<ReturnType<typeof ChatRepo.ensureConversation>>> {
    const { agentId, id, providerId, providerPresetId, title, workspaceId } = params;

    return ChatRepo.ensureConversation({
      id,
      agentId,
      providerId,
      providerPresetId,
      title,
      workspaceId
    });
  }

  private async resolveWorkspaceId(req: ChatRequest): Promise<string | undefined> {
    const requestedWorkspaceId = typeof req.extras?.workspaceId === 'string' && req.extras.workspaceId.trim() ? req.extras.workspaceId.trim() : undefined;
    if (requestedWorkspaceId) return requestedWorkspaceId;

    if (req.conversationId) {
      const existing = await ChatRepo.getConversation(req.conversationId);
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

        const usage = getChatMessageUsage({ metadata });

        return {
          content: row.content,
          createdAt: row.createdAt ?? undefined,
          metadata,
          name: row.name ?? undefined,
          role: row.role as ChatMessage['role'],
          ...(usage ? { usage } : {}),
          toolCallId: row.toolCallId ?? undefined
        };
      });
    } catch (error) {
      console.warn('[ChatService] Failed to load conversation context messages:', error);
      return undefined;
    }
  }

  private async persistConversationMessageSafely(conversationId: string, message: ChatMessage, emit: (event: StreamEvent) => void, phase: 'assistant' | 'user'): Promise<string | undefined> {
    try {
      const row = await this.persistConversationMessage(conversationId, message);
      return row.id;
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
      return undefined;
    }
  }

  private selectRecentMessages(messages?: ChatMessage[]): ChatMessage[] | undefined {
    if (!messages?.length) return undefined;

    const systemMessages = messages.filter((message) => message.role === 'system');
    const dialogMessages = messages.filter((message) => message.role !== 'system');

    return [...systemMessages, ...dialogMessages.slice(-6)];
  }

  private buildPlaceholderConversationTitle(userContent?: string): string {
    return userContent ? buildConversationPlaceholderTitle(userContent) : '';
  }

  private getMessageRawUsage(message?: ChatMessage | null): unknown {
    if (!message?.metadata || typeof message.metadata !== 'object') {
      return undefined;
    }

    return (message.metadata as Record<string, unknown>).piRawUsage;
  }

  private getProviderRequestId(value?: unknown): string | undefined {
    return readProviderRequestId(value);
  }

  private resolveUsageOverride(req: ChatRequest): ChatUsageOverride | undefined {
    const rawOverride = req.extras?.analyticsUsage;
    if (!isPlainRecord(rawOverride)) {
      return undefined;
    }

    const sourceType =
      typeof rawOverride.sourceType === 'string' && AI_USAGE_SOURCE_TYPES.includes(rawOverride.sourceType as (typeof AI_USAGE_SOURCE_TYPES)[number]) ? rawOverride.sourceType : undefined;
    const usageCategory =
      typeof rawOverride.usageCategory === 'string' && AI_USAGE_CATEGORIES.includes(rawOverride.usageCategory as (typeof AI_USAGE_CATEGORIES)[number]) ? rawOverride.usageCategory : undefined;
    const usageFeature =
      typeof rawOverride.usageFeature === 'string' && AI_USAGE_FEATURES.includes(rawOverride.usageFeature as (typeof AI_USAGE_FEATURES)[number]) ? rawOverride.usageFeature : undefined;
    const usageStage = typeof rawOverride.usageStage === 'string' && AI_USAGE_STAGES.includes(rawOverride.usageStage as (typeof AI_USAGE_STAGES)[number]) ? rawOverride.usageStage : undefined;
    const operationKey = typeof rawOverride.operationKey === 'string' && rawOverride.operationKey.trim() ? rawOverride.operationKey.trim() : undefined;
    const sourceId = typeof rawOverride.sourceId === 'string' && rawOverride.sourceId.trim() ? rawOverride.sourceId.trim() : undefined;
    const sourceLabel = typeof rawOverride.sourceLabel === 'string' && rawOverride.sourceLabel.trim() ? rawOverride.sourceLabel.trim() : undefined;
    const metadata = isPlainRecord(rawOverride.metadata) ? rawOverride.metadata : undefined;
    const hasClassificationOverride = !!sourceType || !!usageCategory || !!usageFeature || !!usageStage;
    const shouldApplyClassificationOverride = !!sourceType && !!usageCategory && !!usageFeature && !!usageStage;

    if (!hasClassificationOverride && !operationKey && !sourceId && !sourceLabel && !metadata) {
      return undefined;
    }

    const classificationOverride: Partial<ChatUsageOverride> = shouldApplyClassificationOverride
      ? {
          sourceType: sourceType as ChatUsageOverride['sourceType'],
          usageCategory: usageCategory as ChatUsageOverride['usageCategory'],
          usageFeature: usageFeature as ChatUsageOverride['usageFeature'],
          usageStage: usageStage as ChatUsageOverride['usageStage']
        }
      : {};

    return {
      ...(metadata ? { metadata } : {}),
      ...(operationKey ? { operationKey } : {}),
      ...(sourceId ? { sourceId } : {}),
      ...(sourceLabel ? { sourceLabel } : {}),
      ...classificationOverride
    };
  }

  private async recordUsageEventSafely(input: RecordAiUsageEventInput): Promise<void> {
    const workflowAttempt = input.metadata?.workflowAttempt;
    const attemptIndex = typeof workflowAttempt === 'number' && Number.isInteger(workflowAttempt) && workflowAttempt > 0 ? workflowAttempt - 1 : undefined;
    await emitAiUsageObservedEvent({ ...input, ...(input.attemptIndex === undefined && attemptIndex !== undefined ? { attemptIndex } : {}) }, { producer: 'ChatService' });
  }

  private async recordChatUsageEvent(params: {
    assistantMessageId?: string;
    workspaceId?: string;
    requestId: string;
    conversationId?: string;
    providerId: string;
    providerPresetId?: string;
    model: string;
    agentId?: string;
    status: 'completed' | 'failed' | 'cancelled';
    providerRequestId?: string;
    usage?: ChatResponse['usage'];
    rawUsage?: unknown;
    startedAt: number;
    completedAt: number;
    usageOverride?: ChatUsageOverride;
  }): Promise<void> {
    const usageOverride = params.usageOverride;

    await this.recordUsageEventSafely({
      workspaceId: params.workspaceId,
      traceId: params.requestId,
      requestId: params.requestId,
      operationKey: usageOverride?.operationKey || 'reply',
      conversationId: params.conversationId,
      sourceType: usageOverride?.sourceType || 'chat',
      sourceId: usageOverride?.sourceId || params.conversationId || params.requestId,
      sourceLabel: usageOverride?.sourceLabel || '聊天',
      usageCategory: usageOverride?.usageCategory || 'conversation',
      usageFeature: usageOverride?.usageFeature || 'chat',
      usageStage: usageOverride?.usageStage || 'generate',
      providerId: params.providerId,
      providerPresetId: params.providerPresetId,
      providerRequestId: params.providerRequestId,
      model: params.model,
      agentId: params.agentId,
      status: params.status,
      usage: params.usage
        ? {
            billableInputTokens: params.usage.billableInputTokens,
            billableOutputTokens: params.usage.billableOutputTokens,
            billableTotalTokens: params.usage.billableTotalTokens,
            cacheReadTokens: params.usage.cacheReadTokens,
            cacheWriteTokens: params.usage.cacheWriteTokens,
            estimatedCost: params.usage.cost,
            inputTokens: params.usage.inputTokens,
            outputTokens: params.usage.outputTokens,
            reasoningTokens: params.usage.reasoningTokens,
            totalTokens: params.usage.totalTokens
          }
        : undefined,
      rawUsage: params.rawUsage,
      meteringSource: 'provider_reported',
      startedAt: params.startedAt,
      completedAt: params.completedAt,
      metadata: {
        ...(params.assistantMessageId ? { assistantMessageId: params.assistantMessageId } : {}),
        conversationId: params.conversationId || null,
        runtime: 'pi',
        ...(usageOverride?.metadata || {})
      }
    });
  }

  private async recordConversationTitleUsageEvent(params: {
    workspaceId?: string;
    requestId: string;
    conversationId: string;
    providerId: string;
    providerPresetId?: string;
    model: string;
    status: 'completed' | 'failed' | 'cancelled';
    providerRequestId?: string;
    usage?: ChatResponse['usage'];
    rawUsage?: unknown;
    startedAt: number;
    completedAt: number;
    runtime?: string;
  }): Promise<void> {
    await this.recordUsageEventSafely({
      workspaceId: params.workspaceId,
      traceId: params.requestId,
      requestId: params.requestId,
      operationKey: 'generate',
      conversationId: params.conversationId,
      sourceType: 'conversation_title',
      sourceId: params.conversationId,
      sourceLabel: '对话标题',
      usageCategory: 'conversation',
      usageFeature: 'conversation_title',
      usageStage: 'generate',
      providerId: params.providerId,
      providerPresetId: params.providerPresetId,
      providerRequestId: params.providerRequestId,
      model: params.model,
      agentId: 'chat',
      status: params.status,
      usage: params.usage
        ? {
            billableInputTokens: params.usage.billableInputTokens,
            billableOutputTokens: params.usage.billableOutputTokens,
            billableTotalTokens: params.usage.billableTotalTokens,
            cacheReadTokens: params.usage.cacheReadTokens,
            cacheWriteTokens: params.usage.cacheWriteTokens,
            estimatedCost: params.usage.cost,
            inputTokens: params.usage.inputTokens,
            outputTokens: params.usage.outputTokens,
            reasoningTokens: params.usage.reasoningTokens,
            totalTokens: params.usage.totalTokens
          }
        : undefined,
      rawUsage: params.rawUsage,
      meteringSource: 'provider_reported',
      startedAt: params.startedAt,
      completedAt: params.completedAt,
      metadata: {
        conversationId: params.conversationId,
        runtime: params.runtime || 'pi'
      }
    });
  }

  private shouldAutoGenerateConversationTitle(currentTitle?: string | null, placeholderTitle?: string): boolean {
    const normalizedCurrentTitle = (currentTitle || '').trim();
    const normalizedPlaceholderTitle = (placeholderTitle || '').trim();
    if (!normalizedCurrentTitle) return true;
    return !!normalizedPlaceholderTitle && normalizedCurrentTitle === normalizedPlaceholderTitle;
  }

  /**
   * Generate a conversation title using AI in the main process.
   * Runs in the background after the first assistant reply.
   * Broadcasts the updated title to all renderer windows.
   */
  private async generateConversationTitle(conversationId: string, userContent: string, assistantContent: string, resolved: ChatRequest, placeholderTitle: string): Promise<void> {
    // Notify all windows that title generation has started (for shimmer animation)
    this.broadcastToAllWindows(CONV_TITLE_UPDATED_CHANNEL, { conversationId, title: null, status: 'generating' });
    const titleRequestId = safeUuid();
    const titleStartedAt = Date.now();
    const providerPresetId = resolveProviderPresetId(resolved);
    const baseConversation = await ChatRepo.getConversation(conversationId).catch((error) => {
      console.warn('[ChatService] Failed to load base conversation for title usage tracking:', error);
      return null;
    });
    const titleWorkspaceId = baseConversation?.workspaceId || undefined;
    let usageRecorded = false;

    try {
      const titleMessages: ChatMessage[] = [
        { role: 'system', content: '你是一个标题生成助手。请根据以下用户和AI的对话内容，生成一个简洁的对话标题（不超过20个字）。只输出标题本身，不要加引号、前缀或解释。' },
        { role: 'user', content: `用户: ${userContent}\nAI: ${assistantContent.slice(0, 500)}` }
      ];
      const titleReq: ChatRequest = normalizeProviderPreset({
        agentId: 'chat',
        providerId: resolved.providerId,
        providerPresetId,
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
      let titleUsage: {
        model?: string;
        providerRequestId?: string;
        providerId?: string;
        rawUsage?: unknown;
        runtime?: string;
        usage?: ChatResponse['usage'];
      } = {};

      try {
        const titleResult = await generatePiConversationTitle({
          assistantContent,
          model: resolved.extras?.model as string | undefined,
          providerId: resolved.providerId,
          providerPresetId,
          userContent
        });
        title = titleResult.title;
        titleUsage = {
          model: titleResult.model,
          providerRequestId: titleResult.providerRequestId,
          providerId: titleResult.providerId,
          rawUsage: titleResult.rawUsage,
          runtime: titleResult.runtime,
          usage: titleResult.usage
        };
      } catch (error) {
        if (!shouldFallbackToLegacy) {
          throw error;
        }

        console.warn('[ChatService] Pi title generation unavailable, falling back to legacy:', error);
        const resp = await this.chatEphemeral(this.defaultWin, titleReq);
        title = normalizeGeneratedConversationTitle(resp?.message?.content || '');
        titleUsage = {
          model: typeof resp.metadata?.model === 'string' ? resp.metadata.model : (resolved.extras?.model as string | undefined),
          providerRequestId: this.getProviderRequestId(resp.message?.metadata) ?? this.getProviderRequestId(resp.metadata),
          providerId: resp.providerId || resolved.providerId,
          rawUsage: this.getMessageRawUsage(resp.message) ?? resp.metadata?.rawUsage,
          runtime: typeof resp.metadata?.runtime === 'string' ? resp.metadata.runtime : 'pi',
          usage: resp.usage || getChatMessageUsage(resp.message)
        };
      }

      await this.recordConversationTitleUsageEvent({
        completedAt: Date.now(),
        conversationId,
        model: titleUsage.model || (resolved.extras?.model as string | undefined) || 'unknown',
        providerId: titleUsage.providerId || resolved.providerId,
        providerPresetId,
        providerRequestId: titleUsage.providerRequestId,
        rawUsage: titleUsage.rawUsage,
        requestId: titleRequestId,
        runtime: titleUsage.runtime,
        startedAt: titleStartedAt,
        status: 'completed',
        usage: titleUsage.usage,
        workspaceId: titleWorkspaceId
      });
      usageRecorded = true;

      const latestConversation = await ChatRepo.getConversation(conversationId);
      if (latestConversation && !this.shouldAutoGenerateConversationTitle(latestConversation.title, placeholderTitle)) {
        this.broadcastToAllWindows(CONV_TITLE_UPDATED_CHANNEL, { conversationId, title: latestConversation.title || null, status: 'done' });
        return;
      }

      if (title && title.length > 0) {
        await ChatRepo.renameConversation(conversationId, title);
        this.broadcastToAllWindows(CONV_TITLE_UPDATED_CHANNEL, { conversationId, title, status: 'done' });
      } else {
        this.broadcastToAllWindows(CONV_TITLE_UPDATED_CHANNEL, { conversationId, title: latestConversation?.title || placeholderTitle || null, status: 'done' });
      }
    } catch (e) {
      if (!usageRecorded) {
        await this.recordConversationTitleUsageEvent({
          completedAt: Date.now(),
          conversationId,
          model: (resolved.extras?.model as string | undefined) || 'unknown',
          providerId: resolved.providerId,
          providerPresetId,
          requestId: titleRequestId,
          startedAt: titleStartedAt,
          status: 'failed',
          workspaceId: titleWorkspaceId
        });
      }
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
