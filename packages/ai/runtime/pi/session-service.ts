import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { ChatRequest, ChatResponse, StreamEvent } from '../../types';
import { waitForUserChoice } from '../../user-choice-registry';
import type { PiRuntimeAvailability, PiRuntimePreview, ResolvedPiRequest } from './contracts';
import { resolvePiRequest } from './model-resolver';
import { buildPiModel, buildPiModelHeaders } from './provider-model';
import { isPiRuntimeRequested } from './runtime-switch';
import { PiSessionFactory } from './session-factory';
import { createLegacyAssistantMessage, createLegacyStreamEmitter, normalizePiError } from './stream-adapter';
import { resolvePiToolDescriptors } from './tool-registry';

const require = createRequire(import.meta.url);

const PI_PACKAGE_NAMES = ['@mariozechner/pi-agent-core', '@mariozechner/pi-ai', '@mariozechner/pi-coding-agent', '@mariozechner/pi-tui'];

type PiAiModule = typeof import('@mariozechner/pi-ai');
type PiAgentSessionEvent = import('@mariozechner/pi-coding-agent').AgentSessionEvent;
type PiAgentThinkingLevel = import('@mariozechner/pi-agent-core').ThinkingLevel;
type PiApi = import('@mariozechner/pi-ai').Api;
type PiAssistantMessage = import('@mariozechner/pi-ai').AssistantMessage;
type PiAssistantMessageEvent = import('@mariozechner/pi-ai').AssistantMessageEvent;
type PiContext = import('@mariozechner/pi-ai').Context;
type PiMessage = import('@mariozechner/pi-ai').Message;
type PiModel = import('@mariozechner/pi-ai').Model<PiApi>;
type PiSimpleStreamOptions = import('@mariozechner/pi-ai').SimpleStreamOptions;
type PiThinkingLevel = import('@mariozechner/pi-ai').ThinkingLevel;
type PiUserContentBlock = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };

function hasPackage(pkg: string): boolean {
  try {
    require.resolve(pkg);
    return true;
  } catch (error: any) {
    if (error?.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED' && error?.code !== 'MODULE_NOT_FOUND') {
      return false;
    }
  }

  const packagePath = path.join(process.cwd(), 'node_modules', ...pkg.split('/'), 'package.json');
  return fs.existsSync(packagePath);
}

function getMissingPackages(): string[] {
  return PI_PACKAGE_NAMES.filter((pkg) => !hasPackage(pkg));
}

async function loadPiAi(): Promise<PiAiModule> {
  return import('@mariozechner/pi-ai');
}

function isPlaceholderInstructions(instructions?: string): boolean {
  return !instructions || /will be wired into pi runtime/i.test(instructions);
}

async function resolveProfileInstructions(resolved: ResolvedPiRequest): Promise<string> {
  const fallback = resolved.profile.instructions?.trim();
  return isPlaceholderInstructions(fallback) ? '' : fallback || '';
}

function normalizePiText(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return normalizePiText(content);
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .filter((block): block is { type: 'text'; text: string } => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => normalizePiText(block.text))
    .join('\n');
}

function parseDataUrlImage(url: string): Extract<PiUserContentBlock, { type: 'image' }> | undefined {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(url.trim());
  if (!match) return undefined;

  return {
    data: match[2],
    mimeType: match[1],
    type: 'image'
  };
}

function normalizePiUserContent(content: unknown): string | PiUserContentBlock[] {
  if (typeof content === 'string') {
    return normalizePiText(content);
  }

  if (!Array.isArray(content)) {
    return '';
  }

  const blocks: PiUserContentBlock[] = [];

  for (const block of content) {
    if (block?.type === 'text' && typeof block.text === 'string') {
      blocks.push({
        text: normalizePiText(block.text),
        type: 'text'
      });
      continue;
    }

    if (block?.type === 'image' && typeof block.data === 'string' && typeof block.mimeType === 'string') {
      blocks.push({
        data: block.data,
        mimeType: block.mimeType,
        type: 'image'
      });
      continue;
    }

    if (block?.type === 'image_url' && typeof block.image_url?.url === 'string') {
      const imageBlock = parseDataUrlImage(block.image_url.url);
      if (imageBlock) {
        blocks.push(imageBlock);
      }
    }
  }

  return blocks;
}

function createAssistantHistoryMessage(model: PiModel, content: string, createdAt?: number): PiAssistantMessage {
  return {
    api: model.api,
    content: content
      ? [
        {
          text: normalizePiText(content),
          type: 'text'
        }
      ]
      : [],
    model: model.id,
    provider: model.provider,
    role: 'assistant',
    stopReason: 'stop',
    timestamp: createdAt || Date.now(),
    usage: {
      cacheRead: 0,
      cacheWrite: 0,
      cost: {
        cacheRead: 0,
        cacheWrite: 0,
        input: 0,
        output: 0,
        total: 0
      },
      input: 0,
      output: 0,
      totalTokens: 0
    }
  };
}

function extractAssistantText(message: PiAssistantMessage): string {
  return message.content
    .filter((block): block is Extract<PiAssistantMessage['content'][number], { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

/**
 * 从 PiAssistantMessage 中提取 thinking 块，用于持久化到消息 metadata。
 * 保留 thinkingSignature 以满足 Anthropic 多轮对话中回传 thinking 块的要求。
 */
function extractThinkingBlocks(message: PiAssistantMessage): Array<{ type: 'thinking'; thinking: string; thinkingSignature?: string; redacted?: boolean }> | undefined {
  const blocks = message.content
    .filter((b): b is Extract<PiAssistantMessage['content'][number], { type: 'thinking' }> => b.type === 'thinking')
    .map((b) => {
      const block: { type: 'thinking'; thinking: string; thinkingSignature?: string; redacted?: boolean } = { type: 'thinking', thinking: b.thinking };
      if (b.thinkingSignature) block.thinkingSignature = b.thinkingSignature;
      if (b.redacted) block.redacted = b.redacted;
      return block;
    });
  return blocks.length > 0 ? blocks : undefined;
}

function mapChatHistoryMessage(message: ChatRequest['messages'][number], model: PiModel): PiMessage | undefined {
  const rawContent = message.content as unknown;
  const textContent = extractTextContent(rawContent);
  const timestamp = message.createdAt || Date.now();

  if (message.role === 'user') {
    return {
      content: normalizePiUserContent(rawContent),
      role: 'user',
      timestamp
    };
  }

  if (message.role === 'assistant') {
    const assistantMsg = createAssistantHistoryMessage(model, textContent, timestamp);
    // 从 metadata 恢复 thinking 块，用于多轮对话中回传给 LLM
    const thinkingBlocks = (message.metadata as Record<string, any> | undefined)?.thinkingBlocks;
    if (thinkingBlocks && Array.isArray(thinkingBlocks)) {
      // Thinking 块应在 text 块之前（与模型响应顺序一致）
      assistantMsg.content = [...thinkingBlocks, ...assistantMsg.content];
    }
    return assistantMsg;
  }

  if (message.role === 'tool' && message.toolCallId) {
    return {
      content: textContent
        ? [
          {
            text: textContent,
            type: 'text'
          }
        ]
        : [],
      details: message.metadata,
      isError: false,
      role: 'toolResult',
      timestamp,
      toolCallId: message.toolCallId,
      toolName: message.name || 'tool'
    };
  }

  return undefined;
}

async function buildPiContext(resolved: ResolvedPiRequest, model: PiModel): Promise<PiContext> {
  const profileInstructions = await resolveProfileInstructions(resolved);
  const systemParts: string[] = profileInstructions ? [profileInstructions] : [];
  const messages: PiMessage[] = [];

  for (const message of resolved.messages) {
    if (message.role === 'system') {
      const content = extractTextContent(message.content as unknown).trim();
      if (content) systemParts.push(content);
      continue;
    }

    const mapped = mapChatHistoryMessage(message, model);
    if (mapped) messages.push(mapped);
  }

  if (messages.length === 0) {
    throw new Error('Pi runtime requires at least one non-system message.');
  }

  return {
    ...(systemParts.length ? { systemPrompt: systemParts.join('\n\n') } : {}),
    messages
  };
}

function resolveThinkingLevel(req: ChatRequest): PiThinkingLevel | undefined {
  const raw = String(req.extras?.reasoning || req.extras?.thinking || '')
    .trim()
    .toLowerCase();
  if (!raw) return undefined;

  switch (raw) {
    case 'minimal':
    case 'low':
    case 'medium':
    case 'high':
    case 'xhigh':
      return raw;
    default:
      return undefined;
  }
}

function buildSimpleOptions(resolved: ResolvedPiRequest, signal?: AbortSignal): PiSimpleStreamOptions {
  const headers = buildPiModelHeaders(resolved.model);
  const reasoning = resolveThinkingLevel(resolved.request);

  return {
    ...(resolved.model.apiKey ? { apiKey: resolved.model.apiKey } : {}),
    ...(headers ? { headers } : {}),
    ...(resolved.request.conversationId ? { sessionId: resolved.request.conversationId } : {}),
    ...(typeof resolved.request.maxTokens === 'number' ? { maxTokens: resolved.request.maxTokens } : {}),
    ...(typeof resolved.request.temperature === 'number' ? { temperature: resolved.request.temperature } : {}),
    ...(reasoning ? { reasoning } : {}),
    ...(signal ? { signal } : {})
  };
}

function resolveSessionThinkingLevel(req: ChatRequest): PiAgentThinkingLevel {
  const reasoning = resolveThinkingLevel(req);
  if (reasoning) return reasoning;
  return 'off';
}

function canUseCodingSession(resolved: ResolvedPiRequest): boolean {
  return resolved.profile.executionMode === 'session' && hasPackage('@mariozechner/pi-coding-agent');
}

function resolveToolBridgeState(preview: PiRuntimePreview): 'disabled' | 'partial' | 'planned' | 'ready' {
  if (!preview.resolved.enabledToolIds.length) {
    return 'disabled';
  }

  const readyTools = preview.tools.filter((tool) => tool.status === 'ready-for-pi-runtime');
  if (!readyTools.length) {
    return 'planned';
  }

  return readyTools.length === preview.tools.length ? 'ready' : 'partial';
}

function listReadyPiToolIds(preview: PiRuntimePreview): string[] {
  return preview.tools.filter((tool) => tool.status === 'ready-for-pi-runtime').map((tool) => tool.id);
}

function extractUserPromptText(message: PiMessage): string | undefined {
  if (message.role !== 'user') return undefined;
  if (typeof message.content === 'string') return message.content;

  return message.content
    .filter((block): block is Extract<(typeof message.content)[number], { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function splitSessionPrompt(messages: PiMessage[]): { history: PiMessage[]; prompt: string } | undefined {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'user') return undefined;

  const prompt = extractUserPromptText(lastMessage);
  if (!prompt) return undefined;

  return {
    history: messages.slice(0, -1),
    prompt
  };
}

function findLastAssistantMessage(messages: PiMessage[]): PiAssistantMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'assistant') {
      return message;
    }
  }

  return undefined;
}

function ensurePiCompletion(message: PiAssistantMessage): PiAssistantMessage {
  if (message.stopReason === 'error' || message.stopReason === 'aborted') {
    throw new Error(message.errorMessage || 'Pi runtime execution failed');
  }
  return message;
}

function toChatResponse(message: PiAssistantMessage, resolved: ResolvedPiRequest): ChatResponse {
  return {
    agentId: resolved.profile.id,
    message: {
      content: extractAssistantText(message),
      createdAt: message.timestamp || Date.now(),
      metadata: {
        piProvider: message.provider,
        piStopReason: message.stopReason
      },
      role: 'assistant'
    },
    metadata: {
      model: resolved.model.modelId || message.model,
      profileId: resolved.profile.id,
      providerId: resolved.model.providerId,
      runtime: 'pi'
    },
    providerId: resolved.model.providerId,
    usage: {
      cost: message.usage?.cost?.total,
      inputTokens: message.usage?.input,
      outputTokens: message.usage?.output
    }
  };
}

const CODING_WORKSPACE_REQUIRED_MESSAGE = '当前是代码助手模式，但还没有选择项目目录。请先点击“选择项目”指定一个代码仓库，然后我就可以帮你读写和修改代码。';

function getCodingWorkspaceRequiredMessage(resolved: ResolvedPiRequest): string | undefined {
  if (resolved.profile.id !== 'coder') return undefined;
  if (resolved.coding?.rootPath?.trim()) return undefined;
  return CODING_WORKSPACE_REQUIRED_MESSAGE;
}

function createCodingWorkspaceRequiredResponse(resolved: ResolvedPiRequest): ChatResponse {
  return {
    agentId: resolved.profile.id,
    message: {
      content: CODING_WORKSPACE_REQUIRED_MESSAGE,
      createdAt: Date.now(),
      metadata: {
        profileId: resolved.profile.id,
        runtime: 'pi'
      },
      role: 'assistant'
    },
    metadata: {
      model: resolved.model.modelId,
      profileId: resolved.profile.id,
      providerId: resolved.model.providerId,
      runtime: 'pi'
    },
    providerId: resolved.model.providerId
  };
}

export class PiSessionService {
  private readonly sessionFactory = new PiSessionFactory();

  shouldHandle(req: ChatRequest): boolean {
    return isPiRuntimeRequested(req);
  }

  getAvailability(req?: Pick<ChatRequest, 'extras'>): PiRuntimeAvailability {
    const missingPackages = getMissingPackages();
    const requested = req ? isPiRuntimeRequested(req) : false;

    if (missingPackages.length === 0) {
      return {
        available: true,
        missingPackages: [],
        requested
      };
    }

    return {
      available: false,
      missingPackages,
      reason: `Missing Pi packages: ${missingPackages.join(', ')}`,
      requested
    };
  }

  async preview(req: ChatRequest): Promise<PiRuntimePreview> {
    const resolved = await resolvePiRequest(req);
    return {
      availability: this.getAvailability(req),
      resolved,
      tools: resolvePiToolDescriptors(resolved.enabledToolIds)
    };
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const preview = await this.preview(req);
    const codingWorkspaceMessage = getCodingWorkspaceRequiredMessage(preview.resolved);
    if (codingWorkspaceMessage) {
      return createCodingWorkspaceRequiredResponse(preview.resolved);
    }
    this.assertAvailable(preview.availability);

    const ai = await loadPiAi();
    const model = await buildPiModel(ai, preview.resolved);
    const context = await buildPiContext(preview.resolved, model);
    const sessionPrompt = canUseCodingSession(preview.resolved) ? splitSessionPrompt(context.messages) : undefined;

    if (sessionPrompt) {
      const sessionResult = await this.chatWithCodingSession(preview.resolved, model, context);

      if (sessionResult.response) {
        return sessionResult.response;
      }

      if (sessionResult.usedSession) {
        throw sessionResult.error || new Error('Pi coding session failed');
      }

      const codingSessionError = sessionResult.error?.message || 'Pi coding session unavailable';
      if (preview.resolved.profile.supportsToolCalls && preview.resolved.enabledToolIds.length > 0) {
        throw new Error(`${codingSessionError}. Current request has tools enabled, so falling back to plain text mode would disable tool execution.`);
      }
    }

    const completion = ensurePiCompletion(await ai.completeSimple(model, context, buildSimpleOptions(preview.resolved)));

    return toChatResponse(completion, preview.resolved);
  }

  async chatEphemeral(req: ChatRequest): Promise<ChatResponse> {
    return this.chat(req);
  }

  async chatStream(req: ChatRequest, emit: (event: StreamEvent) => void, signal?: AbortSignal): Promise<void> {
    const preview = await this.preview(req);
    const legacy = createLegacyStreamEmitter(emit);

    legacy.connected();

    const codingWorkspaceMessage = getCodingWorkspaceRequiredMessage(preview.resolved);
    if (codingWorkspaceMessage) {
      legacy.metadata({
        enabledToolIds: preview.resolved.enabledToolIds,
        model: preview.resolved.model.modelId,
        profileId: preview.resolved.profile.id,
        providerId: preview.resolved.model.providerId,
        runtime: 'pi',
        workspaceRequired: true
      });
      legacy.complete(createLegacyAssistantMessage(codingWorkspaceMessage, { runtime: 'pi', workspaceRequired: true }));
      legacy.done();
      return;
    }

    if (!preview.availability.available) {
      legacy.metadata({
        enabledToolIds: preview.resolved.enabledToolIds,
        model: preview.resolved.model.modelId,
        piReadyToolIds: listReadyPiToolIds(preview),
        piAvailability: preview.availability,
        profileId: preview.resolved.profile.id,
        providerId: preview.resolved.model.providerId,
        runtime: 'pi',
        toolBridge: resolveToolBridgeState(preview),
        transport: 'unavailable'
      });
      legacy.error({
        message: preview.availability.reason || 'Pi runtime packages are not installed yet.'
      });
      legacy.done();
      return;
    }

    try {
      const ai = await loadPiAi();
      const model = await buildPiModel(ai, preview.resolved);
      const context = await buildPiContext(preview.resolved, model);
      const sessionPrompt = canUseCodingSession(preview.resolved) ? splitSessionPrompt(context.messages) : undefined;

      legacy.metadata({
        enabledToolIds: preview.resolved.enabledToolIds,
        model: preview.resolved.model.modelId || model.id,
        piReadyToolIds: listReadyPiToolIds(preview),
        piAvailability: preview.availability,
        profileId: preview.resolved.profile.id,
        providerId: preview.resolved.model.providerId,
        runtime: 'pi',
        toolBridge: resolveToolBridgeState(preview),
        transport: sessionPrompt ? 'pi-coding-agent' : 'pi-ai'
      });

      if (sessionPrompt) {
        const sessionResult = await this.chatStreamWithCodingSession(preview.resolved, model, context, legacy, signal);

        if (sessionResult.usedSession) {
          return;
        }

        const codingSessionError = sessionResult.error?.message || 'Pi coding session unavailable';
        legacy.metadata({
          codingSessionError,
          sessionFallback: 'pi-ai',
          transport: 'pi-ai'
        });

        if (preview.resolved.profile.supportsToolCalls && preview.resolved.enabledToolIds.length > 0) {
          legacy.error({
            cause: sessionResult.error,
            message: `${codingSessionError}. Current request has tools enabled, so falling back to plain text mode would disable tool execution.`
          });
          legacy.done();
          return;
        }
      }

      const stream = ai.streamSimple(model, context, buildSimpleOptions(preview.resolved, signal));
      let accumulatedText = '';

      for await (const event of stream) {
        const handled = this.handlePiStreamEvent(event, legacy, preview.resolved);

        if (event.type === 'text_delta') {
          accumulatedText += event.delta;
        }

        if (handled === 'done') {
          return;
        }
      }

      if (accumulatedText) {
        legacy.complete(createLegacyAssistantMessage(accumulatedText, { runtime: 'pi' }));
      }
      legacy.done();
    } catch (error) {
      legacy.error(normalizePiError(error));
      legacy.done();
    }
  }

  private async chatStreamWithCodingSession(
    resolved: ResolvedPiRequest,
    model: PiModel,
    context: PiContext,
    legacy: ReturnType<typeof createLegacyStreamEmitter>,
    signal?: AbortSignal
  ): Promise<{ usedSession: boolean; error?: Error }> {
    const promptState = splitSessionPrompt(context.messages);
    if (!promptState) return { usedSession: false };

    let sessionHandle;

    try {
      sessionHandle = await this.sessionFactory.createCodingSession({
        model,
        resolved,
        systemPrompt: context.systemPrompt,
        thinkingLevel: resolveSessionThinkingLevel(resolved.request)
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[PiSessionService] Failed to create coding session:', err);
      return { error: err, usedSession: false };
    }

    const { dispose, session, toolContext } = sessionHandle;
    // Wire tool progress reporting to stream emitter
    toolContext.reportProgress = (callId: string, progress: number, message?: string) => {
      legacy.toolProgress(callId, progress, message);
    };
    // Wire user choice support
    toolContext.emitUserChoiceRequest = (request) => {
      legacy.userChoiceRequest(request);
    };
    toolContext.waitForUserChoiceResponse = (choiceId) => waitForUserChoice(choiceId);
    const emittedToolCalls = new Set<string>();
    let sawEvents = false;
    let terminalEmitted = false;
    let lastAssistant: PiAssistantMessage | undefined;

    const emitTerminalFromAssistant = (assistant?: PiAssistantMessage): void => {
      if (terminalEmitted) return;

      if (!assistant) {
        legacy.done();
        terminalEmitted = true;
        return;
      }

      this.completeFromAssistantMessage(assistant, legacy, resolved);
      terminalEmitted = true;
    };

    const unsubscribe = session.subscribe((event) => {
      sawEvents = true;

      switch (event.type) {
        case 'message_update':
          this.handleCodingSessionMessageUpdate(event, legacy, emittedToolCalls);
          return;
        case 'tool_execution_start':
          if (!emittedToolCalls.has(event.toolCallId)) {
            emittedToolCalls.add(event.toolCallId);
            legacy.toolCall(event.toolName, event.args, event.toolCallId);
          }
          return;
        case 'tool_execution_end':
          legacy.toolResult(event.toolCallId, event.result);
          return;
        case 'message_end':
          if (event.message.role === 'assistant') {
            lastAssistant = event.message as PiAssistantMessage;
          }
          return;
        case 'agent_end':
          emitTerminalFromAssistant(lastAssistant || findLastAssistantMessage(event.messages as PiMessage[]));
          return;
        default:
          return;
      }
    });

    const abortHandler = (): void => {
      session.agent.abort();
    };

    if (signal) {
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    try {
      session.agent.replaceMessages(promptState.history as any);
      await session.agent.prompt(promptState.prompt);

      if (!terminalEmitted) {
        emitTerminalFromAssistant(lastAssistant || findLastAssistantMessage(session.state.messages as PiMessage[]));
      }

      return { usedSession: true };
    } catch (error) {
      if (sawEvents) {
        if (!terminalEmitted) {
          legacy.error(normalizePiError(error));
          legacy.done();
          terminalEmitted = true;
        }

        return { usedSession: true };
      }

      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[PiSessionService] Coding session failed before streaming started:', err);
      return { error: err, usedSession: false };
    } finally {
      unsubscribe();
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
      dispose();
    }
  }

  private async chatWithCodingSession(resolved: ResolvedPiRequest, model: PiModel, context: PiContext): Promise<{ response?: ChatResponse; usedSession: boolean; error?: Error }> {
    const promptState = splitSessionPrompt(context.messages);
    if (!promptState) return { usedSession: false };

    let sessionHandle;

    try {
      sessionHandle = await this.sessionFactory.createCodingSession({
        model,
        resolved,
        systemPrompt: context.systemPrompt,
        thinkingLevel: resolveSessionThinkingLevel(resolved.request)
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[PiSessionService] Failed to create coding session for non-streaming chat:', err);
      return { error: err, usedSession: false };
    }

    const { dispose, session } = sessionHandle;

    try {
      session.agent.replaceMessages(promptState.history as any);
      await session.agent.prompt(promptState.prompt);

      const assistant = findLastAssistantMessage(session.state.messages as PiMessage[]);
      if (!assistant) {
        throw new Error('Pi coding session completed without an assistant response.');
      }

      return {
        response: toChatResponse(ensurePiCompletion(assistant), resolved),
        usedSession: true
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[PiSessionService] Non-streaming coding session failed:', err);
      return { error: err, usedSession: true };
    } finally {
      dispose();
    }
  }

  private assertAvailable(availability: PiRuntimeAvailability): void {
    if (availability.available) return;
    throw new Error(availability.reason || 'Pi runtime packages are not installed yet.');
  }

  private completeFromAssistantMessage(message: PiAssistantMessage, legacy: ReturnType<typeof createLegacyStreamEmitter>, resolved: ResolvedPiRequest): void {
    if (message.stopReason === 'error' || message.stopReason === 'aborted') {
      legacy.error({
        cause: message,
        message: message.errorMessage || (message.stopReason === 'aborted' ? 'Pi runtime execution aborted' : 'Pi runtime execution failed')
      });
      legacy.done();
      return;
    }

    const thinkingBlocks = extractThinkingBlocks(message);
    legacy.complete(
      createLegacyAssistantMessage(extractAssistantText(message), {
        model: resolved.model.modelId || message.model,
        piProvider: message.provider,
        piStopReason: message.stopReason,
        runtime: 'pi',
        ...(thinkingBlocks ? { thinkingBlocks } : {})
      })
    );
    legacy.done();
  }

  private handleCodingSessionMessageUpdate(event: Extract<PiAgentSessionEvent, { type: 'message_update' }>, legacy: ReturnType<typeof createLegacyStreamEmitter>, emittedToolCalls: Set<string>): void {
    const assistantEvent = event.assistantMessageEvent;

    switch (assistantEvent.type) {
      case 'text_delta':
        legacy.delta(assistantEvent.delta);
        return;
      case 'thinking_delta':
        legacy.thinkingDelta(assistantEvent.delta);
        return;
      case 'toolcall_end':
        if (!emittedToolCalls.has(assistantEvent.toolCall.id)) {
          emittedToolCalls.add(assistantEvent.toolCall.id);
          legacy.toolCall(assistantEvent.toolCall.name, assistantEvent.toolCall.arguments, assistantEvent.toolCall.id);
        }
        return;
      default:
        return;
    }
  }

  private handlePiStreamEvent(event: PiAssistantMessageEvent, legacy: ReturnType<typeof createLegacyStreamEmitter>, resolved: ResolvedPiRequest): 'continue' | 'done' {
    switch (event.type) {
      case 'text_delta':
        legacy.delta(event.delta);
        return 'continue';
      case 'thinking_delta':
        legacy.thinkingDelta(event.delta);
        return 'continue';
      case 'toolcall_end':
        legacy.toolCall(event.toolCall.name, event.toolCall.arguments, event.toolCall.id);
        return 'continue';
      case 'done': {
        const thinkingBlocks = extractThinkingBlocks(event.message);
        legacy.complete(
          createLegacyAssistantMessage(extractAssistantText(event.message), {
            model: resolved.model.modelId || event.message.model,
            piProvider: event.message.provider,
            piStopReason: event.reason,
            runtime: 'pi',
            ...(thinkingBlocks ? { thinkingBlocks } : {})
          })
        );
        legacy.done();
        return 'done';
      }
      case 'error':
        legacy.error({
          cause: event.error,
          message: event.error.errorMessage || 'Pi runtime execution failed'
        });
        legacy.done();
        return 'done';
      default:
        return 'continue';
    }
  }
}
