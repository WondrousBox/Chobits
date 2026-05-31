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
// Minimum score for a search hit to be considered relevant. Below this we'd rather tell
// the model "no good match" than send an unrelated meme.
const MIN_KEYWORD_MATCH_SCORE = 40;
const NO_MATCH_HINT_LIMIT = 8;

function resolveEmojiDisplayTarget(toolContext?: PiSessionToolContext): EmojiPacksDisplayTarget {
  return toolContext?.resolved?.request?.extras?.emojiPacksDisplayTarget === 'sprite-bubble' ? 'sprite-bubble' : 'chat';
}

function pushEmojiToSpriteBubble(toolCallId: string, emoji: { title: string; url: string }, caption?: string): void {
  try {
    SpriteManager.getInstance().sendBridgeMessage(
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
  } catch (error) {
    console.warn('[emoji-packs] failed to push emoji to sprite bubble:', error);
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
      'Send one meme/emoji image. `query` must be 2-5 space-separated **concrete** keywords likely to appear in a meme file name — prefer concrete actions/objects/onomatopoeia/internet slang (e.g. "哭 委屈 猫", "哈哈 笑死 拍桌", "摆烂 躺平", "鞠躬 谢谢") over abstract feelings ("开心"/"难过"). The tool already expands common synonyms internally. If nothing relevant is found the call returns success:false with sample available titles — read them, retry with better keywords, or skip sending. Omit `query` to pick a random emoji intentionally. Send at most 1 emoji per turn; skip the call when no emoji really fits.',
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
      let isRandomMode = false;
      if (query) {
        rawCandidates = await searchEmojiPacks({ limit: MAX_SEARCH_CANDIDATES, packId, query });
        // Keep only relevant hits — drop the score=40 "any substring anywhere" tail and below.
        rawCandidates = rawCandidates.filter((item) => item.score >= MIN_KEYWORD_MATCH_SCORE);
      } else {
        isRandomMode = true;
        rawCandidates = await collectRandomFallbackCandidates(packId);
      }

      if (!rawCandidates.length) {
        if (isRandomMode) {
          return createJsonToolResult({
            error: 'No imported emoji packs available. Import an emoji pack before using emojiSendTool.',
            success: false
          });
        }
        // No relevant match — surface a few real titles so the model can retry with better keywords or skip.
        const hintPool = await collectRandomFallbackCandidates(packId);
        const sampleTitles = Array.from(new Set(hintPool.map((item) => item.title))).slice(0, NO_MATCH_HINT_LIMIT);
        return createJsonToolResult({
          error: 'No emoji matched the given keywords. Retry with more concrete words from the sample titles, or skip sending an emoji this turn.',
          query,
          sampleTitles,
          success: false
        });
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

      // For random mode, allow falling back to a repeat so we still send something.
      if (!selected && isRandomMode) {
        const fallback = pickRandom(ranked);
        if (fallback) selected = fallback;
      }

      if (!selected) {
        // All keyword matches were already sent this conversation.
        return createJsonToolResult({
          error: 'All relevant emojis for these keywords were already sent in this conversation. Pass allowRepeat:true to resend, or skip.',
          query: query || undefined,
          success: false
        });
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

      if (displayTarget === 'sprite-bubble') {
        pushEmojiToSpriteBubble(_toolCallId, emoji, input.caption);
      }

      const details = {
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
        markdown: `![${emoji.title}](${emoji.url})`,
        query: query || undefined,
        sentBefore: selected.alreadySent,
        success: true
      };

      return createJsonToolResult(details, {
        content: {
          caption: details.caption,
          displayTarget: details.displayTarget,
          query: details.query,
          sentBefore: details.sentBefore,
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
