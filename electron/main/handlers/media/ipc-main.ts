import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';
import { app } from 'electron';
import ffmpeg from 'fluent-ffmpeg';

// ESM-safe __dirname/__filename
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set FFmpeg paths
ffmpeg.setFfmpegPath(path.join(__dirname, '../../resources/ffmpeg', process.platform, process.arch, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'));
ffmpeg.setFfprobePath(path.join(__dirname, '../../resources/ffmpeg', process.platform, process.arch, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'));

/**
 * Thumbnail generation options
 */
interface ThumbnailOptions {
  /** Source file path */
  sourcePath: string;
  /** Start time in seconds (for video) */
  startTime?: number;
  /** End time in seconds (for video) */
  endTime?: number;
  /** Number of thumbnails to generate */
  count: number;
  /** Output width */
  width: number;
  /** Output height */
  height: number;
}

/**
 * Thumbnail result
 */
interface ThumbnailResult {
  /** Thumbnail URL (data URL or file path) */
  url: string;
  /** Time offset in source (seconds) */
  timeOffset: number;
  /** Width */
  width: number;
  /** Height */
  height: number;
}

/**
 * Get video info using ffprobe
 */
async function getVideoInfo(filePath: string): Promise<{ duration: number; width: number; height: number } | null> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.error('[media] ffprobe error:', err);
        resolve(null);
        return;
      }

      const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
      if (!videoStream) {
        resolve(null);
        return;
      }

      resolve({
        duration: metadata.format.duration || 0,
        width: videoStream.width || 0,
        height: videoStream.height || 0
      });
    });
  });
}

/**
 * Generate thumbnails from a video file
 */
async function generateVideoThumbnails(options: ThumbnailOptions): Promise<ThumbnailResult[]> {
  const { sourcePath, startTime = 0, endTime, count, width, height } = options;

  // Get video duration if not provided
  let duration = endTime ? endTime - startTime : 0;
  if (!duration) {
    const info = await getVideoInfo(sourcePath);
    if (!info) {
      throw new Error('Failed to get video info');
    }
    duration = info.duration - startTime;
  }

  // Calculate timestamps for thumbnails
  const interval = duration / (count + 1);
  const timestamps: number[] = [];
  for (let i = 1; i <= count; i++) {
    timestamps.push(startTime + interval * i);
  }

  // Generate thumbnails
  const results: ThumbnailResult[] = [];

  for (const timestamp of timestamps) {
    try {
      const thumbnail = await generateSingleThumbnail(sourcePath, timestamp, width, height);
      if (thumbnail) {
        results.push(thumbnail);
      }
    } catch (err) {
      console.error(`[media] Failed to generate thumbnail at ${timestamp}s:`, err);
    }
  }

  return results;
}

/**
 * Generate a single thumbnail at a specific timestamp
 */
function generateSingleThumbnail(sourcePath: string, timestamp: number, width: number, height: number): Promise<ThumbnailResult | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];

    ffmpeg(sourcePath)
      .seekInput(timestamp)
      .frames(1)
      .format('image2pipe')
      .videoCodec('mjpeg')
      .size(`${width}x${height}`)
      // @ts-ignore
      .on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      })
      .on('end', () => {
        if (chunks.length === 0) {
          resolve(null);
          return;
        }

        const buffer = Buffer.concat(chunks);
        const dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;

        resolve({
          url: dataUrl,
          timeOffset: timestamp,
          width,
          height
        });
      })
      .on('error', (err) => {
        console.error('[media] Thumbnail generation error:', err);
        resolve(null);
      })
      .run();
  });
}

/**
 * Generate thumbnail for an image file
 */
async function generateImageThumbnail(sourcePath: string, width: number, height: number): Promise<ThumbnailResult | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];

    const command = ffmpeg(sourcePath)
      .format('image2pipe')
      .videoCodec('mjpeg')
      .size(`${width}x${height}`);

    const stream = command.pipe();
    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    stream.on('end', () => {
      if (chunks.length === 0) {
        resolve(null);
        return;
      }

      const buffer = Buffer.concat(chunks);
      const dataUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;

      resolve({
        url: dataUrl,
        timeOffset: 0,
        width,
        height
      });
    });
    stream.on('error', (err: Error) => {
      console.error('[media] Image thumbnail error:', err);
      resolve(null);
    });
  });
}

/**
 * Check if file is a video
 */
function isVideoFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.wmv', '.flv'];
  return videoExtensions.includes(ext);
}

/**
 * Check if file is an image
 */
function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
  return imageExtensions.includes(ext);
}

/**
 * Initialize media IPC handlers
 */
export function initMediaHandlers(win: BrowserWindow): void {
  /**
   * Generate thumbnails for a media file
   */
  ipcMain.handle('media:generateThumbnails', async (_evt, options: ThumbnailOptions): Promise<ThumbnailResult[]> => {
    try {
      // Validate file exists
      if (!fs.existsSync(options.sourcePath)) {
        throw new Error(`File not found: ${options.sourcePath}`);
      }

      // Determine file type and generate thumbnails
      if (isVideoFile(options.sourcePath)) {
        return await generateVideoThumbnails(options);
      } else if (isImageFile(options.sourcePath)) {
        // For images, generate a single thumbnail
        const thumbnail = await generateImageThumbnail(options.sourcePath, options.width, options.height);
        return thumbnail ? [thumbnail] : [];
      } else {
        throw new Error('Unsupported file type');
      }
    } catch (err) {
      console.error('[media] generateThumbnails error:', err);
      throw err;
    }
  });

  /**
   * Get media file info
   */
  ipcMain.handle('media:getInfo', async (_evt, filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      if (isVideoFile(filePath)) {
        const info = await getVideoInfo(filePath);
        return {
          type: 'video',
          ...info
        };
      } else if (isImageFile(filePath)) {
        // For images, get dimensions using ffprobe
        return new Promise((resolve) => {
          ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
              console.error('[media] ffprobe error:', err);
              resolve({ type: 'image', width: 0, height: 0, duration: 0 });
              return;
            }

            const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
            resolve({
              type: 'image',
              width: videoStream?.width || 0,
              height: videoStream?.height || 0,
              duration: 0
            });
          });
        });
      }

      return null;
    } catch (err) {
      console.error('[media] getInfo error:', err);
      throw err;
    }
  });

  console.log('[media] Media handlers initialized');
}
