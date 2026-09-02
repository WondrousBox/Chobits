import type { BuiltinProviderDefinition } from '../types';
import { anthropicDefinition } from './anthropic/definition';
import { deepseekDefinition } from './deepseek/definition';
import { geminiDefinition } from './gemini/definition';
import { gptSovitsDefinition } from './gpt-sovits/definition';
import { gpteamDefinition } from './gpteam/definition';
import { kimiDefinition } from './kimi/definition';
import { minimaxDefinition } from './minimax/definition';
import { ollamaDefinition } from './ollama/definition';
import { openaiDefinition } from './openai/definition';
import { qwenDefinition } from './qwen/definition';
import { vllmDefinition } from './vllm/definition';
import { zaiDefinition } from './zai/definition';
import { zhipuDefinition } from './zhipu/definition';

export const BUILTIN_PROVIDER_DEFINITIONS: BuiltinProviderDefinition[] = [
  anthropicDefinition,
  deepseekDefinition,
  geminiDefinition,
  gptSovitsDefinition,
  gpteamDefinition,
  kimiDefinition,
  minimaxDefinition,
  ollamaDefinition,
  openaiDefinition,
  qwenDefinition,
  vllmDefinition,
  zaiDefinition,
  zhipuDefinition
];

export {
  anthropicDefinition,
  deepseekDefinition,
  geminiDefinition,
  gpteamDefinition,
  gptSovitsDefinition,
  kimiDefinition,
  minimaxDefinition,
  ollamaDefinition,
  openaiDefinition,
  qwenDefinition,
  vllmDefinition,
  zaiDefinition,
  zhipuDefinition
};
