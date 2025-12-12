import fs from 'node:fs';
import path from 'node:path';

import { NodeConfig, NodeHandler, PortSchema } from '../types';

// 动态获取可用的服务商列表
async function getProviderOptions(): Promise<{ value: string; label: string }[]> {
  try {
    // 动态导入AI registry，避免循环依赖
    const { listProviders } = await import('../../ai/registry');
    const providers = listProviders();
    return providers.map((p) => ({ value: p.id, label: p.label }));
  } catch {
    // 如果导入失败，返回默认选项
    return [];
  }
}

// 动态获取指定服务商的对话模型列表
async function getChatModels(providerId: string): Promise<{ value: string; label: string }[]> {
  try {
    // 根据服务商 ID 动态构建模型配置文件路径
    const modelsPath = path.join(process.env.APP_ROOT || process.cwd(), 'resources', 'providers', `${providerId}.models.json`);

    if (fs.existsSync(modelsPath)) {
      const modelsData = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
      const chatModels = modelsData.models
        ?.filter((m: any) => m.type === 'chat')
        .map((m: any) => ({
          value: m.id,
          label: m.label + (m.description ? ` - ${m.description}` : '') + (m.free ? ' (免费)' : '')
        }));
      return chatModels || [];
    }

    // 如果配置文件不存在，返回空数组
    return [];
  } catch (error) {
    // 如果读取失败，返回空数组
    console.warn(`[ai-prompt-optimizer] Failed to load chat models for provider ${providerId}:`, error);
    return [];
  }
}

// 根据服务商和模型获取动态配置选项
async function getDynamicConfig(providerId?: string): Promise<PortSchema[]> {
  const config: any[] = [
    {
      key: 'providerId',
      label: '服务商',
      type: 'string',
      required: true,
      default: 'zhipu',
      description: '选择AI服务商',
      inputType: 'select',
      options: await getProviderOptions()
    }
  ];

  // 如果已选择服务商，添加模型选择
  if (providerId) {
    const models = await getChatModels(providerId);
    if (models.length > 0) {
      config.push({
        key: 'model',
        label: '模型',
        type: 'string',
        required: true,
        default: models[0]?.value || '',
        description: '选择对话模型',
        inputType: 'select',
        options: models
      });
    } else {
      // 如果该服务商没有对话模型，显示提示
      config.push({
        key: 'model',
        label: '模型',
        type: 'string',
        required: false,
        default: '',
        description: `服务商 ${providerId} 暂不支持对话模型`,
        inputType: 'select',
        options: []
      });
    }
  } else {
    // 如果没有选择服务商，添加占位模型配置
    config.push({
      key: 'model',
      label: '模型',
      type: 'string',
      required: false,
      default: '',
      description: '请先选择服务商',
      inputType: 'select',
      options: []
    });
  }

  return config;
}

export const AiPromptOptimizerNode: NodeHandler = {
  spec: {
    id: 'ai/prompt-optimizer',
    label: 'AI提示词优化',
    category: 'AI',
    description: '使用AI优化提示词，使其更清晰、更有效',
    backgroundColor: '#8b5cf6',
    icon: 'TbRobot',
    inputs: [
      {
        key: 'prompt',
        label: '原始提示词',
        type: 'string',
        required: true,
        description: '需要优化的原始提示词'
      },
      {
        key: 'optimizationGoal',
        label: '优化目标',
        type: 'string',
        required: false,
        description: '可选的优化目标说明，例如：更清晰、更具体、更简洁等'
      }
    ],
    // 静态配置作为默认值，实际配置通过 getConfig 动态获取
    config: [],
    outputs: [
      {
        key: 'optimizedPrompt',
        label: '优化后的提示词',
        type: 'string',
        description: 'AI优化后的提示词'
      }
    ]
  },
  // 动态获取配置，根据当前配置值返回相应的选项
  async getConfig(config?: NodeConfig): Promise<PortSchema[]> {
    const providerId = config?.providerId as string | undefined;
    return getDynamicConfig(providerId);
  },
  async run({ input, config, emit }) {
    const prompt = String(input.prompt || '').trim();
    if (!prompt) throw new Error('缺少原始提示词');

    const providerId = String(config?.providerId || '');
    const model = String(config?.model || '');
    const optimizationGoal = input.optimizationGoal ? String(input.optimizationGoal).trim() : '';

    emit('node:progress', { progress: 10, message: '准备调用AI服务...' });

    // 获取AI Provider
    const { getProvider } = await import('../../ai/registry');
    const { getAllSecrets } = await import('../../ai/settings-store');
    const provider = getProvider(providerId);

    if (!provider) {
      throw new Error(`未找到服务商: ${providerId}`);
    }

    if (!provider.chat) {
      throw new Error(`服务商 ${providerId} 不支持对话功能`);
    }

    // 获取服务商的配置字段与当前秘钥
    const schema = provider.getConfigSchema?.();
    const keys = (schema?.fields || []).map((f) => f.key);
    const secrets = await getAllSecrets(providerId, keys);

    // 如果缺少关键字段（例如 apiKey），通知前端弹出配置窗口，并终止本次节点执行
    const needsFields: string[] = [];
    if (!secrets.apiKey) {
      needsFields.push('apiKey');
    }

    if (needsFields.length > 0) {
      // 通过引擎事件转发给渲染进程，由渲染进程决定如何打开配置窗口
      emit('ai:missing-provider', {
        providerId,
        fields: needsFields
      });
      throw new Error(`服务商 ${providerId} 未配置必要秘钥（例如 API Key），已弹出配置窗口，请完成配置后重试。`);
    }

    emit('node:progress', { progress: 30, message: '发送优化请求...' });

    // 构建系统提示词
    const systemPrompt = `你是一个专业的提示词优化专家。你的任务是优化用户提供的提示词，使其更加清晰、具体、有效。

优化原则：
1. 保持原意的同时，使表达更加清晰明确
2. 添加必要的上下文信息
3. 使用更准确的专业术语
4. 确保提示词结构完整、逻辑清晰
5. 如果用户指定了优化目标，请重点考虑该目标

请直接返回优化后的提示词，不要添加任何解释或说明文字。`;

    // 构建用户消息
    let userMessage = `请优化以下提示词：\n\n${prompt}`;
    if (optimizationGoal) {
      userMessage += `\n\n优化目标：${optimizationGoal}`;
    }

    // 构建消息，使用OpenAI兼容的格式
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      {
        role: 'system' as const,
        content: systemPrompt
      },
      {
        role: 'user' as const,
        content: userMessage
      }
    ];

    // 调用AI Provider的chat方法
    const response = await provider.chat(
      {
        messages,
        providerId,
        extras: {
          model,
          secrets
        }
      },
      undefined, // 不使用流式输出
      undefined // 不使用AbortSignal
    );

    emit('node:progress', { progress: 90, message: '处理优化结果...' });

    const optimizedPrompt = response.message?.content || '';

    if (!optimizedPrompt) {
      throw new Error('AI服务返回空结果');
    }

    emit('node:progress', { progress: 100, message: '完成' });

    return {
      optimizedPrompt: optimizedPrompt.trim()
    };
  }
};
