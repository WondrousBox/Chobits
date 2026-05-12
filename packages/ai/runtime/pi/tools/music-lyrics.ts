import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { type Static, Type } from '@sinclair/typebox';

import { normalizeProviderPreset } from '../../../provider-preset';
import type { LyricsGenerationMode, LyricsGenerationRequest, LyricsGenerationResponse } from '../../../types';
import { resolveGuardedToolExecution } from '../skills';
import type { PiSessionToolContext } from '../tool-context';
import { createResourceRecord, type ResourceCreateToolBindings } from './resource-create';
import { createJsonToolResult } from './result';

type LyricsGenerationExecutor = {
  generateLyrics(payload: LyricsGenerationRequest, signal?: AbortSignal): Promise<LyricsGenerationResponse>;
};

let defaultExecutionService: LyricsGenerationExecutor | undefined;

async function getDefaultExecutionService(): Promise<LyricsGenerationExecutor> {
  if (!defaultExecutionService) {
    const { PiExecutionService } = await import('../execution-service');
    defaultExecutionService = new PiExecutionService();
  }

  return defaultExecutionService;
}

const musicLyricsParameters = Type.Object({
  prompt: Type.Optional(Type.String({ description: 'Song lyric request, including topic, story, language, genre, mood, title idea, and section constraints.' })),
  lyrics: Type.Optional(Type.String({ description: 'Existing lyrics to rewrite, polish, continue, or edit.' })),
  mode: Type.Optional(
    Type.Union([Type.Literal('write_full_song'), Type.Literal('edit')], {
      description: 'Lyrics generation mode. Defaults to edit when lyrics are provided, otherwise write_full_song.'
    })
  ),
  providerPresetId: Type.Optional(Type.String({ description: 'Optional MiniMax provider preset id. Omit to use the current MiniMax preset or default provider secrets.' })),
  saveToResourceLibrary: Type.Optional(Type.Boolean({ description: 'Whether to create a text resource for the generated lyrics. Defaults to true.' })),
  workspaceId: Type.Optional(Type.String({ description: 'Target workspace ID for the lyrics resource.' })),
  folderId: Type.Optional(Type.String({ description: 'Target resource folder ID. If omitted, addResource chooses the default/daily folder.' })),
  resourceTitle: Type.Optional(Type.String({ description: 'Optional title for the created lyrics resource.' })),
  tags: Type.Optional(Type.Union([Type.Array(Type.String()), Type.String()], { description: 'Optional extra resource tags.' }))
});

type MusicLyricsInput = Static<typeof musicLyricsParameters>;

export interface MusicLyricsToolBindings extends ResourceCreateToolBindings {
  executionService?: LyricsGenerationExecutor;
}

function trimString(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
}

function resolveMode(input: MusicLyricsInput): LyricsGenerationMode {
  if (input.mode) return input.mode;
  return trimString(input.lyrics) ? 'edit' : 'write_full_song';
}

function resolveProviderPresetId(toolContext: PiSessionToolContext, explicitPresetId?: string): string | undefined {
  const presetId = trimString(explicitPresetId);
  if (presetId) return presetId;

  if (toolContext.resolved.model.providerId === 'minimax') {
    return toolContext.resolved.model.presetId;
  }

  return undefined;
}

function buildMusicPrompt(input: MusicLyricsInput, response: LyricsGenerationResponse): string {
  const pieces = [response.styleTags, trimString(input.prompt)].filter(Boolean);
  return pieces.join('\n').trim() || response.songTitle || 'vocal song with the generated lyrics';
}

function truncateTitle(value: string, maxLength = 80): string {
  const text = value.trim().replace(/\s+/g, ' ');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}...`;
}

function buildLyricsResourceTitle(input: MusicLyricsInput, response: LyricsGenerationResponse): string {
  const explicitTitle = trimString(input.resourceTitle);
  if (explicitTitle) return explicitTitle;

  const songTitle = trimString(response.songTitle);
  if (songTitle) return songTitle;

  const prompt = trimString(input.prompt);
  return prompt ? truncateTitle(prompt) : '生成歌词';
}

function pushLyricsResourceCard(toolContext: PiSessionToolContext, resource: Record<string, any>, title: string): void {
  toolContext.pushCardToWindows(
    {
      conversationId: toolContext.conversationId,
      resourceId: String(resource.id),
      text: `歌词已保存：${title}`,
      type: 'resource'
    },
    toolContext.targetWindowId
  );
}

export function createPiMusicLyricsTool(toolContext: PiSessionToolContext, bindings: MusicLyricsToolBindings = {}): ToolDefinition<typeof musicLyricsParameters> {
  return {
    name: 'musicLyricsTool',
    label: 'musicLyricsTool',
    description: 'Generate complete song lyrics with MiniMax before music generation, rewrite existing lyrics, and save the generated lyrics as a text resource by default.',
    parameters: musicLyricsParameters,
    async execute(toolCallId, input, signal) {
      const prompt = trimString(input.prompt);
      const lyrics = trimString(input.lyrics);
      if (!prompt && !lyrics) {
        return createJsonToolResult({
          error: 'prompt or lyrics is required for lyrics generation.',
          success: false
        });
      }

      if (signal?.aborted) {
        throw new Error('Operation aborted');
      }

      try {
        const guardResolution = await resolveGuardedToolExecution(toolContext, toolCallId, 'music-lyrics');
        if (guardResolution?.kind === 'blocked' || guardResolution?.kind === 'cancel') {
          return createJsonToolResult(guardResolution.details);
        }

        const mode = resolveMode(input);
        const providerPresetId = resolveProviderPresetId(toolContext, input.providerPresetId);
        const request: LyricsGenerationRequest = normalizeProviderPreset({
          extras: {
            requestId: toolCallId
          },
          lyrics,
          mode,
          prompt,
          providerId: 'minimax',
          providerPresetId
        });

        const executionService = bindings.executionService || (await getDefaultExecutionService());
        toolContext.reportProgress?.(toolCallId, 15, '准备调用 MiniMax 歌词生成...');
        const response = await executionService.generateLyrics(request, signal);
        toolContext.reportProgress?.(toolCallId, 80, '保存生成歌词...');

        let createdResource: Record<string, any> | undefined;
        let resourceId: string | undefined;
        let resourceWarning: string | undefined;
        if (input.saveToResourceLibrary !== false) {
          const resourceTitle = buildLyricsResourceTitle(input, response);
          try {
            const resourceResult = await createResourceRecord(
              toolContext,
              {
                aiGenerated: true,
                categories: ['music', 'lyrics'],
                contentText: response.lyrics,
                description: `${response.providerId || 'minimax'} / lyrics_generation / ${mode}`,
                folderId: input.folderId,
                metadata: {
                  generatedAt: Date.now(),
                  generatedBy: 'musicLyricsTool',
                  kind: 'lyrics',
                  lyricsGeneration: {
                    mode,
                    prompt,
                    providerId: response.providerId || 'minimax',
                    requestId: toolCallId,
                    songTitle: response.songTitle,
                    styleTags: response.styleTags
                  }
                },
                sourceName: 'MiniMax',
                tags: input.tags ? ['lyrics', 'generated-lyrics'].concat(input.tags as any) : ['lyrics', 'generated-lyrics'],
                title: resourceTitle,
                type: 'text',
                workspaceId: input.workspaceId
              },
              bindings
            );
            createdResource = resourceResult.resource;
            resourceId = resourceResult.resourceId;
            pushLyricsResourceCard(toolContext, createdResource, resourceTitle);
          } catch (error: any) {
            resourceWarning = error?.message || '保存生成歌词资源失败。';
          }
        }

        toolContext.reportProgress?.(toolCallId, 100, '歌词生成完成');

        const details = {
          lyrics: response.lyrics,
          lyricsResourceId: resourceId,
          mode,
          musicPrompt: buildMusicPrompt(input, response),
          nextStep: '如果用户要完整歌曲，继续调用 musicGenerateTool，把 lyrics 设置为本次返回的歌词；如果有 lyricsResourceId，也一并传入。',
          providerId: response.providerId || 'minimax',
          resource: createdResource,
          resourceId,
          resourceStorage: resourceId
            ? {
              ensured: true,
              message: '生成歌词已保存为文本资源。'
            }
            : {
              ensured: false,
              nextStep: '如果需要保存歌词，调用 resourceCreateTool，并传入 type="text"、contentText=lyrics、aiGenerated=true。',
              ...(resourceWarning ? { warning: resourceWarning } : {})
            },
          songTitle: response.songTitle,
          styleTags: response.styleTags,
          success: true,
          ...(guardResolution?.warning || resourceWarning ? { warning: [guardResolution?.warning, resourceWarning].filter(Boolean).join('\n') } : {})
        };

        return createJsonToolResult(details, {
          content: response.songTitle
            ? `歌词生成完成：${response.songTitle}${resourceId ? `\n歌词资源：${resourceId}` : ''}\n\n${response.lyrics}`
            : `歌词生成完成${resourceId ? `\n歌词资源：${resourceId}` : ''}\n\n${response.lyrics}`
        });
      } catch (error: any) {
        return createJsonToolResult({
          error: error?.message || 'MiniMax lyrics generation failed.',
          success: false
        });
      }
    }
  };
}
