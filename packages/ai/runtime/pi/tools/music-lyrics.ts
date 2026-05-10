import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type, type Static } from '@sinclair/typebox';

import { normalizeProviderPreset } from '../../../provider-preset';
import type { LyricsGenerationMode, LyricsGenerationRequest, LyricsGenerationResponse } from '../../../types';
import { resolveGuardedToolExecution } from '../skills';
import type { PiSessionToolContext } from '../tool-context';
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
  providerPresetId: Type.Optional(Type.String({ description: 'Optional MiniMax provider preset id. Omit to use the current MiniMax preset or default provider secrets.' }))
});

type MusicLyricsInput = Static<typeof musicLyricsParameters>;

export interface MusicLyricsToolBindings {
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

export function createPiMusicLyricsTool(toolContext: PiSessionToolContext, bindings: MusicLyricsToolBindings = {}): ToolDefinition<typeof musicLyricsParameters> {
  return {
    name: 'musicLyricsTool',
    label: 'musicLyricsTool',
    description:
      'Generate complete song lyrics with MiniMax before music generation, or rewrite existing lyrics. This tool is for toolbox-discovered lyrics work and should be used before musicGenerateTool when a vocal song needs lyrics.',
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
        toolContext.reportProgress?.(toolCallId, 100, '歌词生成完成');

        const details = {
          lyrics: response.lyrics,
          mode,
          musicPrompt: buildMusicPrompt(input, response),
          nextStep: '如果用户要完整歌曲，继续调用 musicGenerateTool，并把 lyrics 参数设置为本次返回的 lyrics；生成完成后确保得到 resourceId。',
          providerId: response.providerId || 'minimax',
          songTitle: response.songTitle,
          styleTags: response.styleTags,
          success: true,
          ...(guardResolution?.warning ? { warning: guardResolution.warning } : {})
        };

        return createJsonToolResult(details, {
          content: response.songTitle ? `歌词生成完成：${response.songTitle}\n\n${response.lyrics}` : `歌词生成完成：\n\n${response.lyrics}`
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
