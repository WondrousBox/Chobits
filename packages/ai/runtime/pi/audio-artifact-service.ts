import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { GeneratedAudioArtifact, MusicGenerationRequest, MusicGenerationResponse, SpeechSynthesisRequest, SpeechSynthesisResponse } from '../../types';

export type AudioArtifactRequest = {
  model: string;
  audioSetting?: {
    format?: string;
  };
  outputFormat?: string;
};

export type MaterializeAudioResponseOptions<TRequest extends AudioArtifactRequest> = {
  request: TRequest;
  requestId: string;
  mediaKind?: 'music' | 'speech' | 'audio';
  outputDir?: string;
  signal?: AbortSignal;
};

type AudioResponse = {
  artifacts: GeneratedAudioArtifact[];
  audioBase64?: string;
  audioUrl?: string;
  filePath?: string;
};

function sanitizeFileSegment(value: string): string {
  return String(value || 'audio')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '-')
    .slice(0, 48);
}

function normalizeFormatCandidate(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function inferExtension(artifact: GeneratedAudioArtifact, request: AudioArtifactRequest): string {
  const candidates = [artifact.format, request.audioSetting?.format, artifact.mimeType, request.outputFormat].map(normalizeFormatCandidate).filter(Boolean);
  const raw = candidates.find((candidate) => candidate !== 'hex' && candidate !== 'url') || 'mp3';
  if (raw.includes('wav')) return '.wav';
  if (raw.includes('flac')) return '.flac';
  if (raw.includes('aac')) return '.aac';
  if (raw.includes('m4a') || raw.includes('mp4')) return '.m4a';
  if (raw.includes('ogg') || raw.includes('opus')) return '.ogg';
  if (raw.includes('pcm')) return '.pcm';
  return '.mp3';
}

function decodeDataUrl(dataUrl: string): Buffer | undefined {
  const match = /^data:[^;]+;base64,(.+)$/s.exec(dataUrl.trim());
  if (!match) return undefined;
  return Buffer.from(match[1], 'base64');
}

function decodeHex(value: string): Buffer | undefined {
  const normalized = value.replace(/\s+/g, '');
  if (!normalized || normalized.length % 2 !== 0 || !/^[a-fA-F0-9]+$/.test(normalized)) {
    return undefined;
  }
  return Buffer.from(normalized, 'hex');
}

async function readAudioUrl(url: string, signal?: AbortSignal): Promise<Buffer | undefined> {
  if (url.startsWith('data:')) {
    return decodeDataUrl(url);
  }

  if (!/^https?:\/\//i.test(url)) {
    return undefined;
  }

  const response = await fetch(url, {
    headers: {
      Accept: 'audio/*,*/*',
      'User-Agent': 'Chobits/1.0'
    },
    signal
  });

  if (!response.ok) {
    throw new Error(`下载生成音频失败: HTTP ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function stripLargePayload(artifact: GeneratedAudioArtifact): GeneratedAudioArtifact {
  if (!artifact.filePath) return artifact;
  const { audioBase64: _audioBase64, audioHex: _audioHex, ...rest } = artifact;
  return rest;
}

function resolveDefaultOutputDir(mediaKind: MaterializeAudioResponseOptions<AudioArtifactRequest>['mediaKind']): string {
  const folder = mediaKind === 'speech' ? 'speech-synthesis' : mediaKind === 'music' ? 'music-generation' : 'audio-generation';
  return path.join(os.tmpdir(), 'chobits', folder);
}

async function resolveAudioBuffer(artifact: GeneratedAudioArtifact, signal?: AbortSignal): Promise<Buffer | undefined> {
  if (artifact.audioBase64) {
    return Buffer.from(artifact.audioBase64, 'base64');
  }

  if (artifact.audioHex) {
    return decodeHex(artifact.audioHex);
  }

  if (artifact.audioUrl) {
    return readAudioUrl(artifact.audioUrl, signal);
  }

  return undefined;
}

export class PiAudioArtifactService {
  async materializeAudioResponse<TResponse extends AudioResponse, TRequest extends AudioArtifactRequest>(
    response: TResponse,
    options: MaterializeAudioResponseOptions<TRequest>
  ): Promise<TResponse> {
    if (!response.artifacts.length) {
      return response;
    }

    const outputDir = options.outputDir || resolveDefaultOutputDir(options.mediaKind);
    await fs.mkdir(outputDir, { recursive: true });

    const artifacts = await Promise.all(
      response.artifacts.map(async (artifact, index) => {
        if (artifact.filePath) {
          return stripLargePayload(artifact);
        }

        const audioBuffer = await resolveAudioBuffer(artifact, options.signal);
        if (!audioBuffer) {
          return artifact;
        }

        const extension = inferExtension(artifact, options.request);
        const baseName = sanitizeFileSegment(`${options.request.model}-${index + 1}`);
        const filePath = path.join(outputDir, `${Date.now()}-${baseName}-${options.requestId || randomUUID()}${extension}`);
        await fs.writeFile(filePath, audioBuffer);

        return stripLargePayload({
          ...artifact,
          filePath,
          sizeBytes: artifact.sizeBytes ?? audioBuffer.byteLength
        });
      })
    );

    const firstArtifact = artifacts[0];
    const { audioBase64: _audioBase64, audioUrl: _audioUrl, filePath: _filePath, artifacts: _artifacts, ...rest } = response;

    return {
      ...rest,
      artifacts,
      ...(firstArtifact?.audioBase64 && !firstArtifact.filePath ? { audioBase64: firstArtifact.audioBase64 } : {}),
      ...(firstArtifact?.audioUrl ? { audioUrl: firstArtifact.audioUrl } : {}),
      ...(firstArtifact?.filePath ? { filePath: firstArtifact.filePath } : {})
    } as TResponse;
  }

  async materializeMusicResponse(
    response: MusicGenerationResponse,
    options: Omit<MaterializeAudioResponseOptions<MusicGenerationRequest>, 'mediaKind'>
  ): Promise<MusicGenerationResponse> {
    return this.materializeAudioResponse(response, { ...options, mediaKind: 'music' });
  }

  async materializeSpeechResponse(
    response: SpeechSynthesisResponse,
    options: Omit<MaterializeAudioResponseOptions<SpeechSynthesisRequest>, 'mediaKind'>
  ): Promise<SpeechSynthesisResponse> {
    return this.materializeAudioResponse(response, { ...options, mediaKind: 'speech' });
  }
}
