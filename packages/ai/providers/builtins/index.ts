import type { BuiltinProviderDefinition } from '../types';
import { anthropicDefinition } from './anthropic/definition';
import { deepseekDefinition } from './deepseek/definition';
import { geminiDefinition } from './gemini/definition';
import { ollamaDefinition } from './ollama/definition';
import { openaiDefinition } from './openai/definition';
import { qwenDefinition } from './qwen/definition';
import { zhipuDefinition } from './zhipu/definition';

export const BUILTIN_PROVIDER_DEFINITIONS: BuiltinProviderDefinition[] = [
  anthropicDefinition,
  deepseekDefinition,
  geminiDefinition,
  ollamaDefinition,
  openaiDefinition,
  qwenDefinition,
  zhipuDefinition
];

export {
  anthropicDefinition,
  deepseekDefinition,
  geminiDefinition,
  ollamaDefinition,
  openaiDefinition,
  qwenDefinition,
  zhipuDefinition
};
