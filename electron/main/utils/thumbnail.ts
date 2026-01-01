import * as fscb from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { nativeImage } from 'electron';
import ffmpeg from 'fluent-ffmpeg';
import mime from 'mime';

// Attempt lazy import of sharp (optional)
type SharpModule = typeof import('sharp');
let sharpPromise: Promise<SharpModule | null> | null = null;
async function getSharp(): Promise<SharpModule | null> {
  if (!sharpPromise) {
    sharpPromise = (async () => {
      try {
        // Some environments may only install platform-specific binary packages; the entry is still 'sharp'.
        const m: any = await import('sharp');
        return m.default || m;
      } catch {
        return null;
      }
    })();
  }
  return sharpPromise;
}

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.svg']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi']);
const AUDIO_EXT = new Set(['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg']);
const TEXT_FILE_EXT = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
  '.py',
  '.java',
  '.c',
  '.cc',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.go',
  '.rs',
  '.sh',
  '.bash',
  '.zsh',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.csv',
  '.log',
  '.html',
  '.css',
  '.scss',
  '.xml',
  '.mdx'
]);

const DOC_EXT = new Set(['.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.pdf', '.key', '.pages', '.numbers']);

export function detectBasicType(filePath: string): { type: string; mimeType: string | null } {
  const ext = filePath ? path.extname(filePath).toLowerCase() : '';
  const mimeType = mime.getType(ext.replace('.', ''));
  let type = 'file';
  if (IMAGE_EXT.has(ext)) type = 'image';
  if (VIDEO_EXT.has(ext)) type = 'video';
  if (AUDIO_EXT.has(ext)) type = 'audio';
  if (TEXT_FILE_EXT.has(ext)) type = 'file';
  if (DOC_EXT.has(ext)) type = 'document';
  return { type, mimeType };
}

interface ThumbOptions {
  size?: number; // max size (square)
  frameAtSeconds?: number; // for video
}

export async function generateThumbnailForResource(res: { filePath?: string; type?: string; title?: string }, opts: ThumbOptions = {}): Promise<Buffer | null> {
  const { filePath, type, title } = res;
  const size = opts.size || 256;
  if (!filePath) {
    return await generatePlaceholder(type || 'file', title, size);
  }
  const ext = path.extname(filePath).toLowerCase();

  try {
    if (IMAGE_EXT.has(ext)) {
      const sharp = await getSharp();
      if (sharp) {
        return await sharp(filePath).resize(size, size, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
      } else {
        // Fallback: just read original (may be large)
        const buf = await fs.readFile(filePath);
        return buf;
      }
    }
    if (VIDEO_EXT.has(ext)) {
      // Extract first frame using ffmpeg into a buffer (png)
      const frameBuffer = await extractVideoFrame(filePath, opts.frameAtSeconds || 0.5, size);
      if (frameBuffer) return frameBuffer;
    }

    // Documents: use nativeImage
    if (DOC_EXT.has(ext)) {
      try {
        const nativeThumb = await nativeImage.createThumbnailFromPath(filePath, { width: size, height: size });
        if (!nativeThumb.isEmpty()) {
          return nativeThumb.toPNG();
        }
      } catch (e) {
        console.warn('[thumbnail] native generation failed', e);
      }
    }

    if (AUDIO_EXT.has(ext)) {
      const waveform = await generateAudioWaveform(filePath, size);
      if (waveform) return waveform;
    }

    // For any other file type not explicitly handled, do not generate a thumbnail.
    return null;
  } catch (e) {
    console.warn('[thumbnail] generation failed', e);
    return null;
  }
}

async function extractVideoFrame(filePath: string, at: number, size: number): Promise<Buffer | null> {
  // Use a temp file then read+resize
  const dir = path.dirname(filePath);
  const name = `.__thumb_${Date.now()}_${Math.random().toString(36).slice(2)}.png`;
  const temp = path.join(dir, name);
  try {
    await new Promise<void>((resolve, reject) => {
      try {
        ffmpeg(filePath)
          .screenshots({ count: 1, timemarks: [at], filename: path.basename(temp), folder: dir })
          .on('end', () => resolve())
          .on('error', (err: any) => reject(err));
      } catch (e) {
        reject(e);
      }
    });
    if (fscb.existsSync(temp)) {
      const sharp = await getSharp();
      const buf = await fs.readFile(temp);
      if (sharp) {
        try {
          return await sharp(buf).resize(size, size, { fit: 'cover' }).png().toBuffer();
        } catch {
          // ignore
        }
      }
      return buf;
    }
  } catch (e) {
    console.warn('[thumbnail] video frame extract failed', e);
  } finally {
    try {
      if (fscb.existsSync(temp)) await fs.unlink(temp);
    } catch {
      // ignore
    }
  }
  return null;
}

async function generateAudioWaveform(filePath: string, size: number): Promise<Buffer | null> {
  const dir = path.dirname(filePath);
  const name = `.__thumb_audio_${Date.now()}_${Math.random().toString(36).slice(2)}.png`;
  const temp = path.join(dir, name);

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(filePath)
        .complexFilter(`showwavespic=s=${size}x${size}:colors=#059669`)
        .frames(1)
        .output(temp)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    if (fscb.existsSync(temp)) {
      const buf = await fs.readFile(temp);
      return buf;
    }
  } catch (e) {
    console.warn('[thumbnail] audio waveform generation failed', e);
  } finally {
    try {
      if (fscb.existsSync(temp)) await fs.unlink(temp);
    } catch {
      // ignore
    }
  }
  return null;
}

async function generatePlaceholder(kind: string, label?: string, size = 256): Promise<Buffer> {
  const sharp = await getSharp();
  const short = (label || kind || 'FILE').slice(0, 4).toUpperCase();
  const palette: Record<string, string> = {
    image: '#2563EB',
    video: '#7C3AED',
    audio: '#059669',
    text: '#374151',
    file: '#6B7280',
    other: '#6B7280'
  };
  const bg = palette[kind] || '#6B7280';
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" rx="${Math.round(size * 0.08)}" fill="${bg}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${Math.round(size * 0.32)}" fill="#FFFFFF" font-weight="700">${short}</text></svg>`;
  const svgBuffer = Buffer.from(svg);
  if (sharp) {
    try {
      return await sharp(svgBuffer).png().toBuffer();
    } catch {
      // ignore
    }
  }
  return svgBuffer; // fallback (consumer must detect SVG)
}
