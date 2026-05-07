import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

import { listEmojiPackNodes, listEmojiPacks, resolveEmojiFromPack, searchEmojiPacks } from '../../../../../electron/main/handlers/emoji-packs/service';
import { createJsonToolResult } from './result';

const emojiListParameters = Type.Object({
  limit: Type.Optional(Type.Number({ description: 'Maximum number of entries to return. Default 60.' })),
  packId: Type.Optional(Type.String({ description: 'Emoji pack id. Omit to list imported packs.' })),
  relativePath: Type.Optional(Type.String({ description: 'Folder relative path returned by a previous emojiListTool call.' }))
});

const emojiSearchParameters = Type.Object({
  limit: Type.Optional(Type.Number({ description: 'Maximum number of image matches. Default 24.' })),
  packId: Type.Optional(Type.String({ description: 'Optional emoji pack id to constrain search.' })),
  query: Type.String({ description: 'Short mood/topic keyword, e.g. 夸奖, 害怕, 睡觉, 加油, 震惊.' })
});

const emojiSendParameters = Type.Object({
  caption: Type.Optional(Type.String({ description: 'Optional short text to accompany the meme image.' })),
  packId: Type.String({ description: 'Emoji pack id from emojiListTool or emojiSearchTool.' }),
  relativePath: Type.String({ description: 'Image relativePath from emojiListTool or emojiSearchTool.' })
});

export function createPiEmojiListTool(): ToolDefinition<typeof emojiListParameters> {
  return {
    description:
      'List imported meme/emoji packs or one folder level inside a pack. Use this progressively and use returned packId values exactly: list packs, choose a relevant top-level folder, then list that folder before sending an image.',
    label: 'emojiListTool',
    name: 'emojiListTool',
    parameters: emojiListParameters,
    async execute(_toolCallId, input) {
      if (!input.packId) {
        const packs = await listEmojiPacks();
        return createJsonToolResult({
          mode: 'packs',
          nextStep: packs.length ? 'Pick a packId and call emojiListTool with that packId to inspect one level.' : 'Import an emoji pack before using emojiSendTool.',
          packs: packs.map((pack) => ({
            id: pack.id,
            name: pack.name,
            previewUrls: pack.previewUrls,
            topLevelFolders: pack.topLevelFolders.slice(0, 48),
            totalFileCount: pack.totalFileCount
          })),
          success: true
        });
      }

      const result = await listEmojiPackNodes({
        limit: input.limit,
        packId: input.packId,
        relativePath: input.relativePath
      });

      if (!result.pack) {
        const packs = await listEmojiPacks();
        return createJsonToolResult({
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
        });
      }

      return createJsonToolResult({
        mode: 'nodes',
        nodes: result.nodes.map((node) =>
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
            : {
                kind: node.kind,
                mimeType: node.mimeType,
                name: node.name,
                packId: node.packId,
                relativePath: node.relativePath,
                title: node.title,
                url: node.url
              }
        ),
        pack: result.pack
          ? {
              id: result.pack.id,
              name: result.pack.name,
              totalFileCount: result.pack.totalFileCount
            }
          : undefined,
        success: true
      });
    }
  };
}

export function createPiEmojiSearchTool(): ToolDefinition<typeof emojiSearchParameters> {
  return {
    description:
      'Search imported meme/emoji image filenames by mood or topic. When emoji mode is enabled, use this proactively for most replies to find a small candidate set before sending one image.',
    label: 'emojiSearchTool',
    name: 'emojiSearchTool',
    parameters: emojiSearchParameters,
    async execute(_toolCallId, input) {
      const results = await searchEmojiPacks({
        limit: input.limit,
        packId: input.packId,
        query: input.query
      });

      return createJsonToolResult({
        results: results.map((item) => ({
          mimeType: item.mimeType,
          packId: item.packId,
          packName: item.packName,
          relativePath: item.relativePath,
          title: item.title,
          url: item.url
        })),
        success: true
      });
    }
  };
}

export function createPiEmojiSendTool(): ToolDefinition<typeof emojiSendParameters> {
  return {
    description:
      'Send one selected meme/emoji image into the chat bubble. Call this only after emojiListTool or emojiSearchTool returned the image relativePath. Prefer exactly one well-matched image per reply when emoji mode is enabled.',
    label: 'emojiSendTool',
    name: 'emojiSendTool',
    parameters: emojiSendParameters,
    async execute(_toolCallId, input) {
      const emoji = await resolveEmojiFromPack({
        packId: input.packId,
        relativePath: input.relativePath
      });

      if (!emoji) {
        return createJsonToolResult({
          error: 'Emoji image not found.',
          success: false
        });
      }

      return createJsonToolResult({
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
        success: true
      });
    }
  };
}
