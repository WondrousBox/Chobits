import { describe, expect, it, vi } from 'vitest';

import { INITIAL_ACTIVE_SESSION_TOOL_IDS, listPiToolDescriptors, resolvePiToolId } from '../packages/ai/runtime/pi/tool-registry';
import { searchToolbox } from '../packages/ai/runtime/pi/toolbox';
import { createPiMusicGenerateTool } from '../packages/ai/runtime/pi/tools/music-generate';
import { createPiMusicLyricsTool } from '../packages/ai/runtime/pi/tools/music-lyrics';
import type { LyricsGenerationRequest, MusicGenerationRequest } from '../packages/ai/types';

function createToolContext() {
  return {
    chatRepo: {},
    conversationId: 'conversation-1',
    pushCardToWindows: vi.fn(),
    reportProgress: vi.fn(),
    resolved: {
      model: {
        providerId: 'minimax',
        presetId: 'preset-minimax'
      },
      request: {
        extras: {
          workspaceId: 'workspace-1'
        }
      }
    },
    resourcesRepo: {},
    targetWindowId: 42
  } as any;
}

describe('musicGenerateTool', () => {
  it('is registered and discoverable through toolbox search', () => {
    expect(resolvePiToolId('musicGenerateTool')).toBe('music-generate');
    expect(resolvePiToolId('musicLyricsTool')).toBe('music-lyrics');
    expect(listPiToolDescriptors().some((tool) => tool.id === 'music-generate')).toBe(true);
    expect(listPiToolDescriptors().some((tool) => tool.id === 'music-lyrics')).toBe(true);
    expect(INITIAL_ACTIVE_SESSION_TOOL_IDS).not.toContain('music-lyrics');

    const results = searchToolbox('music generation');
    expect(results.some((skill) => skill.tools.includes('musicGenerateTool'))).toBe(true);
    expect(results.some((skill) => skill.tools.includes('musicLyricsTool'))).toBe(true);

    const lyricsResults = searchToolbox('lyrics');
    expect(lyricsResults.some((skill) => skill.tools.includes('musicLyricsTool'))).toBe(true);
  });

  it('generates music and pushes an audio card', async () => {
    const toolContext = createToolContext();
    const requests: MusicGenerationRequest[] = [];
    const signals: Array<AbortSignal | undefined> = [];
    const createdResources: Record<string, any>[] = [];
    const executionService = {
      generateMusic: vi.fn(async (request: MusicGenerationRequest, signal?: AbortSignal) => {
        requests.push(request);
        signals.push(signal);
        return {
          artifacts: [
            {
              durationMs: 32000,
              filePath: 'C:\\tmp\\generated-song.mp3',
              mimeType: 'audio/mpeg',
              sizeBytes: 1234
            }
          ],
          filePath: 'C:\\tmp\\generated-song.mp3',
          model: request.model,
          providerId: request.providerId
        };
      })
    };
    const resourceCreator = vi.fn(async (resource: Record<string, any>) => {
      createdResources.push(resource);
      return {
        data: {
          ...resource,
          filePath: '/workspace/resources/generated-song.mp3',
          id: 'resource-music-1'
        },
        success: true
      };
    });

    const tool = createPiMusicGenerateTool(toolContext, {
      executionService,
      resolveMusicOutputDir: async () => '/workspace/.cache/music-generation',
      resourceCreator
    });
    const controller = new AbortController();
    const result = await tool.execute(
      'call-music-1',
      {
        audioFormat: 'mp3',
        lyrics: 'hello world',
        lyricsResourceId: 'resource-lyrics-1',
        lyricsOptimizer: true,
        prompt: 'upbeat city pop'
      },
      controller.signal
    );

    expect(executionService.generateMusic).toHaveBeenCalledOnce();
    expect(signals[0]).toBe(controller.signal);
    expect(requests[0]).toMatchObject({
      audioSetting: { format: 'mp3' },
      lyrics: 'hello world',
      lyricsOptimizer: true,
      mode: 'lyrics-to-song',
      model: 'music-2.6',
      providerId: 'minimax',
      providerPresetId: 'preset-minimax'
    });
    expect(requests[0].extras?.outputDir).toBe('/workspace/.cache/music-generation');
    expect(requests[0].extras?.requestId).toBe('call-music-1');

    expect(resourceCreator).toHaveBeenCalledOnce();
    expect(createdResources[0]).toMatchObject({
      filePath: 'C:\\tmp\\generated-song.mp3',
      sourceName: 'MiniMax',
      title: 'upbeat city pop',
      type: 'audio',
      workspaceId: 'workspace-1'
    });
    expect(JSON.parse(createdResources[0].metadata)).toMatchObject({
      aiGenerated: true,
      kind: 'music',
        mediaKind: 'music',
        musicGeneration: {
          lyricsResourceId: 'resource-lyrics-1',
          mode: 'lyrics-to-song',
          prompt: 'upbeat city pop',
          requestId: 'call-music-1'
      }
    });
    expect(JSON.parse(createdResources[0].tags)).toEqual(expect.arrayContaining(['music', 'generated-music', 'ai-generated']));

    expect(toolContext.pushCardToWindows).toHaveBeenCalledOnce();
    expect(toolContext.pushCardToWindows.mock.calls[0][0]).toMatchObject({
      conversationId: 'conversation-1',
      resourceId: 'resource-music-1',
      type: 'audio'
    });

    expect((result.details as any)).toMatchObject({
      audio: '/workspace/resources/generated-song.mp3',
      audioPath: '/workspace/resources/generated-song.mp3',
      cardId: 'music-call-music-1',
      isMusic: true,
      lyricsResourceId: 'resource-lyrics-1',
      mode: 'lyrics-to-song',
      resourceStorage: {
        ensured: true
      },
      resourceId: 'resource-music-1',
      success: true
    });
  });

  it('generates lyrics for later music generation', async () => {
    const toolContext = createToolContext();
    const requests: LyricsGenerationRequest[] = [];
    const createdResources: Record<string, any>[] = [];
    const executionService = {
      generateLyrics: vi.fn(async (request: LyricsGenerationRequest) => {
        requests.push(request);
        return {
          lyrics: '[Verse]\nhello rain\n[Chorus]\nshine again',
          providerId: request.providerId,
          songTitle: 'Rain Again',
          styleTags: 'city pop, hopeful'
        };
      })
    };
    const resourceCreator = vi.fn(async (resource: Record<string, any>) => {
      createdResources.push(resource);
      return {
        data: {
          ...resource,
          id: 'resource-lyrics-1'
        },
        success: true
      };
    });

    const tool = createPiMusicLyricsTool(toolContext, { executionService, resourceCreator });
    const result = await tool.execute('call-lyrics-1', {
      prompt: 'Write a Chinese pop song about a city after rain'
    });

    expect(executionService.generateLyrics).toHaveBeenCalledOnce();
    expect(requests[0]).toMatchObject({
      mode: 'write_full_song',
      prompt: 'Write a Chinese pop song about a city after rain',
      providerId: 'minimax',
      providerPresetId: 'preset-minimax'
    });
    expect(requests[0].extras?.requestId).toBe('call-lyrics-1');

    expect(resourceCreator).toHaveBeenCalledOnce();
    expect(createdResources[0]).toMatchObject({
      contentText: '[Verse]\nhello rain\n[Chorus]\nshine again',
      sourceName: 'MiniMax',
      title: 'Rain Again',
      type: 'text',
      workspaceId: 'workspace-1'
    });
    expect(JSON.parse(createdResources[0].metadata)).toMatchObject({
      aiGenerated: true,
      kind: 'lyrics',
      lyricsGeneration: {
        mode: 'write_full_song',
        prompt: 'Write a Chinese pop song about a city after rain',
        requestId: 'call-lyrics-1',
        songTitle: 'Rain Again',
        styleTags: 'city pop, hopeful'
      }
    });
    expect(JSON.parse(createdResources[0].tags)).toEqual(expect.arrayContaining(['lyrics', 'generated-lyrics', 'ai-generated']));

    expect(toolContext.pushCardToWindows).toHaveBeenCalledOnce();
    expect(toolContext.pushCardToWindows.mock.calls[0][0]).toMatchObject({
      conversationId: 'conversation-1',
      resourceId: 'resource-lyrics-1',
      type: 'resource'
    });

    expect((result.details as any)).toMatchObject({
      lyrics: '[Verse]\nhello rain\n[Chorus]\nshine again',
      lyricsResourceId: 'resource-lyrics-1',
      musicPrompt: expect.stringContaining('city pop, hopeful'),
      nextStep: expect.stringContaining('musicGenerateTool'),
      providerId: 'minimax',
      resourceStorage: {
        ensured: true
      },
      resourceId: 'resource-lyrics-1',
      songTitle: 'Rain Again',
      success: true
    });
  });

  it('can generate lyrics without saving a lyrics resource', async () => {
    const toolContext = createToolContext();
    const executionService = {
      generateLyrics: vi.fn(async (request: LyricsGenerationRequest) => ({
        lyrics: '[Verse]\nquiet neon',
        providerId: request.providerId
      }))
    };
    const resourceCreator = vi.fn();

    const tool = createPiMusicLyricsTool(toolContext, { executionService, resourceCreator });
    const result = await tool.execute('call-lyrics-no-resource', {
      prompt: 'Write a short lyric',
      saveToResourceLibrary: false
    });

    expect(executionService.generateLyrics).toHaveBeenCalledOnce();
    expect(resourceCreator).not.toHaveBeenCalled();
    expect(toolContext.pushCardToWindows).not.toHaveBeenCalled();
    expect((result.details as any)).toMatchObject({
      lyrics: '[Verse]\nquiet neon',
      lyricsResourceId: undefined,
      resourceStorage: {
        ensured: false,
        nextStep: expect.stringContaining('resourceCreateTool')
      },
      success: true
    });
  });

  it('does not push a card when music generation returns no playable artifact', async () => {
    const toolContext = createToolContext();
    const executionService = {
      generateMusic: vi.fn(async (request: MusicGenerationRequest) => ({
        artifacts: [],
        model: request.model,
        providerId: request.providerId
      }))
    };

    const tool = createPiMusicGenerateTool(toolContext, { executionService, resolveMusicOutputDir: async () => '/workspace/.cache/music-generation' });
    const result = await tool.execute('call-music-empty', {
      prompt: 'ambient piano'
    });

    expect(executionService.generateMusic).toHaveBeenCalledOnce();
    expect(toolContext.pushCardToWindows).not.toHaveBeenCalled();
    expect((result.details as any)).toMatchObject({
      success: false,
      error: 'Music generation completed but did not return a usable audio artifact.'
    });
  });

  it('tells the assistant to create a resource when resource saving is disabled', async () => {
    const toolContext = createToolContext();
    const executionService = {
      generateMusic: vi.fn(async (request: MusicGenerationRequest) => ({
        artifacts: [
          {
            filePath: 'C:\\tmp\\generated-song.mp3',
            mimeType: 'audio/mpeg'
          }
        ],
        filePath: 'C:\\tmp\\generated-song.mp3',
        model: request.model,
        providerId: request.providerId
      }))
    };

    const tool = createPiMusicGenerateTool(toolContext, { executionService, resolveMusicOutputDir: async () => '/workspace/.cache/music-generation' });
    const result = await tool.execute('call-music-no-resource', {
      prompt: 'ambient piano',
      saveToResourceLibrary: false
    });

    expect((result.details as any)).toMatchObject({
      audioPath: 'C:\\tmp\\generated-song.mp3',
      resourceId: undefined,
      resourceStorage: {
        ensured: false,
        nextStep: expect.stringContaining('resourceCreateTool')
      },
      success: true
    });
    expect(result.content[0].text).toContain('resourceCreateTool');
    expect(result.content[0].text).toContain('mediaKind="music"');
  });
});
