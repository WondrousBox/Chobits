export interface MediaFeatureEstimatorInput {
  timeData: ArrayLike<number>;
  frequencyData: ArrayLike<number>;
  previousFrequencyData?: ArrayLike<number>;
}

export interface MediaMusicFeatures {
  energy: number;
  energyDb: number;
  onsetStrength: number;
  bandBalance: number;
  brightness: number;
  musicProbability: number;
}

export const MEDIA_MUSIC_FEATURE_MIN_AUDIBLE_DB = -60;

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function toDecibels(rms: number): number {
  if (rms <= 0) return -Infinity;
  return 20 * Math.log10(rms);
}

export function estimateMusicProbability(params: { energyDb: number; onsetStrength: number; bandBalance: number; brightness: number }): number {
  if (params.energyDb < MEDIA_MUSIC_FEATURE_MIN_AUDIBLE_DB) return 0;

  const energyScore = clamp01((params.energyDb + 55) / 30);
  const onsetScore = clamp01(params.onsetStrength * 5);
  const balanceScore = clamp01(params.bandBalance * 1.4);
  const brightnessScore = clamp01(params.brightness * 1.8);

  return clamp01(energyScore * 0.35 + onsetScore * 0.3 + balanceScore * 0.2 + brightnessScore * 0.15);
}

export function estimateMediaMusicFeatures(input: MediaFeatureEstimatorInput): MediaMusicFeatures {
  let sumSquares = 0;
  for (let i = 0; i < input.timeData.length; i += 1) {
    const centered = (input.timeData[i] - 128) / 128;
    sumSquares += centered * centered;
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, input.timeData.length));
  const energyDb = toDecibels(rms);

  let flux = 0;
  let totalEnergy = 0;
  let midEnergy = 0;
  let highEnergy = 0;
  const binCount = input.frequencyData.length;

  for (let i = 0; i < binCount; i += 1) {
    const current = input.frequencyData[i] / 255;
    const previous = (input.previousFrequencyData?.[i] ?? input.frequencyData[i]) / 255;
    flux += Math.max(0, current - previous);
    totalEnergy += current;

    const ratio = i / Math.max(1, binCount);
    if (ratio >= 0.08 && ratio <= 0.55) {
      midEnergy += current;
    }
    if (ratio > 0.55) {
      highEnergy += current;
    }
  }

  const normalizedFlux = flux / Math.max(1, binCount);
  const bandBalance = totalEnergy > 0 ? midEnergy / totalEnergy : 0;
  const brightness = totalEnergy > 0 ? highEnergy / totalEnergy : 0;
  const onsetStrength = clamp01(normalizedFlux * 8);
  const musicProbability = estimateMusicProbability({
    energyDb,
    onsetStrength,
    bandBalance,
    brightness
  });

  return {
    energy: clamp01(rms * 3),
    energyDb,
    onsetStrength,
    bandBalance,
    brightness,
    musicProbability
  };
}
