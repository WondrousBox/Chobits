import type { ProviderConfig } from '../../../types';
import type { BuiltinProviderDefinition } from '../../types';
import zaiModels from './models';

const zaiSchema: ProviderConfig = {
    id: 'zai',
    label: '智谱 Coding (ZAI)',
    enabled: true,
    icon: 'providers/icons/zhipu-color.svg',
    fields: [
        { key: 'apiKey', label: 'API Key', type: 'password', required: true },
        { key: 'baseUrl', label: 'Base URL (可选)', type: 'text' }
    ]
};

export const zaiDefinition: BuiltinProviderDefinition = {
    id: 'zai',
    aliases: ['zai', 'z.ai', 'z-ai'],
    source: 'builtin',
    display: {
        label: '智谱 Coding (ZAI)',
        description: 'GLM Coding Plan 是专为 AI 编码打造的订阅套餐，在主流 AI 编码工具中畅享智谱高智能模型，提供智能、高速、稳定的编码体验。',
        icon: 'providers/icons/zhipu-color.svg',
        website: 'https://docs.bigmodel.cn/cn/coding-plan/overview'
    },
    catalog: {
        name: 'ZAI',
        checkModel: 'glm-4.7',
        modelsUrl: 'https://docs.bigmodel.cn/cn/coding-plan/overview',
        settings: {
            proxyUrl: {
                placeholder: 'https://open.bigmodel.cn/api/coding/paas/v4'
            },
            sdkType: 'openai',
            showModelFetcher: true
        }
    },
    protocol: {
        kind: 'openai-compatible',
        baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4/',
        piBaseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4/'
    },
    capabilities: {
        chat: true,
        embeddings: false,
        imageGeneration: false,
        modelListing: true,
        transcribe: false
    },
    defaults: {
        models: {
            chat: 'glm-4.7'
        }
    },
    models: {
        strategy: 'builtin',
        items: zaiModels
    },
    schema: zaiSchema
};
