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
    console.warn(`[ai-chat] Failed to load chat models for provider ${providerId}:`, error);
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
      default: '',
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

export const AiChatNode: NodeHandler = {
  spec: {
    id: 'ai/chat',
    label: '大模型对话',
    category: 'AI',
    description: '使用AI大模型进行对话，输入文本内容并获取AI回复',
    backgroundColor: '#8b5cf6',
    icon: 'TbRobot',
    inputs: [
      { key: 'systemPrompt', label: '系统提示词', type: 'string', inputType: 'textarea', required: false, description: '可选的系统提示词，用于设置AI的角色和行为' },
      { key: 'message', label: '对话内容', type: 'string', required: true }
    ],
    // 静态配置作为默认值，实际配置通过 getConfig 动态获取
    config: [],
    outputs: [{ key: 'response', label: '对话回复', type: 'string', description: 'AI返回的对话回复内容' }]
  },
  // 动态获取配置，根据当前配置值返回相应的选项
  async getConfig(config?: NodeConfig): Promise<PortSchema[]> {
    const providerId = config?.providerId as string | undefined;
    return getDynamicConfig(providerId);
  },
  async run({ input, config, emit }) {
    const message = String(input.message || '');
    if (!message) throw new Error('缺少对话内容');

    const providerId = String(config?.providerId || 'zhipu');
    const model = String(config?.model || 'glm-4-5-flash');

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

    emit('node:progress', { progress: 30, message: '发送对话请求...' });

    // 构建消息，使用OpenAI兼容的格式
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    // 如果有系统提示词，先添加系统消息
    const systemPrompt = input.systemPrompt ? String(input.systemPrompt).trim() : '';
    if (systemPrompt) {
      messages.push({
        role: 'system' as const,
        content: systemPrompt
      });
    }

    // 添加用户消息
    messages.push({
      role: 'user' as const,
      content: message
    });

    let accumulatedText = '';

    // 调用AI Provider的chat方法
    const response = await provider.chat(
      {
        messages,
        providerId,
        extras: {
          model,
          secrets
        },
        stream: true
      },
      (event) => {
        if (event.type === 'delta' && event.data.text) {
          accumulatedText += event.data.text;
          emit('node:progress', { progress: 50, detail: accumulatedText });
        }
      },
      undefined // 不使用AbortSignal
    );

    emit('node:progress', { progress: 90, message: '处理回复...' });

    const responseText = response.message?.content || '';

    if (!responseText) {
      throw new Error('AI服务返回空结果');
    }

    emit('node:progress', { progress: 100, message: '完成' });

    return {
      response: responseText
    };
  }
};
