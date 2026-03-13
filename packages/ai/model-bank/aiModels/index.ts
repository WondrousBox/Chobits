import { AiFullModelCard, LobeDefaultAiModelListItem } from '../types/aiModel';
import { default as anthropic } from './anthropic';
import { default as deepseek } from './deepseek';
import { default as google } from './google';
import { default as ollama } from './ollama';
import { default as openai } from './openai';
import { default as qwen } from './qwen';
import { default as zhipu } from './zhipu';

type ModelsMap = Record<string, AiFullModelCard[]>;

const buildDefaultModelList = (map: ModelsMap): LobeDefaultAiModelListItem[] => {
  let models: LobeDefaultAiModelListItem[] = [];

  Object.entries(map).forEach(([provider, providerModels]) => {
    const newModels = providerModels.map((model) => ({
      ...model,
      abilities: model.abilities ?? {},
      enabled: model.enabled || false,
      providerId: provider,
      source: 'builtin' as const
    }));
    models = models.concat(newModels);
  });

  return models;
};

export const DEFAULT_MODEL_LIST = buildDefaultModelList({
  openai,
  anthropic,
  google,
  deepseek,
  qwen,
  zhipu,
  ollama,
});

export { default as anthropic } from './anthropic';
export { default as deepseek } from './deepseek';
export { default as google } from './google';
export { default as ollama } from './ollama';
export { gptImage1ParamsSchema, default as openai, openaiChatModels } from './openai';
export { default as qwen } from './qwen';
export { default as zhipu } from './zhipu';
