import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electronState = {
  userDataDir: ''
};

vi.mock('electron', () => ({
  app: {
    getPath: () => electronState.userDataDir
  },
  shell: {
    openPath: vi.fn()
  }
}));

vi.mock('../electron/main/db/repositories', () => ({
  WorkspacesRepo: {
    getDefault: vi.fn(async () => undefined),
    list: vi.fn(async () => [])
  }
}));

vi.mock('../electron/main/resource-protocol', () => ({
  addAllowedResourceRoot: vi.fn(),
  addWorkspaceResourceRoot: vi.fn()
}));

vi.mock('../electron/main/handlers/folder/linked-utils', () => ({
  ensureUniquePath: vi.fn(async (targetPath: string) => targetPath)
}));

vi.mock('../packages/common/libs/7zip-min-electron', () => ({
  unpack: vi.fn((_sourcePath: string, _targetDir: string, callback: (error?: Error) => void) => callback())
}));

function writeJsonFile(filePath: string, payload: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function createManifest(rootPath: string) {
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

function createToolContext(conversationId: string, messages: any[] = []) {
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
    const { searchEmojiPacks } = await import('../electron/main/handlers/emoji-packs/service');

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
    const { createPiEmojiSearchTool, createPiEmojiSendTool } = await import('../packages/ai/runtime/pi/tools/emoji-packs');
    const toolContext = createToolContext(`conv-compact-${Date.now()}`);
    const searchTool = createPiEmojiSearchTool(toolContext as any);
    const sendTool = createPiEmojiSendTool(toolContext as any);

    const searchResult = (await searchTool.execute('call-search-1', {
      limit: 2,
      packId: 'EmojiPackage-1778160720970',
      query: '嚣张'
    })).details as any;

    expect(searchResult.success).toBe(true);
    expect(searchResult.results).toHaveLength(2);
    expect(searchResult.results[0].candidateId).toMatch(/^e\d+$/);
    expect(searchResult.results[0]).not.toHaveProperty('url');
    expect(searchResult.results[0]).not.toHaveProperty('packName');

    const searchContextText = ((await searchTool.execute('call-search-2', {
      limit: 1,
      packId: 'EmojiPackage-1778160720970',
      query: '斗图'
    })).content?.[0] as any)?.text || '';
    expect(searchContextText).not.toContain('res://');

    const candidateId = searchResult.results[0].candidateId;
    const firstSend = (await sendTool.execute('call-send-1', { candidateId })).details as any;
    expect(firstSend.success).toBe(true);
    expect(firstSend.emoji.url).toContain('res://');
    expect(firstSend.speech).toEqual({
      showBubble: false,
      text: firstSend.emoji.title
    });

    const duplicateSend = (await sendTool.execute('call-send-2', { candidateId })).details as any;
    expect(duplicateSend.success).toBe(false);
    expect(duplicateSend.error).toContain('already sent');

    const nextSearch = (await searchTool.execute('call-search-3', {
      limit: 2,
      packId: 'EmojiPackage-1778160720970',
      query: '嚣张'
    })).details as any;

    expect(nextSearch.results[0].relativePath).not.toBe(firstSend.emoji.relativePath);
    expect(nextSearch.results.find((item: any) => item.relativePath === firstSend.emoji.relativePath)?.sentBefore).toBe(true);
  });

  it('keeps emoji list model content slimmer than structured details', async () => {
    const { createPiEmojiListTool, createPiEmojiSendTool } = await import('../packages/ai/runtime/pi/tools/emoji-packs');
    const toolContext = createToolContext(`conv-list-${Date.now()}`);
    const listTool = createPiEmojiListTool(toolContext as any);
    const sendTool = createPiEmojiSendTool(toolContext as any);

    const result = await listTool.execute('call-list-1', {
      limit: 2,
      packId: 'EmojiPackage-1778160720970',
      relativePath: '斗图'
    });
    const contentText = (result.content?.[0] as any)?.text || '';

    const fileNode = (result.details as any).nodes.find((node: any) => node.kind === 'file');
    expect(fileNode).toHaveProperty('packId');
    expect(fileNode).toHaveProperty('mimeType');
    expect(fileNode.candidateId).toMatch(/^e\d+$/);
    expect(contentText).toContain(fileNode.candidateId);
    expect(contentText).toContain('emojiSendTool({ candidateId })');
    expect(contentText).not.toContain('"nodes"');
    expect(contentText).not.toContain('"packId"');
    expect(contentText).not.toContain('"mimeType"');
    expect(contentText.length).toBeLessThan(JSON.stringify(result.details, null, 2).length);

    const sendResult = (await sendTool.execute('call-list-send-1', { candidateId: fileNode.candidateId })).details as any;
    expect(sendResult.success).toBe(true);
    expect(sendResult.emoji.relativePath).toBe(fileNode.relativePath);
  });

  it('loads previously sent emoji from persisted conversation tool calls', async () => {
    const { createPiEmojiSearchTool, createPiEmojiSendTool } = await import('../packages/ai/runtime/pi/tools/emoji-packs');
    const sentPath = '斗图/嚣张/嚣张登场.gif';
    const toolContext = createToolContext('conv-history', [
      {
        metadata: {
          toolCalls: [
            {
              name: 'emojiListTool',
              result: {
                details: {
                  pack: {
                    name: 'Test Pack'
                  },
                  nodes: [
                    {
                      candidateId: 'e42',
                      kind: 'file',
                      mimeType: 'image/png',
                      packId: 'EmojiPackage-1778160720970',
                      relativePath: '斗图/普通微笑.png',
                      title: '普通微笑'
                    }
                  ]
                }
              }
            },
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

    const searchTool = createPiEmojiSearchTool(toolContext as any);
    const result = (await searchTool.execute('call-search-history', {
      limit: 2,
      packId: 'EmojiPackage-1778160720970',
      query: '嚣张'
    })).details as any;

    expect(toolContext.chatRepo.listMessages).toHaveBeenCalledWith('conv-history', 2000, 0);
    expect(result.results[0].relativePath).not.toBe(sentPath);
    expect(result.results.find((item: any) => item.relativePath === sentPath)?.sentBefore).toBe(true);

    const sendTool = createPiEmojiSendTool(toolContext as any);
    const sendResult = (await sendTool.execute('call-send-history', { candidateId: 'e42' })).details as any;
    expect(sendResult.success).toBe(true);
    expect(sendResult.emoji.relativePath).toBe('斗图/普通微笑.png');
  });

  it('instructs the model to use list and send when emoji mode is enabled', async () => {
    const { buildEmojiPackPromptSegment } = await import('../electron/main/handlers/emoji-packs/prompt');

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
    expect(prompt).toContain('emojiListTool({ packId, relativePath })');
    expect(prompt).toContain('emojiSendTool({ candidateId })');
    expect(prompt).toContain('表情包概览');
    expect(prompt).not.toContain('emojiSearchTool');
  });
});
