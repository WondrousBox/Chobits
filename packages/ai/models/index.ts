import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

/**
 * 创建 OpenAI 兼容的模型实例
 */
export function createOpenAIModel(config: { apiKey: string; baseUrl?: string; model?: string }): LanguageModel {
  const openai = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl
  });
  return openai(config.model || 'gpt-4o-mini');
}

/**
 * 创建 Anthropic 模型实例
 */
export function createAnthropicModel(config: { apiKey: string; baseUrl?: string; model?: string }): LanguageModel {
  const anthropic = createAnthropic({
    apiKey: config.apiKey,
    baseURL: config.baseUrl
  });
  return anthropic(config.model || 'claude-3-5-sonnet-20241022');
}

/**
 * 创建 Google 模型实例
 */
export function createGoogleModel(config: { apiKey: string; model?: string }): LanguageModel {
  const google = createGoogleGenerativeAI({
    apiKey: config.apiKey
  });
  return google(config.model || 'gemini-1.5-flash');
}

/**
 * 创建 DeepSeek 模型实例（使用 OpenAI 兼容接口）
 */
export function createDeepSeekModel(config: { apiKey: string; baseUrl?: string; model?: string }): LanguageModel {
  const deepseek = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl || 'https://api.deepseek.com/v1'
  });
  return deepseek(config.model || 'deepseek-chat');
}

/**
 * 创建通义千问模型实例（使用 OpenAI 兼容接口）
 */
export function createQwenModel(config: { apiKey: string; baseUrl?: string; model?: string }): LanguageModel {
  const qwen = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  });
  return qwen(config.model || 'qwen-turbo');
}

/**
 * 创建智谱 AI 模型实例（使用 OpenAI 兼容接口）
 */
export function createZhipuModel(config: { apiKey: string; model?: string }): LanguageModel {
  const zhipu = createOpenAI({
    apiKey: config.apiKey,
    baseURL: 'https://open.bigmodel.cn/api/paas/v4'
  });
  return zhipu(config.model || 'glm-4-flash');
}

/**
 * 创建 Ollama 模型实例（使用 OpenAI 兼容接口）
 */
export function createOllamaModel(config: { baseUrl: string; model?: string }): LanguageModel {
  const ollama = createOpenAI({
    apiKey: 'ollama', // Ollama 不需要 API Key
    baseURL: config.baseUrl || 'http://localhost:11434/v1'
  });
  return ollama(config.model || 'llama3.2');
}

// ============================================================================
// 模型路由器
// ============================================================================

interface ModelConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export type ModelCreator = (config: ModelConfig) => ReturnType<typeof createOpenAIModel> | Record<string, any>;

const modelCreators: Record<string, ModelCreator> = {
  openai: (c) => createOpenAIModel({ apiKey: c.apiKey!, baseUrl: c.baseUrl, model: c.model }),
  anthropic: (c) => createAnthropicModel({ apiKey: c.apiKey!, baseUrl: c.baseUrl, model: c.model }),
  google: (c) => createGoogleModel({ apiKey: c.apiKey!, model: c.model }),
  deepseek: (c) => ({ apiKey: c.apiKey!, baseUrl: c.baseUrl || 'https://api.deepseek.com/v1', id: `deepseek/${c.model || 'deepseek-chat'}` }),
  qwen: (c) => createQwenModel({ apiKey: c.apiKey!, baseUrl: c.baseUrl, model: c.model }),
  zhipu: (c) => ({ apiKey: c.apiKey!, id: `zhipuai/${c.model}` }),
  ollama: (c) => createOllamaModel({ baseUrl: c.baseUrl || 'http://localhost:11434/v1', model: c.model })
};

/**
 * 根据提供商 ID 和配置创建模型实例
 */
export function createModel(providerId: string, config: Record<string, string>): any {
  const creator = modelCreators[providerId];
  if (!creator) {
    throw new Error(`不支持的模型提供商: ${providerId}`);
  }
  return creator(config);
}
