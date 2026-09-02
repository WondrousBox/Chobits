import type { SpeechDisplayTextFilter } from '@packages/ai/speech-display-filter';
import { CHAT_MESSAGE_DISPLAY_PARTS_METADATA_KEY } from '@packages/ai/types';

import type { ToolActivity } from './ToolCallActivity';

export type ChatMessageDisplayPart =
  { id: string; type: 'text'; content: string } | { id: string; type: 'thinking'; thinking: string; isThinking?: boolean } | { id: string; type: 'tool'; activity: ToolActivity };

export interface TimelineMessage {
  content: string;
  activities?: ToolActivity[];
  displayParts?: ChatMessageDisplayPart[];
  isThinking?: boolean;
  speechDisplayTextFilter?: SpeechDisplayTextFilter;
  thinking?: string;
}

type MetadataDisplayPart = Record<string, unknown>;

function createPartId(type: ChatMessageDisplayPart['type'], index: number): string {
  return `${type}-${index}`;
}

function cloneDisplayParts(parts?: ChatMessageDisplayPart[]): ChatMessageDisplayPart[] {
  return (parts || []).map((part) => {
    if (part.type === 'tool') {
      return { ...part, activity: { ...part.activity } };
    }

    return { ...part };
  });
}

function finishThinkingParts(parts: ChatMessageDisplayPart[]): ChatMessageDisplayPart[] {
  return parts.map((part) => (part.type === 'thinking' && part.isThinking ? { ...part, isThinking: false } : part));
}

function createTextPart(content: string, index: number): ChatMessageDisplayPart {
  return { content, id: createPartId('text', index), type: 'text' };
}

function createThinkingPart(thinking: string, index: number, isThinking = false): ChatMessageDisplayPart {
  return { id: createPartId('thinking', index), isThinking, thinking, type: 'thinking' };
}

function createToolPart(activity: ToolActivity, index: number): ChatMessageDisplayPart {
  return { activity, id: createPartId('tool', index), type: 'tool' };
}

function readToolDetails(result: any): any {
  return result?.details || result;
}

function needsHiddenEmojiFallbackPart(activity: ToolActivity): boolean {
  if (activity.display?.mode !== 'hidden') return false;
  if (activity.name !== 'emojiSendTool' && activity.name !== 'emoji-send') return false;
  const details = readToolDetails(activity.result) || {};
  return details.displayTarget === 'sprite-bubble' && details.spriteBubbleDelivered === false;
}

function ensureDisplayParts(message: TimelineMessage): ChatMessageDisplayPart[] {
  if (message.displayParts) {
    return cloneDisplayParts(message.displayParts);
  }

  const parts: ChatMessageDisplayPart[] = [];
  if (message.thinking) {
    parts.push(createThinkingPart(message.thinking, parts.length, !!message.isThinking));
  }

  for (const activity of message.activities || []) {
    parts.push(createToolPart(activity, parts.length));
  }

  if (message.content) {
    parts.push(createTextPart(message.content, parts.length));
  }

  return parts;
}

function upsertActivity(activities: ToolActivity[] | undefined, activity: ToolActivity): ToolActivity[] {
  const existing = activities || [];
  const index = existing.findIndex((item) => item.callId === activity.callId);

  if (index < 0) {
    return [...existing, activity];
  }

  const next = existing.slice();
  next[index] = { ...next[index], ...activity };
  return next;
}

function updateActivityList(activities: ToolActivity[] | undefined, callId: string, updater: (activity: ToolActivity) => ToolActivity): ToolActivity[] | undefined {
  if (!activities?.length) {
    return activities;
  }

  return activities.map((activity) => (activity.callId === callId ? updater(activity) : activity));
}

function updateToolParts(parts: ChatMessageDisplayPart[] | undefined, callId: string, updater: (activity: ToolActivity) => ToolActivity): ChatMessageDisplayPart[] | undefined {
  if (!parts?.length) {
    return parts;
  }

  return parts.map((part) => (part.type === 'tool' && part.activity.callId === callId ? { ...part, activity: updater(part.activity) } : part));
}

export function appendTextPart<TMessage extends TimelineMessage>(message: TMessage, text: string): TMessage {
  const parts = finishThinkingParts(ensureDisplayParts(message));
  const last = parts[parts.length - 1];

  if (last?.type === 'text') {
    parts[parts.length - 1] = { ...last, content: last.content + text };
  } else {
    parts.push(createTextPart(text, parts.length));
  }

  return {
    ...message,
    content: (message.content || '') + text,
    displayParts: parts,
    isThinking: false
  };
}

export function appendThinkingPart<TMessage extends TimelineMessage>(message: TMessage, text: string): TMessage {
  const parts = ensureDisplayParts(message);
  const last = parts[parts.length - 1];

  if (last?.type === 'thinking') {
    parts[parts.length - 1] = { ...last, isThinking: true, thinking: last.thinking + text };
  } else {
    parts.push(createThinkingPart(text, parts.length, true));
  }

  return {
    ...message,
    displayParts: parts,
    isThinking: true,
    thinking: (message.thinking || '') + text
  };
}

export function appendToolPart<TMessage extends TimelineMessage>(message: TMessage, activity: ToolActivity): TMessage {
  const parts = finishThinkingParts(ensureDisplayParts(message));
  const existingIndex = parts.findIndex((part) => part.type === 'tool' && part.activity.callId === activity.callId);

  if (existingIndex >= 0) {
    const existing = parts[existingIndex];
    if (existing.type === 'tool') {
      parts[existingIndex] = { ...existing, activity: { ...existing.activity, ...activity } };
    }
  } else {
    parts.push(createToolPart(activity, parts.length));
  }

  return {
    ...message,
    activities: upsertActivity(message.activities, activity),
    displayParts: parts,
    isThinking: false
  };
}

export function updateToolPart<TMessage extends TimelineMessage>(message: TMessage, callId: string, updater: (activity: ToolActivity) => ToolActivity): TMessage {
  return {
    ...message,
    activities: updateActivityList(message.activities, callId, updater),
    displayParts: updateToolParts(message.displayParts, callId, updater)
  };
}

export function finalizeTimelineMessage<TMessage extends TimelineMessage>(message: TMessage, options: { content?: string; thinking?: string } = {}): TMessage {
  const content = options.content ?? message.content;
  const thinking = options.thinking || message.thinking;
  const hasExistingParts = !!message.displayParts?.length;
  const parts = hasExistingParts ? finishThinkingParts(cloneDisplayParts(message.displayParts)) : ensureDisplayParts({ ...message, content, thinking });
  const textPartIndexes = parts.flatMap((part, index) => (part.type === 'text' && part.content ? [index] : []));
  const thinkingPartIndexes = parts.flatMap((part, index) => (part.type === 'thinking' && part.thinking ? [index] : []));

  if (thinkingPartIndexes.length === 1 && thinking) {
    parts[thinkingPartIndexes[0]] = createThinkingPart(thinking, thinkingPartIndexes[0], false);
  } else if (thinkingPartIndexes.length === 0 && thinking) {
    parts.unshift(createThinkingPart(thinking, 0, false));
  }

  if (textPartIndexes.length === 1 && content) {
    parts[textPartIndexes[0]] = createTextPart(content, textPartIndexes[0]);
  } else if (textPartIndexes.length === 0 && content) {
    parts.push(createTextPart(content, parts.length));
  }

  return {
    ...message,
    content,
    displayParts: parts.map((part, index) => ({ ...part, id: part.id || createPartId(part.type, index) })),
    isThinking: false,
    ...(thinking ? { thinking } : {})
  };
}

export function readDisplayPartsFromMetadata(metadata: unknown, activities?: ToolActivity[]): ChatMessageDisplayPart[] | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }

  const rawParts = (metadata as Record<string, unknown>)[CHAT_MESSAGE_DISPLAY_PARTS_METADATA_KEY];
  if (!Array.isArray(rawParts)) {
    return undefined;
  }

  const activityByCallId = new Map((activities || []).map((activity) => [activity.callId, activity]));
  const includedToolCallIds = new Set<string>();
  const parts: ChatMessageDisplayPart[] = [];

  for (const rawPart of rawParts as MetadataDisplayPart[]) {
    if (!rawPart || typeof rawPart !== 'object') {
      continue;
    }

    if (rawPart.type === 'text') {
      const content = typeof rawPart.text === 'string' ? rawPart.text : typeof rawPart.content === 'string' ? rawPart.content : '';
      if (content) {
        parts.push(createTextPart(content, parts.length));
      }
      continue;
    }

    if (rawPart.type === 'thinking') {
      const thinking = typeof rawPart.thinking === 'string' ? rawPart.thinking : '';
      if (thinking) {
        parts.push(createThinkingPart(thinking, parts.length, false));
      }
      continue;
    }

    if (rawPart.type === 'tool') {
      const callId = typeof rawPart.callId === 'string' ? rawPart.callId : typeof rawPart.toolCallId === 'string' ? rawPart.toolCallId : '';
      const activity = callId ? activityByCallId.get(callId) : undefined;
      if (activity) {
        parts.push(createToolPart(activity, parts.length));
        includedToolCallIds.add(activity.callId);
      }
    }
  }

  for (const activity of activities || []) {
    if (includedToolCallIds.has(activity.callId)) continue;
    if (needsHiddenEmojiFallbackPart(activity)) {
      parts.push(createToolPart(activity, parts.length));
    }
  }

  return parts.length ? parts : undefined;
}

export function hasTimelineContent(message: TimelineMessage): boolean {
  return !!message.content || !!message.thinking || !!message.activities?.length || !!message.displayParts?.length;
}
