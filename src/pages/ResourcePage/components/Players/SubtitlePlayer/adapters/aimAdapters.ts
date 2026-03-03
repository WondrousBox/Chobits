/**
 * Aim-specific adapter implementations
 *
 * This file provides adapter implementations that connect
 * the SubtitleTimeline component to the Aim application's
 * IPC services (window.YUA).
 */

import type { AnnotationType, FilePickOptions, FilePickResult, MediaInfo, TimelineAdapters } from '../SubtitleTimeline/adapters/types';
import { getAnnotationColor } from '../useAnnotations';

/**
 * Create Aim-specific adapters for SubtitleTimeline
 *
 * These adapters bridge the component to the main process via IPC.
 */
export function createAimAdapters(): TimelineAdapters {
  return {
    media: {
      getMediaInfo: async (filePath: string): Promise<MediaInfo | null> => {
        try {
          const info = await window.YUA.media?.['media:getInfo']?.(filePath);
          return info || null;
        } catch (err) {
          console.warn('[AimAdapters] getMediaInfo failed:', err);
          return null;
        }
      },

      pickFiles: async (options: FilePickOptions): Promise<FilePickResult | null> => {
        try {
          const result = await window.YUA.file?.['file:pickFile']?.({
            filters: options.filters,
            multi: options.multi
          });
          return result || null;
        } catch (err) {
          console.warn('[AimAdapters] pickFiles failed:', err);
          return null;
        }
      },

      extractWaveform: async (inputPath: string, samplesCount: number) => {
        try {
          const result = await window.YUA.ffmpeg?.extractWaveform?.({
            inputPath,
            samplesCount
          });
          return result || { peaks: [], duration: 0 };
        } catch (err) {
          console.warn('[AimAdapters] extractWaveform failed:', err);
          return { peaks: [], duration: 0 };
        }
      }

      // generateThumbnails is optional - not implemented yet
      // When needed, implement: async (videoPath: string, times: number[]) => Promise<string[]>
    },

    annotation: {
      getAnnotationColor: (type: AnnotationType): string => {
        return getAnnotationColor(type);
      }
    },

    idGenerator: {
      generateSourceId: (): string => {
        return `source-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      },

      generateSegmentId: (trackIndex: number, segmentIndex: number): string => {
        return `t${trackIndex}-${segmentIndex}`;
      },

      parseSegmentId: (id: string): { trackIndex: number; segmentIndex: number } | null => {
        const match = id.match(/^t(\d+)-(\d+)$/);
        if (!match) return null;
        return {
          trackIndex: parseInt(match[1], 10),
          segmentIndex: parseInt(match[2], 10)
        };
      },

      generateMediaSourceId: (): string => {
        return `media-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      }
    },

    config: {
      videoExtensions: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'],
      imageExtensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'],
      defaultMediaInfo: { width: 1920, height: 1080 },
      waveformSampleCount: 150
    }
  };
}
