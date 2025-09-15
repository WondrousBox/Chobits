import { EmbeddingProvider, EmbedOptions, getDefaultModels, getModelCacheDir, l2Normalize } from './provider';
import path from 'node:path';

type Pipeline = any;

export class TransformersEmbeddingProvider implements EmbeddingProvider {
  name = 'transformers';
  dim = 384; // default for gte-small; will update after model load if different
  private modelId: string;
  private normalizeDefault: boolean;
  private pipeline: Pipeline | null = null;

  constructor(opts?: { model?: string; normalize?: boolean }) {
    const defaults = getDefaultModels();
    this.modelId = opts?.model || defaults.transformers;
    this.normalizeDefault = opts?.normalize ?? true;
  }

  async init(): Promise<void> {
    if (this.pipeline) return;
    // Lazy import to avoid increasing startup time
    const { env, pipeline } = await import('@xenova/transformers');
    // set cache under user data
    env.localModelPath = getModelCacheDir();
    env.allowLocalModels = true;
    env.cacheDir = getModelCacheDir();
    // Note: In Electron main, no WebGPU; CPU/WASM backend will be used.
    this.pipeline = await pipeline('feature-extraction', this.modelId, { quantized: true });
    // Probe dimension
    const test = await (this.pipeline as any)("hello world");
    const vec = Array.isArray(test) ? (Array.isArray(test[0]) ? test[0] : test) : test;
    const pooled = Array.isArray(vec[0]) ? meanPool(vec as number[][]) : (vec as number[]);
    this.dim = pooled.length;
  }

  async embed(text: string, opts?: EmbedOptions): Promise<number[]> {
    await this.init();
    const res = await (this.pipeline as any)(text);
    const vec = Array.isArray(res) ? (Array.isArray(res[0]) ? res[0] : res) : res;
    const pooled = Array.isArray(vec[0]) ? meanPool(vec as number[][]) : (vec as number[]);
    const norm = opts?.normalize ?? this.normalizeDefault;
    return norm ? l2Normalize(pooled as number[]) : (pooled as number[]);
  }

  async embedMany(texts: string[], opts?: EmbedOptions): Promise<number[][]> {
    await this.init();
    const results: number[][] = [];
    for (const t of texts) {
      results.push(await this.embed(t, opts));
    }
    return results;
  }
}

function meanPool(matrix: number[][]): number[] {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const out = new Array<number>(cols).fill(0);
  for (let r = 0; r < rows; r++) {
    const row = matrix[r];
    for (let c = 0; c < cols; c++) out[c] += row[c];
  }
  for (let c = 0; c < cols; c++) out[c] /= rows;
  return out;
}

export function createTransformersProvider(config?: { model?: string; normalize?: boolean }) {
  return new TransformersEmbeddingProvider(config);
}
