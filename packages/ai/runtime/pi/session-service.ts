import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { logMemoryTrace, shortTraceId } from '../../services/memory-trace';
import type { ChatRequest, ChatResponse, StreamEvent, TokenUsage } from '../../types';
import { cancelPendingChoice, waitForUserChoice } from '../../user-choice-registry';
import type { PiRuntimeAvailability, PiRuntimePreview, ResolvedPiRequest } from './contracts';
import { resolvePiRequest } from './model-resolver';
import { type AiPromptInspectionTool, createResolvedPromptInspectionContext, inspectAiPrompt } from './prompt-inspector';
import { buildPiModel, buildPiModelHeaders } from './provider-model';
import { extractPiProviderRequestId } from './provider-request-id';
import { isPiRuntimeRequested } from './runtime-switch';
import { PiSessionFactory } from './session-factory';
import {
  buildExplicitSkillInvocationPrompt,
  buildSkillDiscoveryPrompt,
  buildSkillListingPrompt,
  createSkillRegistry,
  createSkillSessionState,
  loadInstructionFiles,
  resolveExplicitSkillInvocation,
  resolveRequestedSkillInvocation,
  type SkillExecutionResult,
  type SkillRegistry,
  type SkillSessionState
} from './skills';
import { createLegacyAssistantMessage, createLegacyStreamEmitter, normalizePiError } from './stream-adapter';
import type { PiSessionToolContext } from './tool-context';
import { getPiToolChatDisplayByName } from './tools/display';
import { normalizePiToolIds, resolvePiToolDescriptors, resolvePiToolId } from './tool-registry';

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
type PiSkillRuntimeContext = {
  registry: SkillRegistry;
  state: SkillSessionState;
  workspaceRoot: string;
};

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

function extractPiTokenUsage(message: PiAssistantMessage): TokenUsage | undefined {
  const inputTokens = typeof message.usage?.input === 'number' && Number.isFinite(message.usage.input) && message.usage.input >= 0 ? message.usage.input : undefined;
  const outputTokens = typeof message.usage?.output === 'number' && Number.isFinite(message.usage.output) && message.usage.output >= 0 ? message.usage.output : undefined;
  const cacheReadTokens = typeof message.usage?.cacheRead === 'number' && Number.isFinite(message.usage.cacheRead) && message.usage.cacheRead >= 0 ? message.usage.cacheRead : undefined;
  const cacheWriteTokens = typeof message.usage?.cacheWrite === 'number' && Number.isFinite(message.usage.cacheWrite) && message.usage.cacheWrite >= 0 ? message.usage.cacheWrite : undefined;
  const explicitTotalTokens = typeof message.usage?.totalTokens === 'number' && Number.isFinite(message.usage.totalTokens) && message.usage.totalTokens >= 0 ? message.usage.totalTokens : undefined;
  const hasTokenComponent = inputTokens !== undefined || outputTokens !== undefined || cacheReadTokens !== undefined || cacheWriteTokens !== undefined;
  const totalTokens = explicitTotalTokens ?? (hasTokenComponent ? (inputTokens ?? 0) + (outputTokens ?? 0) + (cacheReadTokens ?? 0) + (cacheWriteTokens ?? 0) : undefined);
  const cost = typeof message.usage?.cost?.total === 'number' && Number.isFinite(message.usage.cost.total) && message.usage.cost.total >= 0 ? message.usage.cost.total : undefined;

  if (inputTokens === undefined && outputTokens === undefined && cacheReadTokens === undefined && cacheWriteTokens === undefined && totalTokens === undefined && cost === undefined) {
    return undefined;
  }

  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}),
    ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
    ...(cost !== undefined ? { cost } : {})
  };
}

function extractPiRawUsage(message: PiAssistantMessage): Record<string, unknown> | undefined {
  if (!message.usage || typeof message.usage !== 'object') {
    return undefined;
  }

  try {
    return JSON.parse(JSON.stringify(message.usage)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
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

/**
 * Parse a markdown string into sections split by `## ` headings.
 * Returns an array of { heading, body } where heading is the full heading line
 * (e.g. "## 你的身份") and body is the content until the next `## ` heading.
 * Content before the first `## ` heading is returned with heading = ''.
 */
function parseMarkdownSections(text: string): { heading: string; body: string }[] {
  const lines = text.split('\n');
  const sections: { heading: string; bodyLines: string[] }[] = [];
  let current: { heading: string; bodyLines: string[] } = { heading: '', bodyLines: [] };

  for (const line of lines) {
    if (/^## /.test(line)) {
      sections.push(current);
      current = { heading: line, bodyLines: [] };
    } else {
      current.bodyLines.push(line);
    }
  }
  sections.push(current);

  return sections.map((s) => ({
    heading: s.heading,
    body: s.bodyLines.join('\n')
  }));
}

/**
 * Merge enrichment text into a base markdown text at the `## ` section level.
 *
 * - If an enrichment contains a `## ` heading that also exists in the base,
 *   the enrichment's section **replaces** the base section (heading + body).
 * - If an enrichment contains a `## ` heading NOT in the base, the section
 *   is **appended** after all existing base sections.
 * - Content in enrichments without any `## ` heading is appended as-is.
 */
function mergeMarkdownSections(base: string, enrichmentTexts: string[]): string {
  const baseSections = parseMarkdownSections(base);

  // Build a map from normalized heading → index for quick lookup
  const headingIndex = new Map<string, number>();
  for (let i = 0; i < baseSections.length; i++) {
    const h = baseSections[i].heading.trim();
    if (h) headingIndex.set(h, i);
  }

  const appendSections: { heading: string; body: string }[] = [];
  const plainAppends: string[] = [];

  for (const enrichment of enrichmentTexts) {
    const enrichSections = parseMarkdownSections(enrichment);

    for (const sec of enrichSections) {
      const h = sec.heading.trim();
      if (!h) {
        // No heading — plain content, append as-is
        const text = sec.body.trim();
        if (text) plainAppends.push(text);
        continue;
      }

      const idx = headingIndex.get(h);
      if (idx !== undefined) {
        // Override the base section
        baseSections[idx] = { heading: sec.heading, body: sec.body };
      } else {
        // New section — append later
        appendSections.push(sec);
      }
    }
  }

  // Reconstruct the merged markdown
  const parts: string[] = [];
  for (const sec of baseSections) {
    if (sec.heading) {
      parts.push(sec.heading + '\n' + sec.body);
    } else {
      const text = sec.body.trim();
      if (text) parts.push(text);
    }
  }
  for (const sec of appendSections) {
    parts.push(sec.heading + '\n' + sec.body);
  }
  parts.push(...plainAppends);

  return parts.join('\n\n').trim();
}

function mergeMarkdownChain(texts: string[]): string {
  const nonEmptyTexts = texts.map((text) => text.trim()).filter(Boolean);
  if (!nonEmptyTexts.length) return '';

  let merged = nonEmptyTexts[0];
  for (const text of nonEmptyTexts.slice(1)) {
    merged = mergeMarkdownSections(merged, [text]);
  }

  return merged;
}

function findLatestUserMessageIndex(messages: ResolvedPiRequest['messages']): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') {
      return index;
    }
  }

  return -1;
}

function getLatestUserQuery(messages: ResolvedPiRequest['messages']): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'user') continue;
    const query = extractTextContent(message.content as unknown).trim();
    if (query) return query;
  }
  return undefined;
}

function hasSkillToolsEnabled(resolved: ResolvedPiRequest): boolean {
  const enabledToolIds = new Set(resolved.enabledToolIds.map((toolId) => resolvePiToolId(toolId) || toolId));
  return enabledToolIds.has('skill-search') && enabledToolIds.has('skill-use');
}

function shouldEnableSkillPromptProtocol(resolved: ResolvedPiRequest): boolean {
  return resolved.profile.id === 'assistant' && hasSkillToolsEnabled(resolved);
}

function shouldEnableInstructionPromptChain(resolved: ResolvedPiRequest): boolean {
  return resolved.profile.id === 'assistant' && hasSkillToolsEnabled(resolved);
}

function prepareResolvedRequestForExplicitSkillInvocation(resolved: ResolvedPiRequest, skillRuntime?: PiSkillRuntimeContext): ResolvedPiRequest {
  if (!skillRuntime || !shouldEnableSkillPromptProtocol(resolved)) {
    return resolved;
  }

  const latestUserMessageIndex = findLatestUserMessageIndex(resolved.messages);
  if (latestUserMessageIndex < 0 && !resolved.requestedSkillInvocation) {
    return resolved;
  }

  const latestUserQuery = getLatestUserQuery(resolved.messages);
  const requestedSkillInvocation = resolved.requestedSkillInvocation ? resolveRequestedSkillInvocation(resolved.requestedSkillInvocation, skillRuntime.registry) : undefined;
  const explicitSkillInvocation = requestedSkillInvocation || (latestUserQuery ? resolveExplicitSkillInvocation(latestUserQuery, skillRuntime.registry) : undefined);
  if (!explicitSkillInvocation) {
    return resolved.explicitSkillInvocation
      ? {
        ...resolved,
        explicitSkillInvocation: undefined
      }
      : resolved;
  }

  if (!explicitSkillInvocation.remainingQuery) {
    return {
      ...resolved,
      explicitSkillInvocation
    };
  }

  if (latestUserMessageIndex < 0) {
    return {
      ...resolved,
      explicitSkillInvocation
    };
  }

  const messages = resolved.messages.map((message, index) =>
    index === latestUserMessageIndex
      ? {
        ...message,
        content: explicitSkillInvocation.remainingQuery!
      }
      : message
  );

  return {
    ...resolved,
    explicitSkillInvocation,
    messages
  };
}

async function createSkillRuntimeContext(resolved: ResolvedPiRequest): Promise<PiSkillRuntimeContext | undefined> {
  if (!resolved.profile.supportsToolCalls || !hasSkillToolsEnabled(resolved)) {
    return undefined;
  }

  const workspaceRoot = resolved.coding?.rootPath?.trim() || process.cwd();
  const registry = await createSkillRegistry({
    discoverPluginRoots: true,
    includeBundled: false,
    includeSyntheticToolbox: false,
    workspaceRoot
  });
  const state = createSkillSessionState();

  if (registry.issues.length > 0) {
    console.warn('[PiSessionService] skill registry issues:', registry.issues.slice(0, 5));
    if (registry.issues.length > 5) {
      console.warn('[PiSessionService] skill registry issues truncated:', registry.issues.length - 5);
    }
  }

  return {
    registry,
    state,
    workspaceRoot
  };
}

async function buildPiContext(resolved: ResolvedPiRequest, model: PiModel, skillRuntime?: PiSkillRuntimeContext): Promise<PiContext> {
  const profileInstructions = await resolveProfileInstructions(resolved);
  const workspaceRoot = resolved.coding?.rootPath?.trim() || process.cwd();
  const enrichmentStartedAt = Date.now();
  const conversationId = shortTraceId(resolved.request.conversationId);

  logMemoryTrace({
    conversationId,
    event: 'pi_context.build.start',
    messageCount: resolved.messages.length,
    providerId: resolved.model.providerId
  });

  // Resolve dynamic system prompt enrichments from registered enrichers
  const { resolveSystemPromptEnrichments } = await import('../../system-prompt-enricher');
  const enrichments = await resolveSystemPromptEnrichments(resolved.request);
  const instructionFiles = shouldEnableInstructionPromptChain(resolved)
    ? await loadInstructionFiles({
      workspaceRoot
    })
    : undefined;
  const latestUserQuery = getLatestUserQuery(resolved.messages);
  const explicitSkillInvocation = resolved.explicitSkillInvocation;

  // Merge enrichments into profile instructions at the ## section level:
  // enrichment sections with headings matching the profile override them;
  // new sections and plain (non-sectioned) enrichment text are appended.
  const systemParts: string[] = [];
  const mergedInstructions = mergeMarkdownChain([profileInstructions, ...(instructionFiles?.files.map((file) => file.content) || []), ...enrichments]);
  if (mergedInstructions) {
    systemParts.push(mergedInstructions);
  }

  if (instructionFiles?.issues.length) {
    console.warn('[PiSessionService] instruction loader issues:', instructionFiles.issues.slice(0, 5));
    if (instructionFiles.issues.length > 5) {
      console.warn('[PiSessionService] instruction loader issues truncated:', instructionFiles.issues.length - 5);
    }
  }

  if (skillRuntime && shouldEnableSkillPromptProtocol(resolved)) {
    const skillListing = buildSkillListingPrompt(skillRuntime.registry, { limit: 12 });
    if (skillListing) systemParts.push(skillListing);

    const skillDiscovery = buildSkillDiscoveryPrompt(skillRuntime.registry, {
      limit: 4,
      query: explicitSkillInvocation ? explicitSkillInvocation.skillName : latestUserQuery,
      state: skillRuntime.state,
      workspaceRoot: skillRuntime.workspaceRoot
    });
    if (skillDiscovery) systemParts.push(skillDiscovery);

    if (explicitSkillInvocation) {
      systemParts.push(buildExplicitSkillInvocationPrompt(explicitSkillInvocation));
    }
  }

  const messages: PiMessage[] = [];

  for (let index = 0; index < resolved.messages.length; index += 1) {
    const message = resolved.messages[index];
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

  const systemPrompt = systemParts.join('\n\n');
  logMemoryTrace({
    conversationId,
    durationMs: Date.now() - enrichmentStartedAt,
    enrichmentCount: enrichments.length,
    event: 'pi_context.build.done',
    messageCount: messages.length,
    systemPromptChars: systemPrompt.length
  });

  return {
    ...(systemParts.length ? { systemPrompt } : {}),
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

function resolveForkedThinkingLevel(execution: SkillExecutionResult, resolved: ResolvedPiRequest): PiAgentThinkingLevel {
  if (execution.effort) {
    return execution.effort;
  }

  return resolveSessionThinkingLevel(resolved.request);
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

function toInspectionMessages(messages: PiMessage[]): Array<{ content: unknown; name?: string; role: string; timestamp?: number; toolCallId?: string }> {
  return messages.map((message) => ({
    content: message.content,
    role: message.role,
    timestamp: message.timestamp,
    ...('toolCallId' in message && typeof message.toolCallId === 'string' ? { toolCallId: message.toolCallId } : {}),
    ...('toolName' in message && typeof message.toolName === 'string' ? { name: message.toolName } : {})
  }));
}

function inspectPiAiPrompt(params: { context: PiContext; metadata?: Record<string, unknown>; resolved: ResolvedPiRequest; source: 'pi-session'; transport: string }): void {
  inspectAiPrompt({
    ...createResolvedPromptInspectionContext(params.resolved),
    activeTools: params.resolved.enabledToolIds,
    messages: toInspectionMessages(params.context.messages as PiMessage[]),
    metadata: params.metadata,
    source: params.source,
    systemPrompt: params.context.systemPrompt,
    transport: params.transport
  });
}

function getActiveSessionTools(session: {
  getActiveToolNames?: () => string[];
  getAllTools?: () => Array<{ description?: string; name: string; parameters?: unknown }>;
}): AiPromptInspectionTool[] {
  if (typeof session.getActiveToolNames !== 'function' || typeof session.getAllTools !== 'function') {
    return [];
  }

  const activeNames = new Set(session.getActiveToolNames());
  return session
    .getAllTools()
    .filter((tool) => activeNames.has(tool.name))
    .map((tool) => ({
      description: tool.description,
      name: tool.name,
      parameters: tool.parameters
    }));
}

function inspectCodingSessionPrompt(params: {
  activeTools: AiPromptInspectionTool[];
  metadata?: Record<string, unknown>;
  promptState: { history: PiMessage[]; prompt: string };
  resolved: ResolvedPiRequest;
  source: 'pi-coding-session' | 'pi-forked-skill';
  systemPrompt?: string;
  transport: string;
}): void {
  inspectAiPrompt({
    ...createResolvedPromptInspectionContext(params.resolved),
    activeTools: params.activeTools,
    messages: toInspectionMessages(params.promptState.history),
    metadata: params.metadata,
    prompt: params.promptState.prompt,
    source: params.source,
    systemPrompt: params.systemPrompt,
    transport: params.transport
  });
}

function resolveForkedSkillToolIds(resolved: ResolvedPiRequest, execution: SkillExecutionResult): string[] {
  const explicitToolIds = normalizePiToolIds([...execution.allowedToolIds, ...execution.activationToolIds]);
  return explicitToolIds.length > 0 ? explicitToolIds : resolved.enabledToolIds;
}

function buildForkedSkillPrompt(execution: SkillExecutionResult, userPrompt: string): string {
  const parts = [`You are running the "${execution.record.name}" skill inside a forked coding session.`, `Original user request:\n${userPrompt}`, `Skill instructions:\n${execution.content}`];

  if (execution.record.description.trim()) {
    parts.splice(1, 0, `Skill purpose:\n${execution.record.description}`);
  }

  if (Object.keys(execution.resolvedArgs).length > 0) {
    parts.splice(parts.length - 1, 0, `Resolved skill arguments:\n${JSON.stringify(execution.resolvedArgs, null, 2)}`);
  }

  if (execution.allowedToolIds.length > 0 || execution.activationToolIds.length > 0) {
    parts.splice(parts.length - 1, 0, `Preferred tool scope for this fork:\n${Array.from(new Set([...execution.allowedToolIds, ...execution.activationToolIds])).join(', ')}`);
  }

  return parts.join('\n\n');
}

function createForkedChildToolCallId(parentToolCallId: string | undefined, childToolCallId: string): string {
  if (!parentToolCallId?.trim()) {
    return `fork:${childToolCallId}`;
  }

  return `${parentToolCallId}:fork:${childToolCallId}`;
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

function isSuccessfulEmojiSendResult(result: unknown): boolean {
  const details = (result as any)?.details || result;
  return Boolean((details as any)?.success && (details as any)?.emoji);
}

function isEmojiSendToolName(name: string | undefined): boolean {
  return name === 'emojiSendTool' || name === 'emoji-send';
}

function shouldRunEmojiFallback(resolved: ResolvedPiRequest): boolean {
  return Boolean(resolved.request.extras?.emojiPacksEnabled);
}

function resolveToolCallDisplay(toolContext: PiSessionToolContext | undefined, toolName: string | undefined) {
  return getPiToolChatDisplayByName(toolName, toolContext?.session?.getAllTools());
}

const MAX_FALLBACK_QUERY_TOKENS = 16;
const MAX_FALLBACK_QUERY_LENGTH = 160;

/** Extract a search-friendly token bag from natural-language text. Returns a space-joined query. */
function buildEmojiFallbackQuery(text: string): string {
  if (!text) return '';
  const tokens = new Set<string>();

  // English / digits / underscore — keep words of length >= 2.
  for (const match of text.matchAll(/[A-Za-z0-9_]{2,}/g)) {
    tokens.add(match[0].toLowerCase());
  }

  // CJK runs: keep the whole run if short, plus 2-char sliding windows so the existing
  // tokenizer (which only splits on whitespace) can still match unsegmented Chinese phrases.
  for (const match of text.matchAll(/[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]+/g)) {
    const run = match[0];
    if (run.length === 1) {
      // Single character is too noisy to add on its own.
      continue;
    }
    if (run.length <= 4) {
      tokens.add(run);
    }
    for (let index = 0; index + 2 <= run.length; index += 1) {
      tokens.add(run.slice(index, index + 2));
    }
  }

  const ordered = Array.from(tokens).slice(0, MAX_FALLBACK_QUERY_TOKENS);
  const joined = ordered.join(' ');
  return joined.length > MAX_FALLBACK_QUERY_LENGTH ? joined.slice(0, MAX_FALLBACK_QUERY_LENGTH) : joined;
}

function resolveLatestUserMessageText(resolved: ResolvedPiRequest): string {
  const messages = resolved.messages;
  if (!Array.isArray(messages)) return '';
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'user' && typeof message.content === 'string') {
      return message.content;
    }
  }
  return '';
}

async function runEmojiFallbackSend(toolContext: PiSessionToolContext, query: string): Promise<
  | {
    send: { args: Record<string, unknown>; callId: string; result: unknown };
  }
  | undefined
> {
  const { createPiEmojiSendTool } = await import('./tools/emoji-packs');
  const sendTool = createPiEmojiSendTool(toolContext);
  const sendArgs: Record<string, unknown> = query ? { query } : {};
  const sendCallId = `emoji-fallback-send-${Date.now()}`;
  const sendResult = await (sendTool.execute as (toolCallId: string, input: Record<string, unknown>) => Promise<unknown>)(sendCallId, sendArgs);
  if (!isSuccessfulEmojiSendResult(sendResult)) {
    return undefined;
  }

  return {
    send: {
      args: sendArgs,
      callId: sendCallId,
      result: sendResult
    }
  };
}

function toChatResponse(message: PiAssistantMessage, resolved: ResolvedPiRequest): ChatResponse {
  const usage = extractPiTokenUsage(message);
  const rawUsage = extractPiRawUsage(message);
  const providerRequestId = extractPiProviderRequestId(message);
  return {
    agentId: resolved.profile.id,
    message: {
      content: extractAssistantText(message),
      createdAt: message.timestamp || Date.now(),
      metadata: {
        piProvider: message.provider,
        piStopReason: message.stopReason,
        ...(providerRequestId ? { providerRequestId } : {}),
        ...(rawUsage ? { piRawUsage: rawUsage } : {})
      },
      ...(usage ? { usage } : {}),
      role: 'assistant'
    },
    metadata: {
      model: resolved.model.modelId || message.model,
      profileId: resolved.profile.id,
      providerId: resolved.model.providerId,
      runtime: 'pi',
      ...(providerRequestId ? { providerRequestId } : {}),
      ...(rawUsage ? { rawUsage } : {})
    },
    providerId: resolved.model.providerId,
    ...(usage ? { usage } : {})
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
    const skillRuntime = await createSkillRuntimeContext(preview.resolved);
    const effectiveResolved = prepareResolvedRequestForExplicitSkillInvocation(preview.resolved, skillRuntime);
    const context = await buildPiContext(effectiveResolved, model, skillRuntime);
    const sessionPrompt = canUseCodingSession(effectiveResolved) ? splitSessionPrompt(context.messages) : undefined;

    if (sessionPrompt) {
      const sessionResult = await this.chatWithCodingSession(effectiveResolved, model, context, skillRuntime);

      if (sessionResult.response) {
        return sessionResult.response;
      }

      if (sessionResult.usedSession) {
        throw sessionResult.error || new Error('Pi coding session failed');
      }

      const codingSessionError = sessionResult.error?.message || 'Pi coding session unavailable';
      if (effectiveResolved.profile.supportsToolCalls && effectiveResolved.enabledToolIds.length > 0) {
        throw new Error(`${codingSessionError}. Current request has tools enabled, so falling back to plain text mode would disable tool execution.`);
      }
    }

    inspectPiAiPrompt({
      context,
      resolved: effectiveResolved,
      source: 'pi-session',
      transport: 'pi-ai.completeSimple'
    });
    const completion = ensurePiCompletion(await ai.completeSimple(model, context, buildSimpleOptions(effectiveResolved)));

    return toChatResponse(completion, effectiveResolved);
  }

  async chatEphemeral(req: ChatRequest): Promise<ChatResponse> {
    return this.chat(req);
  }

  async chatStream(req: ChatRequest, emit: (event: StreamEvent) => void, signal?: AbortSignal): Promise<void> {
    // Pre-warm enrichers early — lets memory auto-recall start prefetch
    // while preview() and buildPiModel() are running
    const { preWarmEnrichers } = await import('../../system-prompt-enricher');
    logMemoryTrace({
      conversationId: shortTraceId(req.conversationId),
      event: 'pi_chat_stream.prewarm.start',
      messageCount: req.messages?.length || 0,
      providerId: req.providerId || 'unknown'
    });
    preWarmEnrichers(req);
    logMemoryTrace({
      conversationId: shortTraceId(req.conversationId),
      event: 'pi_chat_stream.prewarm.dispatched'
    });

    const preview = await this.preview(req);
    const legacy = createLegacyStreamEmitter(emit, {
      characterPersonaEnabled: !!preview.resolved.request.extras?.characterPersonaEnabled
    });

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
      const skillRuntime = await createSkillRuntimeContext(preview.resolved);
      const effectiveResolved = prepareResolvedRequestForExplicitSkillInvocation(preview.resolved, skillRuntime);
      const context = await buildPiContext(effectiveResolved, model, skillRuntime);
      const sessionPrompt = canUseCodingSession(effectiveResolved) ? splitSessionPrompt(context.messages) : undefined;

      legacy.metadata({
        enabledToolIds: effectiveResolved.enabledToolIds,
        model: effectiveResolved.model.modelId || model.id,
        piReadyToolIds: listReadyPiToolIds(preview),
        piAvailability: preview.availability,
        profileId: effectiveResolved.profile.id,
        providerId: effectiveResolved.model.providerId,
        runtime: 'pi',
        toolBridge: resolveToolBridgeState(preview),
        transport: sessionPrompt ? 'pi-coding-agent' : 'pi-ai'
      });

      if (sessionPrompt) {
        const sessionResult = await this.chatStreamWithCodingSession(effectiveResolved, model, context, legacy, signal, skillRuntime);

        if (sessionResult.usedSession) {
          return;
        }

        const codingSessionError = sessionResult.error?.message || 'Pi coding session unavailable';
        legacy.metadata({
          codingSessionError,
          sessionFallback: 'pi-ai',
          transport: 'pi-ai'
        });

        if (effectiveResolved.profile.supportsToolCalls && effectiveResolved.enabledToolIds.length > 0) {
          legacy.error({
            cause: sessionResult.error,
            message: `${codingSessionError}. Current request has tools enabled, so falling back to plain text mode would disable tool execution.`
          });
          legacy.done();
          return;
        }
      }

      inspectPiAiPrompt({
        context,
        resolved: effectiveResolved,
        source: 'pi-session',
        transport: 'pi-ai.streamSimple'
      });
      const stream = ai.streamSimple(model, context, buildSimpleOptions(effectiveResolved, signal));
      let accumulatedText = '';

      for await (const event of stream) {
        const handled = this.handlePiStreamEvent(event, legacy, effectiveResolved);

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

  private attachForkedSkillRunner(options: {
    model: PiModel;
    promptState: { history: PiMessage[]; prompt: string };
    resolved: ResolvedPiRequest;
    systemPrompt?: string;
    toolContext: PiSessionToolContext;
  }): void {
    options.toolContext.runForkedSkill = (execution, runOptions) =>
      this.runForkedSkillExecution({
        execution,
        model: options.model,
        parentToolCallId: runOptions?.toolCallId,
        promptState: options.promptState,
        resolved: options.resolved,
        systemPrompt: options.systemPrompt,
        toolContext: options.toolContext
      });
  }

  private async runForkedSkillExecution(options: {
    execution: SkillExecutionResult;
    model: PiModel;
    parentToolCallId?: string;
    promptState: { history: PiMessage[]; prompt: string };
    resolved: ResolvedPiRequest;
    systemPrompt?: string;
    toolContext: PiSessionToolContext;
  }) {
    const childToolIds = resolveForkedSkillToolIds(options.resolved, options.execution);
    const childResolved: ResolvedPiRequest = {
      ...options.resolved,
      enabledToolIds: childToolIds,
      model: options.execution.model
        ? {
          ...options.resolved.model,
          modelId: options.execution.model
        }
        : options.resolved.model
    };

    const childModel = options.execution.model && options.execution.model !== options.resolved.model.modelId ? await buildPiModel(await loadPiAi(), childResolved) : options.model;
    const thinkingLevel = resolveForkedThinkingLevel(options.execution, childResolved);
    const sessionHandle = await this.sessionFactory.createCodingSession({
      model: childModel,
      resolved: childResolved,
      systemPrompt: options.systemPrompt,
      thinkingLevel
    });

    const { dispose, session, toolContext } = sessionHandle;
    toolContext.reportProgress = options.toolContext.reportProgress;
    toolContext.emitToolCall = options.toolContext.emitToolCall;
    toolContext.emitToolResult = options.toolContext.emitToolResult;
    toolContext.emitUserChoiceRequest = options.toolContext.emitUserChoiceRequest;
    toolContext.waitForUserChoiceResponse = options.toolContext.waitForUserChoiceResponse;
    toolContext.cancelUserChoiceRequest = options.toolContext.cancelUserChoiceRequest;
    const toolCalls = new Map<string, { args?: unknown; callId: string; result?: unknown; toolName: string }>();
    let progress = 5;

    const reportForkProgress = (nextProgress: number, message: string) => {
      progress = Math.max(progress, Math.min(nextProgress, 100));
      if (options.parentToolCallId) {
        options.toolContext.reportProgress?.(options.parentToolCallId, progress, message);
      }
    };

    reportForkProgress(5, `Starting forked skill "${options.execution.record.name}"...`);

    const unsubscribe =
      typeof session.subscribe === 'function'
        ? session.subscribe((event) => {
          switch (event.type) {
            case 'tool_execution_start': {
              const callId = createForkedChildToolCallId(options.parentToolCallId, event.toolCallId);
              toolCalls.set(event.toolCallId, {
                args: event.args,
                callId,
                toolName: event.toolName
              });
              options.toolContext.emitToolCall?.(event.toolName, event.args, callId);
              reportForkProgress(Math.min(progress + 15, 80), `Forked skill is running ${event.toolName}.`);
              return;
            }
            case 'tool_execution_end': {
              const toolCall = toolCalls.get(event.toolCallId);
              if (toolCall) {
                toolCall.result = event.result;
                options.toolContext.emitToolResult?.(toolCall.callId, event.result);
              }
              reportForkProgress(Math.min(progress + 10, 92), 'Forked skill finished a child tool step.');
              return;
            }
            default:
              return;
          }
        })
        : () => { };

    try {
      session.agent.replaceMessages(options.promptState.history as any);
      reportForkProgress(15, `Forked skill session ready with model ${childModel.id}.`);
      const forkedPrompt = buildForkedSkillPrompt(options.execution, options.promptState.prompt);
      inspectCodingSessionPrompt({
        activeTools: getActiveSessionTools(session),
        metadata: {
          parentToolCallId: options.parentToolCallId,
          skillName: options.execution.record.name
        },
        promptState: {
          history: options.promptState.history,
          prompt: forkedPrompt
        },
        resolved: childResolved,
        source: 'pi-forked-skill',
        systemPrompt: session.systemPrompt,
        transport: 'pi-coding-agent.forked-skill'
      });
      await session.agent.prompt(forkedPrompt);
      reportForkProgress(95, `Forked skill "${options.execution.record.name}" completed its child session.`);

      const assistant = findLastAssistantMessage(session.state.messages as PiMessage[]);
      if (!assistant) {
        throw new Error(`Forked skill "${options.execution.record.name}" completed without an assistant response.`);
      }

      reportForkProgress(100, `Forked skill "${options.execution.record.name}" finished.`);
      return {
        activeToolNames: session.getActiveToolNames(),
        content: extractAssistantText(ensurePiCompletion(assistant)),
        model: childModel.id,
        thinkingLevel,
        toolCalls: Array.from(toolCalls.values())
      };
    } finally {
      unsubscribe();
      dispose();
    }
  }

  private async chatStreamWithCodingSession(
    resolved: ResolvedPiRequest,
    model: PiModel,
    context: PiContext,
    legacy: ReturnType<typeof createLegacyStreamEmitter>,
    signal?: AbortSignal,
    skillRuntime?: PiSkillRuntimeContext
  ): Promise<{ usedSession: boolean; error?: Error }> {
    const promptState = splitSessionPrompt(context.messages);
    if (!promptState) return { usedSession: false };

    let sessionHandle;

    try {
      sessionHandle = await this.sessionFactory.createCodingSession({
        model,
        resolved,
        ...(skillRuntime
          ? {
            skillRegistry: skillRuntime.registry,
            skillSessionState: skillRuntime.state
          }
          : {}),
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
    toolContext.emitToolCall = (name, args, callId) => {
      legacy.toolCall(name, args, callId, resolveToolCallDisplay(toolContext, name));
    };
    toolContext.emitToolResult = (callId, result) => {
      legacy.toolResult(callId, result);
    };
    // Wire user choice support
    toolContext.emitUserChoiceRequest = (request) => {
      legacy.userChoiceRequest(request);
    };
    toolContext.waitForUserChoiceResponse = (choiceId) => waitForUserChoice(choiceId);
    toolContext.cancelUserChoiceRequest = (choiceId) => cancelPendingChoice(choiceId);
    this.attachForkedSkillRunner({
      model,
      promptState,
      resolved,
      systemPrompt: context.systemPrompt,
      toolContext
    });
    const emittedToolCalls = new Set<string>();
    const toolCallNames = new Map<string, string>();
    let sawEvents = false;
    let terminalPromise: Promise<void> | undefined;
    let terminalEmitted = false;
    let emojiSendCompleted = false;
    let lastAssistant: PiAssistantMessage | undefined;

    const emitEmojiFallbackIfNeeded = async (assistant?: PiAssistantMessage): Promise<void> => {
      if (emojiSendCompleted || !assistant || assistant.stopReason === 'error' || assistant.stopReason === 'aborted' || !shouldRunEmojiFallback(resolved)) {
        return;
      }
      emojiSendCompleted = true;

      try {
        const assistantText = extractAssistantText(assistant);
        const userText = resolveLatestUserMessageText(resolved);
        const query = buildEmojiFallbackQuery(`${assistantText} ${userText}`);

        const fallback = await runEmojiFallbackSend(toolContext, query);
        if (!fallback) return;

        legacy.toolCall('emojiSendTool', fallback.send.args, fallback.send.callId, resolveToolCallDisplay(toolContext, 'emojiSendTool'));
        legacy.toolResult(fallback.send.callId, fallback.send.result);
      } catch (error) {
        console.warn('[PiSessionService] Emoji fallback skipped:', error);
      }
    };

    const emitTerminalFromAssistant = async (assistant?: PiAssistantMessage): Promise<void> => {
      if (terminalEmitted) return;

      if (!assistant) {
        legacy.done();
        terminalEmitted = true;
        return;
      }

      await emitEmojiFallbackIfNeeded(assistant);
      this.completeFromAssistantMessage(assistant, legacy, resolved);
      terminalEmitted = true;
    };

    const scheduleTerminalFromAssistant = (assistant?: PiAssistantMessage): Promise<void> => {
      terminalPromise ||= emitTerminalFromAssistant(assistant);
      return terminalPromise;
    };

    const unsubscribe = session.subscribe((event) => {
      sawEvents = true;

      switch (event.type) {
        case 'message_update':
          this.handleCodingSessionMessageUpdate(event, legacy, emittedToolCalls, toolCallNames, toolContext);
          return;
        case 'tool_execution_start':
          toolCallNames.set(event.toolCallId, event.toolName);
          if (!emittedToolCalls.has(event.toolCallId)) {
            emittedToolCalls.add(event.toolCallId);
            legacy.toolCall(event.toolName, event.args, event.toolCallId, resolveToolCallDisplay(toolContext, event.toolName));
          }
          return;
        case 'tool_execution_end':
          if (isEmojiSendToolName(toolCallNames.get(event.toolCallId)) && isSuccessfulEmojiSendResult(event.result)) {
            emojiSendCompleted = true;
          }
          legacy.toolResult(event.toolCallId, event.result);
          return;
        case 'message_end':
          if (event.message.role === 'assistant') {
            lastAssistant = event.message as PiAssistantMessage;
          }
          return;
        case 'agent_end':
          void scheduleTerminalFromAssistant(lastAssistant || findLastAssistantMessage(event.messages as PiMessage[]));
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
      inspectCodingSessionPrompt({
        activeTools: getActiveSessionTools(session),
        promptState,
        resolved,
        source: 'pi-coding-session',
        systemPrompt: session.systemPrompt,
        transport: 'pi-coding-agent.stream'
      });
      await session.agent.prompt(promptState.prompt);

      if (terminalPromise) {
        await terminalPromise;
      } else if (!terminalEmitted) {
        await scheduleTerminalFromAssistant(lastAssistant || findLastAssistantMessage(session.state.messages as PiMessage[]));
      }

      return { usedSession: true };
    } catch (error) {
      if (sawEvents) {
        if (terminalPromise) {
          await terminalPromise.catch((terminalError) => {
            console.warn('[PiSessionService] Terminal stream emission failed:', terminalError);
            if (!terminalEmitted) {
              legacy.error(normalizePiError(terminalError));
              legacy.done();
              terminalEmitted = true;
            }
          });
          return { usedSession: true };
        }

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

  private async chatWithCodingSession(
    resolved: ResolvedPiRequest,
    model: PiModel,
    context: PiContext,
    skillRuntime?: PiSkillRuntimeContext
  ): Promise<{ response?: ChatResponse; usedSession: boolean; error?: Error }> {
    const promptState = splitSessionPrompt(context.messages);
    if (!promptState) return { usedSession: false };

    let sessionHandle;

    try {
      sessionHandle = await this.sessionFactory.createCodingSession({
        model,
        resolved,
        ...(skillRuntime
          ? {
            skillRegistry: skillRuntime.registry,
            skillSessionState: skillRuntime.state
          }
          : {}),
        systemPrompt: context.systemPrompt,
        thinkingLevel: resolveSessionThinkingLevel(resolved.request)
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[PiSessionService] Failed to create coding session for non-streaming chat:', err);
      return { error: err, usedSession: false };
    }

    const { dispose, session, toolContext } = sessionHandle;
    this.attachForkedSkillRunner({
      model,
      promptState,
      resolved,
      systemPrompt: context.systemPrompt,
      toolContext
    });

    try {
      session.agent.replaceMessages(promptState.history as any);
      inspectCodingSessionPrompt({
        activeTools: getActiveSessionTools(session),
        promptState,
        resolved,
        source: 'pi-coding-session',
        systemPrompt: session.systemPrompt,
        transport: 'pi-coding-agent.complete'
      });
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
    const usage = extractPiTokenUsage(message);
    const rawUsage = extractPiRawUsage(message);
    const providerRequestId = extractPiProviderRequestId(message);
    legacy.complete(
      createLegacyAssistantMessage(
        extractAssistantText(message),
        {
          model: resolved.model.modelId || message.model,
          piProvider: message.provider,
          piStopReason: message.stopReason,
          ...(providerRequestId ? { providerRequestId } : {}),
          runtime: 'pi',
          ...(rawUsage ? { piRawUsage: rawUsage } : {}),
          ...(thinkingBlocks ? { thinkingBlocks } : {})
        },
        usage
      )
    );
    legacy.done();
  }

  private handleCodingSessionMessageUpdate(
    event: Extract<PiAgentSessionEvent, { type: 'message_update' }>,
    legacy: ReturnType<typeof createLegacyStreamEmitter>,
    emittedToolCalls: Set<string>,
    toolCallNames?: Map<string, string>,
    toolContext?: PiSessionToolContext
  ): void {
    const assistantEvent = event.assistantMessageEvent;

    switch (assistantEvent.type) {
      case 'text_delta':
        legacy.delta(assistantEvent.delta);
        return;
      case 'thinking_delta':
        legacy.thinkingDelta(assistantEvent.delta);
        return;
      case 'toolcall_end':
        toolCallNames?.set(assistantEvent.toolCall.id, assistantEvent.toolCall.name);
        if (!emittedToolCalls.has(assistantEvent.toolCall.id)) {
          emittedToolCalls.add(assistantEvent.toolCall.id);
          legacy.toolCall(assistantEvent.toolCall.name, assistantEvent.toolCall.arguments, assistantEvent.toolCall.id, resolveToolCallDisplay(toolContext, assistantEvent.toolCall.name));
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
        const usage = extractPiTokenUsage(event.message);
        const rawUsage = extractPiRawUsage(event.message);
        const providerRequestId = extractPiProviderRequestId(event.message);
        legacy.complete(
          createLegacyAssistantMessage(
            extractAssistantText(event.message),
            {
              model: resolved.model.modelId || event.message.model,
              piProvider: event.message.provider,
              piStopReason: event.reason,
              ...(providerRequestId ? { providerRequestId } : {}),
              runtime: 'pi',
              ...(rawUsage ? { piRawUsage: rawUsage } : {}),
              ...(thinkingBlocks ? { thinkingBlocks } : {})
            },
            usage
          )
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
