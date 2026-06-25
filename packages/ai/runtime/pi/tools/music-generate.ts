import path from 'node:path';

import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { type Static, Type } from 'typebox';

import { normalizeProviderPreset } from '../../../provider-preset';
import { getProviderDefaultModels, getProviderDefinition, supportsProviderCapability, toCanonicalProviderId } from '../../../providers/service';
import type { MusicGenerationMode, MusicGenerationRequest, MusicGenerationResponse } from '../../../types';
import { resolveGuardedToolExecution } from '../skills';
import type { PiSessionToolContext } from '../tool-context';
import { createResourceRecord, type ResourceCreateToolBindings } from './resource-create';
import { createJsonToolResult } from './result';

type MusicGenerationExecutor = {
  generateMusic(payload: MusicGenerationRequest, signal?: AbortSignal): Promise<MusicGenerationResponse>;
};

let defaultExecutionService: MusicGenerationExecutor | undefined;

async function getDefaultExecutionService(): Promise<MusicGenerationExecutor> {
  if (!defaultExecutionService) {
    const { PiExecutionService } = await import('../execution-service');
    defaultExecutionService = new PiExecutionService();
  }

  return defaultExecutionService;
}

const musicGenerateParameters = Type.Object({
  prompt: Type.String({ description: 'Music direction prompt, including genre, mood, instruments, tempo, vocals, and arrangement notes.' }),
  lyrics: Type.Optional(Type.String({ description: 'Optional lyrics for a vocal song.' })),
  lyricsResourceId: Type.Optional(Type.String({ description: 'Optional resource ID of the saved lyrics text used for this song.' })),
  mode: Type.Optional(
    Type.Union([Type.Literal('text-to-music'), Type.Literal('lyrics-to-song'), Type.Literal('instrumental'), Type.Literal('cover')], {
      description: 'Generation mode. Defaults from the inputs: lyrics -> lyrics-to-song, reference audio -> cover, isInstrumental -> instrumental.'
    })
  ),
  providerId: Type.Optional(Type.String({ description: 'Music generation provider id. Defaults to the current provider when it supports musicGeneration, otherwise minimax.' })),
  model: Type.Optional(Type.String({ description: 'Music generation model. Defaults to the selected provider musicGeneration default model.' })),
  providerPresetId: Type.Optional(Type.String({ description: 'Optional provider preset id. Omit to use the current preset when it belongs to the selected provider, otherwise provider defaults.' })),
  audioFormat: Type.Optional(Type.String({ description: 'Audio format such as mp3, wav, flac, or aac. Defaults to mp3.' })),
  outputFormat: Type.Optional(Type.Union([Type.Literal('url'), Type.Literal('hex')], { description: 'Provider response format when supported. Defaults to url.' })),
  sampleRate: Type.Optional(Type.Number({ description: 'Optional output sample rate, for example 44100.' })),
  bitrate: Type.Optional(Type.Number({ description: 'Optional output bitrate, for example 256000.' })),
  isInstrumental: Type.Optional(Type.Boolean({ description: 'Set true to generate instrumental music.' })),
  lyricsOptimizer: Type.Optional(Type.Boolean({ description: 'Provider-specific lyrics optimizer flag. For MiniMax this maps to extras.minimax.lyrics_optimizer.' })),
  referenceAudioUrl: Type.Optional(Type.String({ description: 'Reference audio URL for cover/reference-audio mode.' })),
  referenceAudioBase64: Type.Optional(Type.String({ description: 'Reference audio base64 for cover/reference-audio mode.' })),
  coverFeatureId: Type.Optional(Type.String({ description: 'Provider-specific cover feature id. For MiniMax this maps to extras.minimax.cover_feature_id.' })),
  providerOptions: Type.Optional(Type.Record(Type.String(), Type.Any(), { description: 'Provider-specific options merged into extras[providerId]. Prefer this for non-common fields.' })),
  saveToResourceLibrary: Type.Optional(Type.Boolean({ description: 'Whether to create an audio resource after generation. Defaults to true.' })),
  workspaceId: Type.Optional(Type.String({ description: 'Target workspace ID for the workspace cache/resource.' })),
  folderId: Type.Optional(Type.String({ description: 'Target resource folder ID. If omitted, addResource chooses the default/daily folder.' })),
  resourceTitle: Type.Optional(Type.String({ description: 'Optional title for the created music resource.' })),
  tags: Type.Optional(Type.Union([Type.Array(Type.String()), Type.String()], { description: 'Optional extra resource tags.' }))
});

type MusicGenerateInput = Static<typeof musicGenerateParameters>;

export interface MusicGenerateToolBindings extends ResourceCreateToolBindings {
  executionService?: MusicGenerationExecutor;
  resolveMusicOutputDir?: (toolContext: PiSessionToolContext, input: MusicGenerateInput) => Promise<string | undefined>;
}

function trimString(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
}

async function resolveMusicOutputDir(toolContext: PiSessionToolContext, input: MusicGenerateInput): Promise<string | undefined> {
  const workspaceId =
    trimString(input.workspaceId) ||
    trimString(toolContext.resolved.request.extras?.workspaceId) ||
    (toolContext.conversationId && typeof toolContext.chatRepo.ensureConversation === 'function'
      ? trimString((await toolContext.chatRepo.ensureConversation({ id: toolContext.conversationId }))?.workspaceId)
      : undefined);

  const { WorkspacesRepo } = await import('../../../../common/db');
  const workspace = workspaceId ? await WorkspacesRepo.getById(workspaceId) : await WorkspacesRepo.getDefault();
  if (!workspace?.rootPath) {
    return undefined;
  }

  return path.join(workspace.rootPath, '.cache', 'music-generation');
}

function resolveMode(input: MusicGenerateInput): MusicGenerationMode {
  if (input.mode) return input.mode;
  if (input.isInstrumental) return 'instrumental';
  if (trimString(input.referenceAudioUrl) || trimString(input.referenceAudioBase64) || trimString(input.coverFeatureId)) return 'cover';
  if (trimString(input.lyrics)) return 'lyrics-to-song';
  return 'text-to-music';
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function resolveProviderId(toolContext: PiSessionToolContext, explicitProviderId?: string): string {
  const providerId = trimString(explicitProviderId);
  if (providerId) return toCanonicalProviderId(providerId);

  const currentProviderId = trimString(toolContext.resolved.model.providerId);
  if (currentProviderId && supportsProviderCapability(currentProviderId, 'musicGeneration')) {
    return toCanonicalProviderId(currentProviderId);
  }

  return 'minimax';
}

function isSameProvider(left?: string, right?: string): boolean {
  return toCanonicalProviderId(left) === toCanonicalProviderId(right);
}

function resolveProviderPresetId(toolContext: PiSessionToolContext, providerId: string, explicitPresetId?: string): string | undefined {
  const presetId = trimString(explicitPresetId);
  if (presetId) return presetId;

  if (isSameProvider(toolContext.resolved.model.providerId, providerId)) {
    return toolContext.resolved.model.presetId;
  }

  return undefined;
}

function resolveModel(providerId: string, mode: MusicGenerationMode, explicitModel?: string): string {
  const model = trimString(explicitModel);
  if (model) return model;

  if (providerId === 'minimax' && mode === 'cover') {
    return 'music-cover';
  }

  return getProviderDefaultModels(providerId).musicGeneration || (providerId === 'minimax' ? 'music-2.6' : 'music');
}

function resolveProviderLabel(providerId?: string): string {
  const id = trimString(providerId) || 'provider';
  const definition = getProviderDefinition(id);
  return definition?.catalog?.name || definition?.display.label || id;
}

function resolveProviderDomain(providerId?: string): string | undefined {
  const website = trimString(getProviderDefinition(providerId)?.display.website);
  if (!website) return undefined;

  try {
    return new URL(website).hostname;
  } catch {
    return website.replace(/^https?:\/\//, '').split('/')[0] || undefined;
  }
}

function buildProviderExtras(providerId: string, input: MusicGenerateInput, outputDir: string, outputFormat: string, toolCallId: string): Record<string, any> {
  const providerOptions = isRecord(input.providerOptions) ? input.providerOptions : {};
  const lyrics = trimString(input.lyrics);
  const mode = resolveMode(input);
  const isPromptOnlyMiniMaxSong =
    providerId === 'minimax' && mode !== 'cover' && input.isInstrumental !== true && mode !== 'instrumental' && !lyrics && input.lyricsOptimizer === undefined;
  const extras: Record<string, any> = {
    outputDir,
    requestId: toolCallId
  };

  if (Object.keys(providerOptions).length > 0) {
    extras[providerId] = {
      ...(isRecord(extras[providerId]) ? extras[providerId] : {}),
      ...providerOptions
    };
  }

  if (providerId === 'minimax') {
    extras.minimax = {
      ...(isRecord(extras.minimax) ? extras.minimax : {}),
      ...(input.lyricsOptimizer !== undefined || isPromptOnlyMiniMaxSong ? { lyrics_optimizer: input.lyricsOptimizer ?? true } : {}),
      ...(trimString(input.coverFeatureId) ? { cover_feature_id: trimString(input.coverFeatureId) } : {}),
      ...(trimString(input.referenceAudioUrl) ? { referenceAudioUrl: trimString(input.referenceAudioUrl) } : {}),
      ...(trimString(input.referenceAudioBase64) ? { referenceAudioBase64: trimString(input.referenceAudioBase64) } : {}),
      output_format: outputFormat
    };
  }

  return extras;
}

function truncateTitle(value: string, maxLength = 80): string {
  const text = value.trim().replace(/\s+/g, ' ');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}...`;
}

function firstArtifact(response: MusicGenerationResponse) {
  return response.artifacts[0];
}

function buildAudioValue(response: MusicGenerationResponse): string {
  const artifact = firstArtifact(response);
  const audioPath = artifact?.filePath || response.filePath || '';
  const audioUrl = artifact?.audioUrl || response.audioUrl || '';
  const audioBase64 = artifact?.audioBase64 || response.audioBase64 || '';
  return audioPath || audioUrl || (audioBase64 ? `data:${artifact?.mimeType || 'audio/mpeg'};base64,${audioBase64}` : '');
}

function buildSuccessContent(resourceId: string | undefined, audioPath: string | undefined, audioUrl: string | undefined): string {
  if (resourceId) {
    return `Music generation completed and saved as an audio resource: ${resourceId}`;
  }

  return `Music generation completed and returned audio: ${audioPath || audioUrl || 'base64 audio'}. Call resourceCreateTool to save it as an audio resource with mediaKind="music".`;
}

function pushGeneratedAudioCard(
  toolContext: PiSessionToolContext,
  toolCallId: string,
  prompt: string,
  mode: MusicGenerationMode,
  response: MusicGenerationResponse,
  fallbackProviderId: string,
  fallbackModel: string,
  resource?: Record<string, any>
): string {
  const artifact = firstArtifact(response);
  const cardId = `music-${toolCallId}`;
  const audioPath = artifact?.filePath || response.filePath || undefined;
  const audioUrl = artifact?.audioUrl || response.audioUrl || undefined;
  const title = truncateTitle(prompt);
  const providerId = response.providerId || fallbackProviderId;
  const providerLabel = resolveProviderLabel(providerId);
  const domain = resolveProviderDomain(providerId);

  toolContext.pushCardToWindows(
    {
      conversationId: toolContext.conversationId,
      ...(resource?.id
        ? { resourceId: String(resource.id) }
        : {
          data: {
            description: `${providerId} · ${response.model || fallbackModel} · ${mode}`,
            ...(domain ? { domain } : {}),
            durationMs: artifact?.durationMs,
            filePath: audioPath,
            id: cardId,
            mimeType: artifact?.mimeType,
            sizeBytes: artifact?.sizeBytes,
            sourceName: providerLabel,
            status: 'ready',
            title,
            type: 'audio',
            url: audioUrl
          }
        }),
      text: `音乐生成完成：${title}`,
      type: 'audio'
    },
    toolContext.targetWindowId
  );

  return cardId;
}

export function createPiMusicGenerateTool(toolContext: PiSessionToolContext, bindings: MusicGenerateToolBindings = {}): ToolDefinition<typeof musicGenerateParameters> {
  return {
    name: 'musicGenerateTool',
    label: 'musicGenerateTool',
    description:
      'Generate music through a provider with musicGeneration capability from a prompt, optional lyrics, or reference audio. Returns local audio path or URL and pushes an audio card into chat.',
    parameters: musicGenerateParameters,
    async execute(toolCallId, input, signal) {
      const prompt = trimString(input.prompt);
      if (!prompt) {
        return createJsonToolResult({
          error: 'prompt is required for music generation.',
          success: false
        });
      }

      if (signal?.aborted) {
        throw new Error('Operation aborted');
      }

      const mode = resolveMode(input);
      const providerId = resolveProviderId(toolContext, input.providerId);
      const model = resolveModel(providerId, mode, input.model);
      const providerPresetId = resolveProviderPresetId(toolContext, providerId, input.providerPresetId);
      const audioFormat = trimString(input.audioFormat) || 'mp3';
      const outputFormat = input.outputFormat || 'url';
      const shouldCreateResource = input.saveToResourceLibrary !== false;
      const providerLabel = resolveProviderLabel(providerId);
      const lyrics = trimString(input.lyrics);
      const isPromptOnlyMiniMaxSong = providerId === 'minimax' && mode !== 'cover' && mode !== 'instrumental' && input.isInstrumental !== true && !lyrics && input.lyricsOptimizer === undefined;
      const lyricsOptimizer = input.lyricsOptimizer ?? (isPromptOnlyMiniMaxSong ? true : undefined);

      try {
        const guardResolution = await resolveGuardedToolExecution(toolContext, toolCallId, 'music-generate');
        if (guardResolution?.kind === 'blocked' || guardResolution?.kind === 'cancel') {
          return createJsonToolResult(guardResolution.details);
        }

        const outputDir = bindings.resolveMusicOutputDir ? await bindings.resolveMusicOutputDir(toolContext, input) : await resolveMusicOutputDir(toolContext, input);
        if (!outputDir) {
          return createJsonToolResult({
            success: false,
            error: '无法解析工作空间缓存目录，已取消音乐生成以避免写入系统临时缓存。'
          });
        }

        const extras = buildProviderExtras(providerId, input, outputDir, outputFormat, toolCallId);
        const request: MusicGenerationRequest = normalizeProviderPreset({
          audioSetting: {
            format: audioFormat,
            ...(typeof input.sampleRate === 'number' && Number.isFinite(input.sampleRate) ? { sampleRate: input.sampleRate } : {}),
            ...(typeof input.bitrate === 'number' && Number.isFinite(input.bitrate) ? { bitrate: input.bitrate } : {})
          },
          ...(providerId === 'minimax' ? { coverFeatureId: trimString(input.coverFeatureId) } : {}),
          extras,
          isInstrumental: input.isInstrumental ?? mode === 'instrumental',
          lyrics,
          ...(providerId === 'minimax' ? { lyricsOptimizer } : {}),
          mode,
          model,
          outputFormat,
          prompt,
          providerId,
          providerPresetId,
          ...(providerId === 'minimax'
            ? {
              referenceAudioBase64: trimString(input.referenceAudioBase64),
              referenceAudioUrl: trimString(input.referenceAudioUrl)
            }
            : {
              ...(trimString(input.referenceAudioBase64) ? { referenceAudioBase64: trimString(input.referenceAudioBase64) } : {}),
              ...(trimString(input.referenceAudioUrl) ? { referenceAudioUrl: trimString(input.referenceAudioUrl) } : {})
            })
        });

        const executionService = bindings.executionService || (await getDefaultExecutionService());
        toolContext.reportProgress?.(toolCallId, 10, `准备调用 ${providerLabel} 音乐生成...`);
        const response = await executionService.generateMusic(request, signal);
        toolContext.reportProgress?.(toolCallId, 85, '整理生成音频...');

        const artifact = firstArtifact(response);
        const audio = buildAudioValue(response);

        if (!audio) {
          return createJsonToolResult({
            artifacts: response.artifacts,
            error: 'Music generation completed but did not return a usable audio artifact.',
            model: response.model,
            providerId: response.providerId,
            success: false
          });
        }

        let createdResource: Record<string, any> | undefined;
        let resourceId: string | undefined;
        const audioPath = artifact?.filePath || response.filePath || undefined;
        const responseProviderId = response.providerId || providerId;
        const responseProviderLabel = resolveProviderLabel(responseProviderId);

        if (shouldCreateResource) {
          if (!audioPath) {
            return createJsonToolResult({
              audio,
              audioUrl: artifact?.audioUrl || response.audioUrl || undefined,
              error: 'Music generation returned audio but no local file path for resource creation.',
              success: false
            });
          }

          toolContext.reportProgress?.(toolCallId, 92, '写入资源库...');
          const resourceResult = await createResourceRecord(
            toolContext,
            {
              aiGenerated: true,
              categories: ['music'],
              description: `${responseProviderId} · ${response.model || model} · ${mode}`,
              durationMs: artifact?.durationMs,
              filePath: audioPath,
              folderId: input.folderId,
              mediaKind: 'music',
              metadata: {
                generatedAt: Date.now(),
                generatedBy: 'musicGenerateTool',
                musicGeneration: {
                  mode,
                  model: response.model || model,
                  prompt,
                  providerId: responseProviderId,
                  requestId: toolCallId,
                  lyricsResourceId: trimString(input.lyricsResourceId)
                }
              },
              mimeType: artifact?.mimeType,
              sizeBytes: artifact?.sizeBytes,
              sourceName: responseProviderLabel,
              tags: input.tags ? ['generated-music'].concat(input.tags as any) : ['music', 'generated-music'],
              title: trimString(input.resourceTitle) || truncateTitle(prompt),
              type: 'audio',
              workspaceId: input.workspaceId
            },
            bindings
          );
          createdResource = resourceResult.resource;
          resourceId = resourceResult.resourceId;
        }

        const finalAudioPath = (typeof createdResource?.filePath === 'string' && createdResource.filePath) || artifact?.filePath || response.filePath || undefined;
        const finalAudio = finalAudioPath || audio;
        const cardId = pushGeneratedAudioCard(toolContext, toolCallId, prompt, mode, response, providerId, model, createdResource);
        toolContext.reportProgress?.(toolCallId, 100, '音乐生成完成');

        const details = {
          artifacts: response.artifacts,
          audio: finalAudio,
          audioPath: finalAudioPath,
          audioUrl: artifact?.audioUrl || response.audioUrl || undefined,
          cardId,
          durationMs: artifact?.durationMs,
          isMusic: true,
          lyricsResourceId: trimString(input.lyricsResourceId),
          mimeType: artifact?.mimeType,
          mode,
          model: response.model || model,
          providerId: responseProviderId,
          resource: createdResource,
          resourceId,
          resourceStorage: resourceId
            ? {
              ensured: true,
              message: 'Generated music has been saved as an audio resource.'
            }
            : {
              ensured: false,
              nextStep:
                'Call resourceCreateTool with type="audio", mediaKind="music", aiGenerated=true, filePath=audioPath, and a music title so the generated song is stored in the resource library.'
            },
          success: true,
          ...(guardResolution?.warning ? { warning: guardResolution.warning } : {})
        };

        return createJsonToolResult(details, { content: buildSuccessContent(resourceId, details.audioPath, details.audioUrl) });
      } catch (error: any) {
        return createJsonToolResult({
          error: error?.message || 'Music generation failed.',
          success: false
        });
      }
    }
  };
}
