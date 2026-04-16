import type { BuiltinProviderDefinition } from '../types';
import { anthropicDefinition } from './anthropic/definition';
import { deepseekDefinition } from './deepseek/definition';
import { geminiDefinition } from './gemini/definition';
import { minimaxDefinition } from './minimax/definition';
import { ollamaDefinition } from './ollama/definition';
import { openaiDefinition } from './openai/definition';
import { qwenDefinition } from './qwen/definition';
import { zaiDefinition } from './zai/definition';
import { zhipuDefinition } from './zhipu/definition';

export const BUILTIN_PROVIDER_DEFINITIONS: BuiltinProviderDefinition[] = [
  anthropicDefinition,
  deepseekDefinition,
  geminiDefinition,
  minimaxDefinition,
  ollamaDefinition,
  openaiDefinition,
  qwenDefinition,
  zaiDefinition,
  zhipuDefinition
];

export { anthropicDefinition, deepseekDefinition, geminiDefinition, minimaxDefinition, ollamaDefinition, openaiDefinition, qwenDefinition, zaiDefinition, zhipuDefinition };
