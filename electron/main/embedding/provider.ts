import { app } from 'electron';
import path from 'node:path';

export type EmbedOptions = {
  model?: string;
  normalize?: boolean; // L2-normalize outputs for cosine similarity
};

export interface EmbeddingProvider {
  readonly name: string;
  readonly dim: number; // native output dimension of the model
  init(): Promise<void>;
  embed(text: string, opts?: EmbedOptions): Promise<number[]>;
  embedMany(texts: string[], opts?: EmbedOptions): Promise<number[][]>;
}

export type ProviderFactory = (config?: Record<string, any>) => EmbeddingProvider;

export type ProviderConfig = {
  provider: 'transformers' | string; // string to allow future plugins
  model?: string;
  dimOverride?: number; // if set, output will be padded/truncated to this
  normalize?: boolean;
};

export function getDefaultModels() {
  // Default to multilingual small model (384d) for speed and footprint
  return {
    transformers: 'Xenova/gte-small'
  } as const;
}

export function getModelCacheDir() {
  // Cache under userData/models for offline usage and packaging control
  return path.join(app.getPath('userData'), 'models');
}

export function l2Normalize(vec: number[]): number[] {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum) || 1;
  return vec.map((v) => v / norm);
}

export function fitToDim(vec: number[], targetDim: number): number[] {
  if (vec.length === targetDim) return vec;
  if (vec.length > targetDim) return vec.slice(0, targetDim);
  const out = new Array(targetDim);
  for (let i = 0; i < targetDim; i++) out[i] = i < vec.length ? vec[i] : 0;
  return out;
}
