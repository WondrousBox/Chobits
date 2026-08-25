import { describe, expect, it } from 'vitest';

import { BUILTIN_PROVIDER_DEFINITIONS } from '../../packages/ai/providers/builtins';
import { registerBuiltInProviders } from '../../packages/ai/providers/catalog';
import { listProviderRuntimeModels, registerBuiltinProviderDefinitions } from '../../packages/ai/providers/service';
import { getProvider } from '../../packages/ai/registry';

describe('provider model listing', () => {
  it('all providers have model items in their definitions', () => {
    for (const def of BUILTIN_PROVIDER_DEFINITIONS) {
      const count = def.models?.items?.length || 0;
      console.log(`${def.id}: ${count} models (strategy: ${def.models?.strategy})`);
      expect(count, `${def.id} should have models`).toBeGreaterThan(0);
    }
  });

  it('listProviderRuntimeModels returns models for all providers', async () => {
    registerBuiltinProviderDefinitions();
    for (const def of BUILTIN_PROVIDER_DEFINITIONS) {
      const models = await listProviderRuntimeModels(def.id);
      console.log(`${def.id}: ${models.length} runtime models, first: ${models[0]?.id}`);
      expect(models.length, `${def.id} should have runtime models`).toBeGreaterThan(0);
      // Check each model has required fields
      for (const model of models.slice(0, 3)) {
        expect(model.id).toBeTruthy();
        expect(model.label).toBeTruthy();
      }
    }
  });

  it('provider adapter listModels works without API key for all OpenAI-compatible providers', async () => {
    registerBuiltinProviderDefinitions();
    registerBuiltInProviders();

    const openaiCompatibleIds = ['deepseek', 'openai', 'qwen', 'zai', 'zhipu'];
    for (const id of openaiCompatibleIds) {
      const provider = getProvider(id);
      expect(provider, `provider ${id} should be registered`).toBeTruthy();
      // Call listModels without any secrets — this should NOT throw
      const models = await provider!.listModels!();
      console.log(`${id}: listModels returned ${models.length} models (no API key)`);
      expect(models.length, `${id} listModels should return curated models even without API key`).toBeGreaterThan(0);
    }
  });
});
