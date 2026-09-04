import { extractThinkingTextFromMetadata, readThinkingBlocksFromMetadata, splitThinkingTagsFromText, type ThinkingMetadataBlock } from './thinking-content';
import { CHAT_MESSAGE_DISPLAY_PARTS_METADATA_KEY, ChatMessage, ChatMessageDisplayPart, ChatRequest, type ToolCallDisplay } from './types';

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function shouldNormalizeInlineThinkingTags(providerId?: string): boolean {
  return providerId === 'minimax';
}

function toThinkingBlocks(thinking: string): ThinkingMetadataBlock[] | undefined {
  if (!thinking.trim()) {
    return undefined;
  }

  return [{ type: 'thinking', thinking }];
}

export function getRealtimeSpeechScope(req: ChatRequest): 'mainChat' | undefined {
  const scope = req.extras?.realtimeSpeechScope;
  return scope === 'mainChat' ? scope : undefined;
}

export function appendTextDisplayPart(parts: ChatMessageDisplayPart[], text: string): void {
  const last = parts[parts.length - 1];
  if (last?.type === 'text') {
    last.text += text;
    return;
  }

  parts.push({ text, type: 'text' });
}

export function appendThinkingDisplayPart(parts: ChatMessageDisplayPart[], thinking: string): void {
  const last = parts[parts.length - 1];
  if (last?.type === 'thinking') {
    last.thinking += thinking;
    return;
  }

  parts.push({ thinking, type: 'thinking' });
}

export function appendToolDisplayPart(parts: ChatMessageDisplayPart[], callId: string): void {
  if (!callId || parts.some((part) => part.type === 'tool' && part.callId === callId)) {
    return;
  }

  parts.push({ callId, type: 'tool' });
}

export function extractResourceContextIds(req: ChatRequest, messages?: ChatMessage[], toolCalls?: Array<{ args?: any; name?: string; result?: any }>): string[] {
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

export function shouldAppendToolDisplayPart(display?: ToolCallDisplay): boolean {
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

export function attachDisplayParts(message: ChatMessage, parts: ChatMessageDisplayPart[]): ChatMessage {
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

export function finalizeDisplayParts(parts: ChatMessageDisplayPart[], message?: ChatMessage): ChatMessageDisplayPart[] {
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

export function normalizeAssistantThinkingMessage(
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
