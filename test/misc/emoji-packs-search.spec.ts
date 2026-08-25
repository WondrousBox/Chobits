import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electronState = {
  userDataDir: ''
};

const spriteManagerSendBridgeMessageMock = vi.fn();

vi.mock('electron', () => ({
  app: {
    getPath: () => electronState.userDataDir
  },
  shell: {
    openPath: vi.fn()
  }
}));

vi.mock('../../packages/sprite-core/manager', () => ({
  SpriteManager: {
    getInstance: () => ({
      sendBridgeMessage: spriteManagerSendBridgeMessageMock
    })
  }
}));

vi.mock('../../electron/main/db/repositories', () => ({
  WorkspacesRepo: {
    getDefault: vi.fn(async () => undefined),
    list: vi.fn(async () => [])
  }
}));

vi.mock('../../electron/main/resource-protocol', () => ({
  addAllowedResourceRoot: vi.fn(),
  addWorkspaceResourceRoot: vi.fn()
}));

vi.mock('../../electron/main/handlers/folder/linked-utils', () => ({
  ensureUniquePath: vi.fn(async (targetPath: string) => targetPath)
}));

vi.mock('../../packages/common/libs/7zip-min-electron', () => ({
  unpack: vi.fn((_sourcePath: string, _targetDir: string, callback: (error?: Error) => void) => callback())
}));

function writeJsonFile(filePath: string, payload: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function createManifest(rootPath: string): Record<string, unknown> {
  return {
    id: 'EmojiPackage-1778160720970',
    importedAt: Date.now(),
    name: 'Test Pack',
    rootPath,
    resourcesRootPath: '',
    sourcePath: undefined,
    storageKind: 'userData',
    topLevelFiles: [],
    topLevelFolders: ['斗图', '可爱'],
    totalFileCount: 3,
    totalFolderCount: 3,
    tree: {
      kind: 'folder',
      name: '',
      relativePath: '',
      children: [
        {
          kind: 'folder',
          name: '斗图',
          relativePath: '斗图',
          children: [
            {
              kind: 'folder',
              name: '嚣张',
              relativePath: '斗图/嚣张',
              children: [
                {
                  kind: 'file',
                  name: '嚣张登场.gif',
                  relativePath: '斗图/嚣张/嚣张登场.gif',
                  mimeType: 'image/gif',
                  sizeBytes: 1234,
                  title: '嚣张登场'
                }
              ]
            },
            {
              kind: 'file',
              name: '普通微笑.png',
              relativePath: '斗图/普通微笑.png',
              mimeType: 'image/png',
              sizeBytes: 999,
              title: '普通微笑'
            }
          ]
        },
        {
          kind: 'folder',
          name: '可爱',
          relativePath: '可爱',
          children: [
            {
              kind: 'file',
              name: '嚣张猫.gif',
              relativePath: '可爱/嚣张猫.gif',
              mimeType: 'image/gif',
              sizeBytes: 567,
              title: '嚣张猫'
            }
          ]
        }
      ]
    },
    updatedAt: Date.now(),
    workspaceId: undefined,
    workspaceRootPath: undefined
  };
}

function createToolContext(
  conversationId: string,
  messages: any[] = []
): {
  chatRepo: {
    listMessages: ReturnType<typeof vi.fn>;
  };
  conversationId: string;
  resolved: {
    request: {
      requestId: string;
    };
  };
} {
  return {
    chatRepo: {
      listMessages: vi.fn(async () => messages)
    },
    conversationId,
    resolved: {
      request: {
        requestId: `${conversationId}-request`
      }
    }
  };
}

describe('emoji pack search', () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.resetModules();
    spriteManagerSendBridgeMessageMock.mockClear();
    spriteManagerSendBridgeMessageMock.mockResolvedValue({ deliveredToSprite: true });
    tempDir = path.join(os.tmpdir(), `emoji-pack-search-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    electronState.userDataDir = tempDir;

    const packDir = path.join(tempDir, 'data', 'emoji-packs', 'EmojiPackage-1778160720970');
    mkdirSync(packDir, { recursive: true });
    writeJsonFile(path.join(packDir, 'emoji-pack.manifest.json'), createManifest(packDir));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('ranks space-separated keyword matches without requiring every term', async () => {
    const { searchEmojiPacks } = await import('../../electron/main/handlers/emoji-packs/service');

    const results = await searchEmojiPacks({
      limit: 12,
      packId: 'EmojiPackage-1778160720970',
      query: '斗图 嚣张'
    });

    expect(results.length).toBeGreaterThan(1);
    expect(results[0]).toMatchObject({
      packId: 'EmojiPackage-1778160720970',
      relativePath: '斗图/嚣张/嚣张登场.gif',
      title: '嚣张登场'
    });
    expect(results.some((item) => item.relativePath === '斗图/普通微笑.png')).toBe(true);
    expect(results.some((item) => item.relativePath === '可爱/嚣张猫.gif')).toBe(true);

    const partialResults = await searchEmojiPacks({
      limit: 12,
      packId: 'EmojiPackage-1778160720970',
      query: '斗图 可爱'
    });

    expect(partialResults.map((item) => item.relativePath).sort()).toEqual(['可爱/嚣张猫.gif', '斗图/普通微笑.png', '斗图/嚣张/嚣张登场.gif'].sort());

    const phraseResults = await searchEmojiPacks({
      limit: 12,
      packId: 'EmojiPackage-1778160720970',
      query: '斗图/嚣张'
    });

    expect(phraseResults).toHaveLength(1);
    expect(phraseResults[0].relativePath).toBe('斗图/嚣张/嚣张登场.gif');
  });

  it('returns compact candidates and blocks duplicate sends in one conversation', async () => {
    const { createPiEmojiSendTool } = await import('../../packages/ai/runtime/pi/tools/emoji-packs');
    const toolContext = createToolContext(`conv-compact-${Date.now()}`);
    const sendTool = createPiEmojiSendTool(toolContext as any);

    const firstSend = (
      await sendTool.execute('call-send-1', {
        packId: 'EmojiPackage-1778160720970',
        query: '嚣张'
      })
    ).details as any;

    expect(firstSend.success).toBe(true);
    expect(firstSend.emoji.url).toContain('res://');
    expect(firstSend.speech).toEqual({
      showBubble: false,
      text: firstSend.emoji.title
    });
    expect(firstSend.displayTarget).toBe('chat');

    // Block-duplicate: forcing the same emoji to be picked again must respect sentBefore.
    // We rely on the fact that the only top-tier "嚣张" hit was just sent, so the next
    // call must select something else (random within remaining tier) or fall back.
    const secondSend = (
      await sendTool.execute('call-send-2', {
        packId: 'EmojiPackage-1778160720970',
        query: '嚣张'
      })
    ).details as any;

    expect(secondSend.success).toBe(true);
    expect(secondSend.emoji.relativePath).not.toBe(firstSend.emoji.relativePath);

    // allowRepeat lets the same emoji come back.
    const repeatedSend = (
      await sendTool.execute('call-send-3', {
        allowRepeat: true,
        packId: 'EmojiPackage-1778160720970',
        query: '嚣张登场'
      })
    ).details as any;

    expect(repeatedSend.success).toBe(true);
    expect(repeatedSend.emoji.relativePath).toBe('斗图/嚣张/嚣张登场.gif');
    expect(repeatedSend.sentBefore).toBe(true);
  });

  it('falls back to a random emoji when query has no match', async () => {
    const { createPiEmojiSendTool } = await import('../../packages/ai/runtime/pi/tools/emoji-packs');
    const toolContext = createToolContext(`conv-no-match-${Date.now()}`);
    const sendTool = createPiEmojiSendTool(toolContext as any);

    const result = (
      await sendTool.execute('call-no-match', {
        packId: 'EmojiPackage-1778160720970',
        query: 'no-such-keyword-xyz'
      })
    ).details as any;

    expect(result.success).toBe(true);
    expect(result.emoji.packId).toBe('EmojiPackage-1778160720970');
    expect(result.autoFallback).toBe(false);
    expect(result.fallbackReason).toBe('query-no-match');
    expect(result.matched).toBe(false);
    expect(result.searchCandidateCount).toBe(0);
    expect(result.selectionSource).toBe('random-query-no-match');
  });

  it('picks a random emoji when query is omitted', async () => {
    const { createPiEmojiSendTool } = await import('../../packages/ai/runtime/pi/tools/emoji-packs');
    const toolContext = createToolContext(`conv-random-${Date.now()}`);
    const sendTool = createPiEmojiSendTool(toolContext as any);

    const result = (await sendTool.execute('call-random', {})).details as any;

    expect(result.success).toBe(true);
    expect(result.emoji.packId).toBe('EmojiPackage-1778160720970');
    expect(result.query).toBeUndefined();
    expect(result.selectionSource).toBe('random-empty-query');
  });

  it('reports keyword match diagnostics when query finds candidates', async () => {
    const { createPiEmojiSendTool } = await import('../../packages/ai/runtime/pi/tools/emoji-packs');
    const toolContext = createToolContext(`conv-match-diagnostics-${Date.now()}`);
    const sendTool = createPiEmojiSendTool(toolContext as any);

    const result = (
      await sendTool.execute('call-match-diagnostics', {
        packId: 'EmojiPackage-1778160720970',
        query: '普通微笑'
      })
    ).details as any;

    expect(result.success).toBe(true);
    expect(result.autoFallback).toBe(false);
    expect(result.fallbackReason).toBeUndefined();
    expect(result.matched).toBe(true);
    expect(result.searchCandidateCount).toBeGreaterThan(0);
    expect(result.selectedScore).toBeGreaterThan(0);
    expect(result.selectionSource).toBe('keyword-search');
  });

  it('pushes emoji images to the sprite bubble when configured', async () => {
    const { createPiEmojiSendTool } = await import('../../packages/ai/runtime/pi/tools/emoji-packs');
    const toolContext = {
      ...createToolContext(`conv-sprite-bubble-${Date.now()}`),
      resolved: {
        request: {
          extras: {
            emojiPacksDisplayTarget: 'sprite-bubble'
          },
          requestId: `conv-sprite-bubble-${Date.now()}-request`
        }
      }
    };
    const sendTool = createPiEmojiSendTool(toolContext as any);

    const result = (
      await sendTool.execute('call-sprite-bubble', {
        packId: 'EmojiPackage-1778160720970',
        query: '嚣张'
      })
    ).details as any;

    expect(sendTool.chatDisplay).toEqual({ mode: 'hidden' });
    expect(result.success).toBe(true);
    expect(result.displayTarget).toBe('sprite-bubble');
    expect(result.spriteBubbleDelivered).toBe(true);
    expect(spriteManagerSendBridgeMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        duration: 6000,
        id: 'emoji-send-call-sprite-bubble',
        image: expect.objectContaining({
          title: result.emoji.title,
          url: result.emoji.url
        }),
        speak: false,
        type: 'toast'
      }),
      { target: 'sprite' }
    );
  });

  it('reports sprite bubble delivery failure for chat fallback', async () => {
    spriteManagerSendBridgeMessageMock.mockResolvedValueOnce({ deliveredToSprite: false });
    const { createPiEmojiSendTool } = await import('../../packages/ai/runtime/pi/tools/emoji-packs');
    const toolContext = {
      ...createToolContext(`conv-sprite-bubble-fallback-${Date.now()}`),
      resolved: {
        request: {
          extras: {
            emojiPacksDisplayTarget: 'sprite-bubble'
          },
          requestId: `conv-sprite-bubble-fallback-${Date.now()}-request`
        }
      }
    };
    const sendTool = createPiEmojiSendTool(toolContext as any);

    const result = (
      await sendTool.execute('call-sprite-bubble-fallback', {
        packId: 'EmojiPackage-1778160720970',
        query: '嚣张'
      })
    ).details as any;

    expect(result.success).toBe(true);
    expect(result.displayTarget).toBe('sprite-bubble');
    expect(result.spriteBubbleDelivered).toBe(false);
  });

  it('loads previously sent emoji from persisted conversation tool calls', async () => {
    const { createPiEmojiSendTool } = await import('../../packages/ai/runtime/pi/tools/emoji-packs');
    const sentPath = '斗图/嚣张/嚣张登场.gif';
    const toolContext = createToolContext('conv-history', [
      {
        metadata: {
          toolCalls: [
            {
              name: 'emojiSendTool',
              result: {
                details: {
                  emoji: {
                    packId: 'EmojiPackage-1778160720970',
                    relativePath: sentPath
                  }
                }
              }
            }
          ]
        }
      }
    ]);

    const sendTool = createPiEmojiSendTool(toolContext as any);
    const result = (
      await sendTool.execute('call-history', {
        packId: 'EmojiPackage-1778160720970',
        query: '嚣张'
      })
    ).details as any;

    expect(toolContext.chatRepo.listMessages).toHaveBeenCalledWith('conv-history', 2000, 0);
    expect(result.success).toBe(true);
    // The only top-tier "嚣张" hit was already sent in history, so the next call must pick something else.
    expect(result.emoji.relativePath).not.toBe(sentPath);
  });

  it('instructs the model to send emojis directly via emojiSendTool({ query })', async () => {
    const { buildEmojiPackPromptSegment } = await import('../../electron/main/handlers/emoji-packs/prompt');

    const prompt = await buildEmojiPackPromptSegment({
      conversationId: 'conv-prompt',
      extras: {
        emojiPacksEnabled: true
      },
      messages: [
        {
          content: '哈哈这个也太离谱了',
          role: 'user'
        }
      ],
      providerId: 'test'
    });

    expect(prompt).toContain('## 主动尝试发送表情包');
    expect(prompt).toContain('emojiSendTool({ query })');
    expect(prompt).toContain('关键词');
    expect(prompt).not.toContain('emojiListTool');
    expect(prompt).not.toContain('emojiSearchTool');
    expect(prompt).not.toContain('candidateId');
  });
});
