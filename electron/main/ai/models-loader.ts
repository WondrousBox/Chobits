import fs from 'node:fs';
import path from 'node:path';
import { getResourcePath } from '../utils/resources-path';

export type ModelInfo = {
  id: string;
  label?: string;
  // Optional extended metadata; intentionally flexible so JSON can evolve without code changes
  type?: 'chat' | 'embedding' | 'audio' | 'image' | 'tooling' | string;
  context?: number; // context window tokens
  pricing?: {
    prompt?: number; // price per unit for input tokens
    completion?: number; // price per unit for output tokens
    unit?: '1K tokens' | '1M tokens' | string;
    currency?: 'USD' | 'CNY' | string;
  };
  capabilities?: Record<string, boolean>;
  tags?: string[];
  description?: string;
  // Allow arbitrary provider-specific fields
  [k: string]: any;
};

/**
 * Load curated models for a provider from resources/providers/<id>.models.json
 * The file can be either an array of models or an object with { models: [...] }
 */
export function loadProviderModels(id: string): ModelInfo[] {
  try {
    const dir = getResourcePath('providers');
    const file = path.join(dir, `${id}.models.json`);
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.models) ? parsed.models : [];
    if (!Array.isArray(arr)) return [];
    // Validate minimal shape (id required)
    return arr.filter(Boolean).map((m: any) => ({ id: String(m.id), ...m } as ModelInfo)).filter(m => !!m.id);
  } catch {
    return [];
  }
}
