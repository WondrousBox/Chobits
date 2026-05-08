import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { GeneratedAudioArtifact, MusicGenerationRequest, MusicGenerationResponse } from '../../types';

type MaterializeMusicResponseOptions = {
  request: MusicGenerationRequest;
  requestId: string;
  outputDir?: string;
  signal?: AbortSignal;
};

function sanitizeFileSegment(value: string): string {
  return String(value || 'music')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '-')
    .slice(0, 48);
}

function inferExtension(artifact: GeneratedAudioArtifact, request: MusicGenerationRequest): string {
  const raw = String(artifact.format || request.audioSetting?.format || artifact.mimeType || 'mp3').toLowerCase();
  if (raw.includes('wav')) return '.wav';
  if (raw.includes('flac')) return '.flac';
  if (raw.includes('aac')) return '.aac';
  if (raw.includes('m4a') || raw.includes('mp4')) return '.m4a';
  if (raw.includes('ogg') || raw.includes('opus')) return '.ogg';
  return '.mp3';
}

function decodeDataUrl(dataUrl: string): Buffer | undefined {
  const match = /^data:[^;]+;base64,(.+)$/s.exec(dataUrl.trim());
  if (!match) return undefined;
  return Buffer.from(match[1], 'base64');
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
  const { audioBase64: _audioBase64, ...rest } = artifact;
  return rest;
}

export class PiMusicGenerationService {
  async materializeMusicResponse(response: MusicGenerationResponse, options: MaterializeMusicResponseOptions): Promise<MusicGenerationResponse> {
    if (!response.artifacts.length) {
      return response;
    }

    const outputDir = options.outputDir || path.join(os.tmpdir(), 'chobits', 'music-generation');
    await fs.mkdir(outputDir, { recursive: true });

    const artifacts = await Promise.all(
      response.artifacts.map(async (artifact, index) => {
        if (artifact.filePath) {
          return stripLargePayload(artifact);
        }

        let audioBuffer: Buffer | undefined;
        if (artifact.audioBase64) {
          audioBuffer = Buffer.from(artifact.audioBase64, 'base64');
        } else if (artifact.audioUrl) {
          audioBuffer = await readAudioUrl(artifact.audioUrl, options.signal);
        }

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
    return {
      artifacts,
      ...(firstArtifact?.audioBase64 && !firstArtifact.filePath ? { audioBase64: firstArtifact.audioBase64 } : {}),
      ...(firstArtifact?.audioUrl ? { audioUrl: firstArtifact.audioUrl } : {}),
      ...(firstArtifact?.filePath ? { filePath: firstArtifact.filePath } : {}),
      model: response.model,
      providerId: response.providerId,
      rawResponse: response.rawResponse,
      rawUsage: response.rawUsage,
      usage: response.usage
    };
  }
}
