import { describe, expect, it } from 'vitest';

import { estimateMediaMusicFeatures } from '../packages/audio-reactivity/analysis/media-feature-estimator';

function createTimeData(length: number, amplitude: number, cycles: number): Uint8Array {
  const data = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    const value = 128 + Math.sin((i / length) * Math.PI * 2 * cycles) * amplitude;
    data[i] = Math.max(0, Math.min(255, Math.round(value)));
  }
  return data;
}

function createFrequencyData(length: number, ranges: Array<{ start: number; end: number; value: number }>): Uint8Array {
  const data = new Uint8Array(length);
  for (const range of ranges) {
    const start = Math.max(0, Math.floor(range.start * length));
    const end = Math.min(length, Math.ceil(range.end * length));
    for (let i = start; i < end; i += 1) {
      data[i] = range.value;
    }
  }
  return data;
}

describe('media music feature estimator', () => {
  it('keeps silence at zero probability', () => {
    const features = estimateMediaMusicFeatures({
      timeData: new Uint8Array(2048).fill(128),
      frequencyData: new Uint8Array(1024),
      previousFrequencyData: new Uint8Array(1024)
    });

    expect(features.energy).toBe(0);
    expect(features.musicProbability).toBe(0);
  });

  it('rates rhythmic broadband content as music-like', () => {
    const previous = createFrequencyData(1024, [
      { start: 0.08, end: 0.55, value: 24 },
      { start: 0.55, end: 0.9, value: 12 }
    ]);
    const current = createFrequencyData(1024, [
      { start: 0.08, end: 0.55, value: 188 },
      { start: 0.55, end: 0.9, value: 96 }
    ]);

    const features = estimateMediaMusicFeatures({
      timeData: createTimeData(2048, 72, 16),
      frequencyData: current,
      previousFrequencyData: previous
    });

    expect(features.energyDb).toBeGreaterThan(-12);
    expect(features.onsetStrength).toBeGreaterThan(0.35);
    expect(features.bandBalance).toBeGreaterThan(0.55);
    expect(features.musicProbability).toBeGreaterThan(0.62);
  });

  it('keeps steady narrowband speech-like content below the dance threshold', () => {
    const speechBand = createFrequencyData(1024, [{ start: 0.12, end: 0.28, value: 96 }]);

    const features = estimateMediaMusicFeatures({
      timeData: createTimeData(2048, 26, 5),
      frequencyData: speechBand,
      previousFrequencyData: speechBand
    });

    expect(features.energyDb).toBeGreaterThan(-22);
    expect(features.onsetStrength).toBe(0);
    expect(features.musicProbability).toBeLessThan(0.62);
  });
});
