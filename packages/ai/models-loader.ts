import fs from 'node:fs';
import path from 'node:path';

import { getResourcePath } from '../common/utils';

export type ModelInfo = {
  id: string;
  label?: string;
  // Optional extended metadata; intentionally flexible so JSON can evolve without code changes
  type?: 'chat' | 'embedding' | 'audio' | 'image' | 'tooling' | 'video' | 'vision' | string;
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
 * @deprecated Use loadProviderModelsFromBank instead
 * Load curated models for a provider from resources/providers/<id>.models.json
 * The file can be either an array of models or an object with { models: [...] }
 */
export function loadProviderModels(id: string): ModelInfo[] {
  try {
    const dir = getResourcePath('providers');
    const file = path.join(dir!, `${id}.models.json`);
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.models) ? parsed.models : [];
    if (!Array.isArray(arr)) return [];
    // Validate minimal shape (id required)
    return arr
      .filter(Boolean)
      .map((m: any) => ({ id: String(m.id), ...m }) as ModelInfo)
      .filter((m) => !!m.id);
  } catch {
    return [];
  }
}
/**
 * Load models from model-bank for a provider
 * This is the new preferred method for loading model information
 */
export async function loadProviderModelsFromBank(providerId: string): Promise<ModelInfo[]> {
  try {
    // Dynamically import the model-bank module to avoid circular dependencies
    const modelBank = await import('./model-bank/aiModels');

    // Filter models by provider ID from DEFAULT_MODEL_LIST
    // This contains all actual model definitions with complete metadata
    const providerModels = modelBank.DEFAULT_MODEL_LIST.filter((model: any) => model.providerId === providerId);

    if (!providerModels || providerModels.length === 0) {
      console.debug(`No models found for provider ${providerId}`);
      return [];
    }

    // Map the model-bank models to the existing ModelInfo structure
    return providerModels.map((model: any) => ({
      id: model.id,
      label: model.displayName || model.id,
      type: model.type || 'chat',
      context: model.contextWindowTokens,
      pricing: model.pricing
        ? {
          prompt: model.pricing.input,
          completion: model.pricing.output,
          unit: '1K tokens',
          currency: 'USD'
        }
        : undefined,
      capabilities: {
        vision: model.vision,
        function_call: model.functionCall,
        reasoning: model.reasoning,
        search: model.search,
        video: model.video,
        files: model.files,
        imageOutput: model.imageOutput
      },
      tags: model.tags || [],
      description: model.description,
      // Preserve any additional fields
      ...model
    }));
  } catch (error) {
    console.warn(`Failed to load models from model-bank for provider ${providerId}:`, error);
    return [];
  }
}
