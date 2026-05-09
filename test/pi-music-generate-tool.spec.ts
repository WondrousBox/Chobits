import { describe, expect, it, vi } from 'vitest';

import { listPiToolDescriptors, resolvePiToolId } from '../packages/ai/runtime/pi/tool-registry';
import { searchToolbox } from '../packages/ai/runtime/pi/toolbox';
import { createPiMusicGenerateTool } from '../packages/ai/runtime/pi/tools/music-generate';
import type { MusicGenerationRequest } from '../packages/ai/types';

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
    expect(listPiToolDescriptors().some((tool) => tool.id === 'music-generate')).toBe(true);

    const results = searchToolbox('音乐生成');
    expect(results.some((skill) => skill.name === '音乐生成' && skill.tools.includes('musicGenerateTool'))).toBe(true);
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
      mode: 'lyrics-to-song',
      resourceId: 'resource-music-1',
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
});
