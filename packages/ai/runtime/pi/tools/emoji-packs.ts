import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

import { listEmojiPackNodes, listEmojiPacks, resolveEmojiFromPack, searchEmojiPacks } from '../../../../../electron/main/handlers/emoji-packs/service';
import type { EmojiPackSearchResult } from '../../../../../electron/main/handlers/emoji-packs/types';
import type { PiSessionToolContext } from '../tool-context';
import { PI_CONTENT_ONLY_TOOL_DISPLAY, PI_HIDDEN_TOOL_DISPLAY, type PiChatDisplayToolConfig } from './display';
import { createJsonToolResult } from './result';

const DEFAULT_EMOJI_SEARCH_LIMIT = 8;
const MAX_EMOJI_SEARCH_LIMIT = 24;
const DEFAULT_EMOJI_LIST_LIMIT = 16;
const MAX_EMOJI_LIST_LIMIT = 80;
const MAX_STORED_EMOJI_CANDIDATES = 200;
const MAX_STORED_SENT_EMOJIS = 500;

const emojiListParameters = Type.Object({
  limit: Type.Optional(Type.Number({ description: 'Maximum number of entries to return. Default 16, max 80.' })),
  packId: Type.Optional(Type.String({ description: 'Emoji pack id. Omit to list imported packs.' })),
  relativePath: Type.Optional(Type.String({ description: 'Folder relative path returned by a previous emojiListTool call.' }))
});

const emojiSearchParameters = Type.Object({
  limit: Type.Optional(Type.Number({ description: 'Maximum number of image matches. Default 8, max 24.' })),
  packId: Type.Optional(Type.String({ description: 'Optional emoji pack id to constrain search.' })),
  query: Type.String({
    description: 'Short literal filename/folder keyword. Space-separated words are ranked separately; exact phrases and all-word matches are boosted, but partial matches can still be returned.'
  })
});

const emojiSendParameters = Type.Object({
  allowRepeat: Type.Optional(Type.Boolean({ description: 'Set true only when intentionally sending an emoji already used in this conversation.' })),
  caption: Type.Optional(Type.String({ description: 'Optional short text to accompany the meme image.' })),
  candidateId: Type.Optional(Type.String({ description: 'Compact candidateId returned by emojiSearchTool or emojiListTool.' })),
  packId: Type.Optional(Type.String({ description: 'Emoji pack id from emojiListTool. Optional when candidateId is provided.' })),
  relativePath: Type.Optional(Type.String({ description: 'Image relativePath from emojiListTool. Optional when candidateId is provided.' }))
});

type StoredEmojiCandidate = Pick<EmojiPackSearchResult, 'mimeType' | 'packId' | 'packName' | 'relativePath' | 'title' | 'url'>;

interface EmojiConversationToolState {
  candidates: Map<string, StoredEmojiCandidate>;
  loadedHistory: boolean;
  loadingHistory?: Promise<void>;
  nextCandidateIndex: number;
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
      candidates: new Map(),
      loadedHistory: false,
      nextCandidateIndex: 1,
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

function syncCandidateIndex(state: EmojiConversationToolState, candidateId: string): void {
  const match = /^e(\d+)$/.exec(candidateId.trim());
  if (!match) return;
  const nextIndex = Number(match[1]) + 1;
  if (Number.isFinite(nextIndex) && nextIndex > state.nextCandidateIndex) {
    state.nextCandidateIndex = nextIndex;
  }
}

function rememberSearchCandidateFromHistory(state: EmojiConversationToolState, candidateId: string | undefined, item: StoredEmojiCandidate): void {
  if (!candidateId) return;
  const normalizedCandidateId = candidateId.trim();
  if (!normalizedCandidateId) return;

  state.candidates.set(normalizedCandidateId, item);
  syncCandidateIndex(state, normalizedCandidateId);

  while (state.candidates.size > MAX_STORED_EMOJI_CANDIDATES) {
    const oldest = state.candidates.keys().next().value;
    if (!oldest) break;
    state.candidates.delete(oldest);
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

  const args = parseMaybeJson(toolCall?.args);
  if (args?.packId && args?.relativePath) {
    return {
      packId: String(args.packId),
      relativePath: String(args.relativePath)
    };
  }

  return undefined;
}

function readEmojiSearchToolCallCandidates(toolCall: any): Array<{ candidateId?: string; item: StoredEmojiCandidate }> {
  const resultDetails = parseMaybeJson(toolCall?.result)?.details || parseMaybeJson(toolCall?.result);
  const resultItems = Array.isArray(resultDetails?.results) ? resultDetails.results : [];
  const nodeItems = Array.isArray(resultDetails?.nodes) ? resultDetails.nodes.filter((item: any) => item?.kind === 'file') : [];
  const packName = typeof resultDetails?.pack?.name === 'string' ? resultDetails.pack.name : '';
  return [...resultItems, ...nodeItems]
    .map((item: any): { candidateId?: string; item: StoredEmojiCandidate } | undefined => {
      if (!item?.packId || !item?.relativePath || !item?.title || !item?.mimeType) return undefined;
      return {
        candidateId: typeof item.candidateId === 'string' ? item.candidateId : undefined,
        item: {
          mimeType: String(item.mimeType),
          packId: String(item.packId),
          packName: typeof item.packName === 'string' ? String(item.packName) : packName,
          relativePath: String(item.relativePath),
          title: String(item.title),
          url: typeof item.url === 'string' ? String(item.url) : ''
        }
      };
    })
    .filter((entry: { candidateId?: string; item: StoredEmojiCandidate } | undefined): entry is { candidateId?: string; item: StoredEmojiCandidate } => Boolean(entry));
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

        if (toolCall?.name === 'emojiSearchTool' || toolCall?.name === 'emoji-search' || toolCall?.name === 'emojiListTool' || toolCall?.name === 'emoji-list') {
          for (const candidate of readEmojiSearchToolCallCandidates(toolCall)) {
            if (candidate.candidateId) {
              rememberSearchCandidateFromHistory(state, candidate.candidateId, candidate.item);
            }
          }
        }
      }
    }

    state.loadedHistory = true;
  })().finally(() => {
    state.loadingHistory = undefined;
  });

  await state.loadingHistory;
}

function resolveEmojiSearchLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_EMOJI_SEARCH_LIMIT;
  return Math.max(1, Math.min(Math.floor(limit || DEFAULT_EMOJI_SEARCH_LIMIT), MAX_EMOJI_SEARCH_LIMIT));
}

function resolveEmojiListLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_EMOJI_LIST_LIMIT;
  return Math.max(1, Math.min(Math.floor(limit || DEFAULT_EMOJI_LIST_LIMIT), MAX_EMOJI_LIST_LIMIT));
}

function rememberSearchCandidate(state: EmojiConversationToolState, item: StoredEmojiCandidate): string {
  const candidateId = `e${state.nextCandidateIndex++}`;
  state.candidates.set(candidateId, item);
  while (state.candidates.size > MAX_STORED_EMOJI_CANDIDATES) {
    const oldest = state.candidates.keys().next().value;
    if (!oldest) break;
    state.candidates.delete(oldest);
  }
  return candidateId;
}

function truncateToolText(value: string, maxLength = 28): string {
  const normalized = value.trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function compactPackForModel(pack: { id: string; name: string; topLevelFolders?: string[]; totalFileCount: number }) {
  return {
    folders: pack.topLevelFolders?.slice(0, 24),
    id: pack.id,
    name: pack.name,
    total: pack.totalFileCount
  };
}

function compactNodeForModel(node: ReturnType<typeof compactListNodeDetails>[number]) {
  if (node.kind === 'folder') {
    return `${node.relativePath || node.name} (${node.totalFileCount} files)`;
  }

  return `${node.candidateId}: ${truncateToolText(node.title)}${node.sentBefore ? ' [sentBefore]' : ''}`;
}

function compactListNodeDetails(nodes: Awaited<ReturnType<typeof listEmojiPackNodes>>['nodes'], state: EmojiConversationToolState) {
  return nodes.map((node) =>
    node.kind === 'folder'
      ? {
        childFolderCount: node.childFolderCount,
        fileCount: node.fileCount,
        kind: node.kind,
        name: node.name,
        packId: node.packId,
        relativePath: node.relativePath,
        totalFileCount: node.totalFileCount
      }
      : (() => {
        const candidateId = rememberSearchCandidate(state, {
          mimeType: node.mimeType,
          packId: node.packId,
          packName: node.packName,
          relativePath: node.relativePath,
          title: node.title,
          url: node.url
        });
        const key = emojiKey(node.packId, node.relativePath);
        return {
          candidateId,
          kind: node.kind,
          mimeType: node.mimeType,
          name: node.name,
          packId: node.packId,
          relativePath: node.relativePath,
          sentBefore: key && state.sentKeys.has(key) ? true : undefined,
          title: node.title
        };
      })()
  );
}

export function createPiEmojiListTool(toolContext?: PiSessionToolContext): ToolDefinition<typeof emojiListParameters> & PiChatDisplayToolConfig {
  return {
    chatDisplay: PI_HIDDEN_TOOL_DISPLAY,
    description:
      'List imported meme/emoji packs or one folder level inside a pack. File nodes include candidateId values for emojiSendTool. In emoji mode, casual chat should usually continue from a relevant list result to emojiSendTool instead of stopping at text-only replies.',
    label: 'emojiListTool',
    name: 'emojiListTool',
    parameters: emojiListParameters,
    async execute(_toolCallId, input) {
      if (!input.packId) {
        const packs = await listEmojiPacks();
        const details = {
          mode: 'packs',
          nextStep: packs.length
            ? 'Pick a relevant packId/folder from this overview, then call emojiListTool again; in casual chat, continue until you can send one file candidate.'
            : 'Import an emoji pack before using emojiSendTool.',
          packs: packs.map((pack) => ({
            id: pack.id,
            name: pack.name,
            topLevelFolders: pack.topLevelFolders.slice(0, 48),
            totalFileCount: pack.totalFileCount
          })),
          success: true
        };
        return createJsonToolResult(details, {
          content: `emoji packs: ${details.packs
            .map((pack) => {
              const compactPack = compactPackForModel(pack);
              return `${compactPack.id} (${compactPack.name}, ${compactPack.total} files${compactPack.folders?.length ? `, folders: ${compactPack.folders.join(', ')}` : ''})`;
            })
            .join('; ')}. ${details.nextStep}`
        });
      }

      const result = await listEmojiPackNodes({
        limit: resolveEmojiListLimit(input.limit),
        packId: input.packId,
        relativePath: input.relativePath
      });

      if (!result.pack) {
        const packs = await listEmojiPacks();
        const details = {
          error: `Emoji packId not found: ${input.packId}`,
          mode: 'packs',
          nextStep: 'Use one of these packId values exactly, or call emojiSearchTool without packId.',
          packs: packs.map((pack) => ({
            id: pack.id,
            name: pack.name,
            topLevelFolders: pack.topLevelFolders.slice(0, 48),
            totalFileCount: pack.totalFileCount
          })),
          success: false
        };
        return createJsonToolResult(details, {
          content: `${details.error}. Available packs: ${details.packs.map((pack) => pack.id).join(', ')}. ${details.nextStep}`
        });
      }

      const state = getEmojiConversationState(toolContext);
      await ensureEmojiConversationHistoryLoaded(toolContext, state);
      const nodes = compactListNodeDetails(result.nodes, state);
      const details = {
        mode: 'nodes',
        nodes,
        pack: result.pack
          ? {
            id: result.pack.id,
            name: result.pack.name,
            totalFileCount: result.pack.totalFileCount
          }
          : undefined,
        success: true
      };
      const folders = details.nodes.filter((node) => node.kind === 'folder').map(compactNodeForModel);
      const files = details.nodes.filter((node) => node.kind === 'file').map(compactNodeForModel);
      return createJsonToolResult(details, {
        content: [
          `emoji list ${details.pack?.id || input.packId}${input.relativePath ? `/${input.relativePath}` : ''}: ${details.nodes.length} items.`,
          folders.length ? `folders: ${folders.join('; ')}` : '',
          files.length ? `files: ${files.join('; ')}` : '',
          files.length
            ? 'Emoji mode is on: send one fitting file with emojiSendTool({ candidateId }) unless this reply should avoid images.'
            : 'List a relevant folder with emojiListTool({ packId, relativePath }) until file candidates appear.'
        ]
          .filter(Boolean)
          .join('\n')
      });
    }
  };
}

export function createPiEmojiSearchTool(toolContext?: PiSessionToolContext): ToolDefinition<typeof emojiSearchParameters> {
  return {
    description:
      'Search imported meme/emoji image filenames and folder paths with literal keywords. Returns compact candidateId entries without image URLs. In emoji mode, if results are suitable for a casual reply, continue to emojiSendTool instead of replying text-only. If the prompt overview already shows a relevant pack/folder category, prefer emojiListTool for that folder instead of guessing many searches. Do not repeatedly search with synonyms after one weak/empty result.',
    label: 'emojiSearchTool',
    name: 'emojiSearchTool',
    parameters: emojiSearchParameters,
    async execute(_toolCallId, input) {
      const state = getEmojiConversationState(toolContext);
      await ensureEmojiConversationHistoryLoaded(toolContext, state);

      const requestedLimit = resolveEmojiSearchLimit(input.limit);
      const searchLimit = Math.max(requestedLimit, Math.min(MAX_EMOJI_SEARCH_LIMIT, requestedLimit + Math.min(state.sentKeys.size, requestedLimit * 2)));
      const results = await searchEmojiPacks({
        limit: searchLimit,
        packId: input.packId,
        query: input.query
      });

      const ranked = results
        .map((item) => {
          const candidateId = rememberSearchCandidate(state, {
            mimeType: item.mimeType,
            packId: item.packId,
            packName: item.packName,
            relativePath: item.relativePath,
            title: item.title,
            url: item.url
          });
          const searchKey = emojiKey(item.packId, item.relativePath);
          const alreadySent = Boolean(searchKey && state.sentKeys.has(searchKey));
          return { alreadySent, candidateId, item };
        })
        .sort((left, right) => Number(left.alreadySent) - Number(right.alreadySent));

      const compactResults = ranked.slice(0, requestedLimit).map(({ alreadySent, candidateId, item }) => ({
        candidateId,
        mimeType: item.mimeType,
        packId: item.packId,
        relativePath: item.relativePath,
        sentBefore: alreadySent ? true : undefined,
        title: item.title
      }));
      const hasUnsentResult = compactResults.some((item) => !item.sentBefore);

      const details = {
        nextStep: compactResults.length
          ? hasUnsentResult
            ? 'Emoji mode is on: call emojiSendTool with a fitting candidateId unless this reply should avoid images. Prefer results without sentBefore.'
            : 'All close matches were already sent in this conversation. Try a different query.'
          : 'Do not keep guessing search keywords. Use emojiListTool with a relevant packId/folder from the emoji pack overview.',
        query: input.query,
        results: compactResults,
        success: true
      };

      return createJsonToolResult(details, {
        content: {
          nextStep: details.nextStep,
          query: details.query,
          results: details.results.map((item) => ({
            candidateId: item.candidateId,
            sentBefore: item.sentBefore,
            title: item.title
          })),
          success: details.success
        }
      });
    }
  };
}

export function createPiEmojiSendTool(toolContext?: PiSessionToolContext): ToolDefinition<typeof emojiSendParameters> & PiChatDisplayToolConfig {
  return {
    chatDisplay: PI_CONTENT_ONLY_TOOL_DISPLAY,
    description:
      'Send one selected meme/emoji image into the chat bubble. Prefer using candidateId from emojiSearchTool or emojiListTool. In emoji mode, casual chat should usually call this once after a suitable candidate appears; do not stop after listing/searching candidates unless the reply should avoid images.',
    label: 'emojiSendTool',
    name: 'emojiSendTool',
    parameters: emojiSendParameters,
    async execute(_toolCallId, input) {
      const state = getEmojiConversationState(toolContext);
      await ensureEmojiConversationHistoryLoaded(toolContext, state);

      const candidate = input.candidateId ? state.candidates.get(input.candidateId.trim()) : undefined;
      const packId = candidate?.packId || input.packId?.trim();
      const relativePath = candidate?.relativePath || input.relativePath?.trim();
      const selectedKey = emojiKey(packId, relativePath);
      const alreadySent = Boolean(selectedKey && state.sentKeys.has(selectedKey));

      if (!packId || !relativePath) {
        const details = {
          error: 'Emoji image not found. Missing packId/relativePath or candidateId.',
          success: false
        };
        return createJsonToolResult(details);
      }

      if (alreadySent && !input.allowRepeat) {
        const details = {
          error: 'This emoji was already sent in this conversation. Pick another candidate or set allowRepeat to true if you intentionally want to repeat it.',
          packId,
          relativePath,
          success: false
        };
        return createJsonToolResult(details, {
          content: {
            error: details.error,
            success: details.success
          }
        });
      }

      const emoji = await resolveEmojiFromPack({
        packId,
        relativePath
      });

      if (!emoji) {
        const details = {
          error: 'Emoji image not found.',
          success: false
        };
        return createJsonToolResult(details);
      }

      rememberSentEmoji(state, emoji.packId, emoji.relativePath);

      const details = {
        caption: input.caption,
        emoji: {
          mimeType: emoji.mimeType,
          packId: emoji.packId,
          packName: emoji.packName,
          relativePath: emoji.relativePath,
          title: emoji.title,
          url: emoji.url
        },
        markdown: `![${emoji.title}](${emoji.url})`,
        sentBefore: alreadySent,
        success: true
      };

      return createJsonToolResult(details, {
        content: {
          caption: details.caption,
          sentBefore: details.sentBefore,
          success: details.success,
          title: details.emoji.title
        }
      });
    }
  };
}
