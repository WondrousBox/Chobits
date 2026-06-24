import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

import { listEmojiPacks, resolveEmojiFromPack, searchEmojiPacks } from '../../../../../electron/main/handlers/emoji-packs/service';
import type { EmojiPackSearchResult } from '../../../../../electron/main/handlers/emoji-packs/types';
import { SpriteManager } from '../../../../sprite-core/manager';
import type { EmojiPacksDisplayTarget } from '../../../types';
import type { PiSessionToolContext } from '../tool-context';
import { PI_CONTENT_ONLY_TOOL_DISPLAY, PI_HIDDEN_TOOL_DISPLAY, type PiChatDisplayToolConfig } from './display';
import { createJsonToolResult } from './result';

const MAX_STORED_SENT_EMOJIS = 500;
const MAX_SEARCH_CANDIDATES = 200;
const RANDOM_FALLBACK_LIMIT = 200;
const SPRITE_BUBBLE_EMOJI_DURATION_MS = 6000;

function resolveEmojiDisplayTarget(toolContext?: PiSessionToolContext): EmojiPacksDisplayTarget {
  return toolContext?.resolved?.request?.extras?.emojiPacksDisplayTarget === 'sprite-bubble' ? 'sprite-bubble' : 'chat';
}

async function pushEmojiToSpriteBubble(toolCallId: string, emoji: { title: string; url: string }, caption?: string): Promise<boolean> {
  try {
    const result = await SpriteManager.getInstance().sendBridgeMessage(
      {
        id: `emoji-send-${toolCallId}`,
        type: 'toast',
        duration: SPRITE_BUBBLE_EMOJI_DURATION_MS,
        image: {
          alt: emoji.title,
          title: caption || emoji.title,
          url: emoji.url
        },
        speak: false
      },
      { target: 'sprite' }
    );
    return result.deliveredToSprite;
  } catch (error) {
    console.warn('[emoji-packs] failed to push emoji to sprite bubble:', error);
    return false;
  }
}

const emojiSendParameters = Type.Object({
  allowRepeat: Type.Optional(Type.Boolean({ description: 'Set true to allow re-sending an emoji already used in this conversation.' })),
  caption: Type.Optional(Type.String({ description: 'Optional short caption shown next to the meme image.' })),
  packId: Type.Optional(Type.String({ description: 'Optional emoji pack id to restrict the candidate pool.' })),
  query: Type.Optional(
    Type.String({
      description: 'Free-form keywords/emotion describing the desired meme (e.g. "开心 庆祝", "猫猫 哭"). Leave empty to pick a random emoji.'
    })
  )
});

interface EmojiConversationToolState {
  loadedHistory: boolean;
  loadingHistory?: Promise<void>;
  sentKeys: Set<string>;
  sentOrder: string[];
}

const emojiConversationStates = new Map<string, EmojiConversationToolState>();

function resolveEmojiStateKey(toolContext?: PiSessionToolContext): string {
  const conversationId = toolContext?.conversationId?.trim();
  if (conversationId) return `conversation:${conversationId}`;

  const requestId = toolContext?.resolved?.request?.requestId?.trim();
  if (requestId) return `request:${requestId}`;

  return 'anonymous';
}

function getEmojiConversationState(toolContext?: PiSessionToolContext): EmojiConversationToolState {
  const key = resolveEmojiStateKey(toolContext);
  let state = emojiConversationStates.get(key);
  if (!state) {
    state = {
      loadedHistory: false,
      sentKeys: new Set(),
      sentOrder: []
    };
    emojiConversationStates.set(key, state);
  }
  return state;
}

function emojiKey(packId?: string, relativePath?: string): string | undefined {
  const normalizedPackId = packId?.trim();
  const normalizedPath = relativePath
    ?.trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
  return normalizedPackId && normalizedPath ? `${normalizedPackId}\n${normalizedPath}` : undefined;
}

function rememberSentEmoji(state: EmojiConversationToolState, packId?: string, relativePath?: string): void {
  const key = emojiKey(packId, relativePath);
  if (!key || state.sentKeys.has(key)) return;
  state.sentKeys.add(key);
  state.sentOrder.push(key);
  while (state.sentOrder.length > MAX_STORED_SENT_EMOJIS) {
    const oldest = state.sentOrder.shift();
    if (oldest) state.sentKeys.delete(oldest);
  }
}

function parseMaybeJson(value: unknown): any {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function readEmojiSendToolCallIdentity(toolCall: any): { packId?: string; relativePath?: string } | undefined {
  const resultDetails = parseMaybeJson(toolCall?.result)?.details || parseMaybeJson(toolCall?.result);
  const emoji = resultDetails?.emoji;
  if (emoji?.packId && emoji?.relativePath) {
    return {
      packId: String(emoji.packId),
      relativePath: String(emoji.relativePath)
    };
  }
  return undefined;
}

async function ensureEmojiConversationHistoryLoaded(toolContext: PiSessionToolContext | undefined, state: EmojiConversationToolState): Promise<void> {
  if (state.loadedHistory) return;
  if (state.loadingHistory) {
    await state.loadingHistory;
    return;
  }

  state.loadingHistory = (async () => {
    const conversationId = toolContext?.conversationId;
    if (!conversationId) {
      state.loadedHistory = true;
      return;
    }

    const messages = await toolContext.chatRepo.listMessages(conversationId, 2000, 0).catch(() => []);
    for (const message of messages) {
      const metadata = parseMaybeJson((message as any)?.metadata);
      const toolCalls = Array.isArray(metadata?.toolCalls) ? metadata.toolCalls : [];
      for (const toolCall of toolCalls) {
        if (toolCall?.name === 'emojiSendTool' || toolCall?.name === 'emoji-send') {
          const identity = readEmojiSendToolCallIdentity(toolCall);
          rememberSentEmoji(state, identity?.packId, identity?.relativePath);
        }
      }
    }

    state.loadedHistory = true;
  })().finally(() => {
    state.loadingHistory = undefined;
  });

  await state.loadingHistory;
}

function pickRandom<T>(items: T[]): T | undefined {
  if (!items.length) return undefined;
  const index = Math.floor(Math.random() * items.length);
  return items[index];
}

interface RankedEmojiCandidate extends EmojiPackSearchResult {
  alreadySent: boolean;
}

type EmojiSelectionSource = 'keyword-search' | 'random-empty-query' | 'random-query-no-match' | 'random-unsent-after-duplicates' | 'repeat-last-resort';

/** Bucket by score tier (>=80 / 60-79 / 40-59 / >0), keep the first non-empty tier, then random pick. */
function pickTieredRandom(candidates: RankedEmojiCandidate[]): RankedEmojiCandidate | undefined {
  if (!candidates.length) return undefined;
  const tiers: RankedEmojiCandidate[][] = [[], [], [], []];
  for (const candidate of candidates) {
    if (candidate.score >= 80) tiers[0].push(candidate);
    else if (candidate.score >= 60) tiers[1].push(candidate);
    else if (candidate.score >= 40) tiers[2].push(candidate);
    else if (candidate.score > 0) tiers[3].push(candidate);
  }
  for (const tier of tiers) {
    const picked = pickRandom(tier);
    if (picked) return picked;
  }
  return pickRandom(candidates);
}

async function collectRandomFallbackCandidates(packId?: string): Promise<EmojiPackSearchResult[]> {
  const packs = await listEmojiPacks();
  if (!packs.length) return [];
  const targetPackId = packId || packs[0].id;
  // Empty query returns every file with score=1 (see service.computeSearchScore).
  const results = await searchEmojiPacks({ limit: RANDOM_FALLBACK_LIMIT, packId: targetPackId, query: '' });
  if (results.length) return results;
  // Fall back to any pack if the requested pack is empty.
  return searchEmojiPacks({ limit: RANDOM_FALLBACK_LIMIT, query: '' });
}

export function createPiEmojiSendTool(toolContext?: PiSessionToolContext): ToolDefinition<typeof emojiSendParameters> & PiChatDisplayToolConfig {
  const displayTarget = resolveEmojiDisplayTarget(toolContext);

  return {
    chatDisplay: displayTarget === 'sprite-bubble' ? PI_HIDDEN_TOOL_DISPLAY : PI_CONTENT_ONLY_TOOL_DISPLAY,
    description:
      'Send one meme/emoji image to the configured display surface. Provide a short literal `query` describing keywords/emotion/scene (e.g. "开心 庆祝", "猫猫 哭"); the tool searches imported packs internally and randomly picks a suitable image. Omit `query` to pick a random emoji. Use only when an emoji actually fits the reply; do not call multiple times per turn.',
    label: 'emojiSendTool',
    name: 'emojiSendTool',
    parameters: emojiSendParameters,
    async execute(_toolCallId, input) {
      const state = getEmojiConversationState(toolContext);
      await ensureEmojiConversationHistoryLoaded(toolContext, state);

      const query = (input.query || '').trim();
      const packId = input.packId?.trim() || undefined;
      const allowRepeat = Boolean(input.allowRepeat);

      let rawCandidates: EmojiPackSearchResult[];
      let searchCandidateCount: number | undefined;
      let selectionSource: EmojiSelectionSource = query ? 'keyword-search' : 'random-empty-query';
      let fallbackReason: string | undefined;
      if (query) {
        rawCandidates = await searchEmojiPacks({ limit: MAX_SEARCH_CANDIDATES, packId, query });
        searchCandidateCount = rawCandidates.length;
        // No keyword match — fall back to a random pick from imported packs so we still try to send something.
        if (!rawCandidates.length) {
          selectionSource = 'random-query-no-match';
          fallbackReason = 'query-no-match';
          rawCandidates = await collectRandomFallbackCandidates(packId);
        }
      } else {
        rawCandidates = await collectRandomFallbackCandidates(packId);
      }

      if (!rawCandidates.length) {
        const details = {
          error: 'No imported emoji packs available. Import an emoji pack before using emojiSendTool.',
          success: false
        };
        return createJsonToolResult(details);
      }

      const ranked: RankedEmojiCandidate[] = rawCandidates.map((item) => {
        const key = emojiKey(item.packId, item.relativePath);
        return {
          ...item,
          alreadySent: Boolean(key && state.sentKeys.has(key))
        };
      });

      const eligible = allowRepeat ? ranked : ranked.filter((item) => !item.alreadySent);

      let selected = pickTieredRandom(eligible);

      // If every match was already sent, fall back to a random unsent emoji from the preferred pack.
      if (!selected && !allowRepeat) {
        selectionSource = 'random-unsent-after-duplicates';
        fallbackReason = fallbackReason || 'all-candidates-already-sent';
        const fallbackRaw = await collectRandomFallbackCandidates(packId);
        const fallbackUnsent = fallbackRaw.filter((item) => {
          const key = emojiKey(item.packId, item.relativePath);
          return !(key && state.sentKeys.has(key));
        });
        const fallback = pickRandom(fallbackUnsent);
        if (fallback) {
          selected = { ...fallback, alreadySent: false };
        }
      }

      // Last resort: allow a repeat from the full ranked pool so we still send something.
      if (!selected) {
        selectionSource = 'repeat-last-resort';
        fallbackReason = fallbackReason || 'repeat-last-resort';
        const fallback = pickRandom(ranked);
        if (fallback) selected = fallback;
      }

      if (!selected) {
        const details = {
          error: 'No emoji candidate could be selected.',
          query: query || undefined,
          success: false
        };
        return createJsonToolResult(details);
      }

      const emoji = await resolveEmojiFromPack({
        packId: selected.packId,
        relativePath: selected.relativePath
      });

      if (!emoji) {
        const details = {
          error: 'Emoji image not found after selection.',
          success: false
        };
        return createJsonToolResult(details);
      }

      rememberSentEmoji(state, emoji.packId, emoji.relativePath);

      const spriteBubbleDelivered = displayTarget === 'sprite-bubble' ? await pushEmojiToSpriteBubble(_toolCallId, emoji, input.caption) : undefined;

      const details = {
        autoFallback: _toolCallId.startsWith('emoji-fallback-send-'),
        caption: input.caption,
        displayTarget,
        emoji: {
          mimeType: emoji.mimeType,
          packId: emoji.packId,
          packName: emoji.packName,
          relativePath: emoji.relativePath,
          title: emoji.title,
          url: emoji.url
        },
        fallbackReason,
        markdown: `![${emoji.title}](${emoji.url})`,
        matched: query ? (searchCandidateCount || 0) > 0 : undefined,
        query: query || undefined,
        searchCandidateCount,
        sentBefore: selected.alreadySent,
        selectedScore: selected.score,
        selectionSource,
        spriteBubbleDelivered,
        success: true
      };

      return createJsonToolResult(details, {
        content: {
          caption: details.caption,
          displayTarget: details.displayTarget,
          fallbackReason: details.fallbackReason,
          matched: details.matched,
          query: details.query,
          selectedScore: details.selectedScore,
          sentBefore: details.sentBefore,
          selectionSource: details.selectionSource,
          success: details.success,
          title: details.emoji.title
        },
        speech: {
          showBubble: false,
          text: details.emoji.title
        }
      });
    }
  };
}
