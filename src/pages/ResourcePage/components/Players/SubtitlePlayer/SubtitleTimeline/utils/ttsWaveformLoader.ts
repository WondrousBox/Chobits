/**
 * TTS Waveform Loader - Factory Pattern
 *
 * Creates waveform loaders with injectable media adapters.
 * Supports queue-based concurrent loading with in-memory caching.
 */

import type { MediaServiceAdapter } from '../adapters/types';

const DEFAULT_SAMPLES = 150;
const MAX_CONCURRENT = 3;

export interface WaveformData {
  peaks: number[];
  duration: number;
}

export interface WaveformLoader {
  getWaveform: (audioPath: string) => Promise<WaveformData>;
  clearCache: () => void;
}

/**
 * Create a TTS waveform loader with injectable media adapter
 *
 * @param mediaAdapter - Media service adapter with extractWaveform capability
 * @param samplesCount - Number of waveform samples to extract (default: 150)
 * @returns WaveformLoader instance with getWaveform and clearCache methods
 */
export function createTTSWaveformLoader(mediaAdapter: MediaServiceAdapter | undefined, samplesCount: number = DEFAULT_SAMPLES): WaveformLoader {
  const cache = new Map<string, WaveformData>();
  const queue: Array<{
    audioPath: string;
    resolve: (data: WaveformData) => void;
    reject: (err: unknown) => void;
  }> = [];
  let inFlight = 0;

  function pump(): void {
    if (inFlight >= MAX_CONCURRENT || queue.length === 0) return;

    const next = queue.shift();
    if (!next) return;

    const { audioPath, resolve, reject } = next;
    inFlight++;

    // Check if adapter is available
    if (!mediaAdapter?.extractWaveform) {
      inFlight--;
      reject(new Error('extractWaveform adapter not available'));
      pump();
      return;
    }

    mediaAdapter
      .extractWaveform(audioPath, samplesCount)
      .then((result) => {
        const data = { peaks: result.peaks, duration: result.duration };
        cache.set(audioPath, data);
        inFlight--;
        resolve(data);
        pump();
      })
      .catch((err: unknown) => {
        inFlight--;
        reject(err);
        pump();
      });
  }

  return {
    getWaveform(audioPath: string): Promise<WaveformData> {
      const cached = cache.get(audioPath);
      if (cached) return Promise.resolve(cached);

      return new Promise<WaveformData>((resolve, reject) => {
        queue.push({ audioPath, resolve, reject });
        pump();
      });
    },
    clearCache(): void {
      cache.clear();
    }
  };
}

// ========== Legacy Support (Deprecated) ==========
// The following exports are kept for backward compatibility during migration
// They will be removed in a future version

/**
 * @deprecated Use createTTSWaveformLoader with media adapter instead
 * This function will be removed in a future version
 */
export function getTTSBlockWaveform(_audioPath: string): Promise<WaveformData> {
  console.warn('[ttsWaveformLoader] getTTSBlockWaveform is deprecated. Use createTTSWaveformLoader with media adapter instead.');
  return Promise.resolve({ peaks: [], duration: 0 });
}
