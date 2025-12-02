import fs from 'node:fs';
import path from 'node:path';

import { NodeHandler } from '../types';

// 动态获取可用的服务商列表
async function getProviderOptions() {
  try {
    // 动态导入AI registry，避免循环依赖
    const { listProviders } = await import('../../../electron/main/ai/registry');
    const providers = listProviders();
    return providers
      .filter((p) => {
        // 只返回支持视觉的服务商（目前先支持智谱）
        return p.id === 'zhipu';
      })
      .map((p) => ({ value: p.id, label: p.label }));
  } catch {
    // 如果导入失败，返回默认选项
    return [{ value: 'zhipu', label: '智谱 (GLM)' }];
  }
}

// 动态获取指定服务商的视觉模型列表
async function getVisionModels(providerId: string) {
  try {
    if (providerId === 'zhipu') {
      // 读取智谱的模型配置
      const modelsPath = path.join(process.env.APP_ROOT || process.cwd(), 'resources', 'providers', 'zhipu.models.json');
      if (fs.existsSync(modelsPath)) {
        const modelsData = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
        const visionModels = modelsData.models
          ?.filter((m: any) => m.type === 'vision' && m.capabilities?.vision)
          .map((m: any) => ({
            value: m.id,
            label: m.label + (m.description ? ` - ${m.description}` : '') + (m.free ? ' (免费)' : '')
          }));
        return visionModels || [];
      }
    }
    // 默认返回智谱的视觉模型
    return [
      { value: 'glm-4v-flash', label: 'GLM-4V-Flash - 支持图片理解，完全免费 (免费)' },
      { value: 'glm-4-5v', label: 'GLM-4.5V - 100B级通用视觉模型新标杆' },
      { value: 'glm-4-1v-thinking', label: 'GLM-4.1V-Thinking - 10B级通用视觉模型新标杆' },
      { value: 'glm-4v-plus-0111', label: 'GLM-4V-Plus-0111 - 支持图片和视频理解' }
    ];
  } catch {
    // 如果读取失败，返回默认选项
    return [{ value: 'glm-4v-flash', label: 'GLM-4V-Flash (免费)' }];
  }
}

// 根据服务商和模型获取动态配置选项
async function getDynamicConfig(providerId?: string, model?: string) {
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
    const models = await getVisionModels(providerId);
    config.push({
      key: 'model',
      label: '模型',
      type: 'string',
      required: true,
      default: models[0]?.value || 'glm-4v-flash',
      description: '选择视觉理解模型',
      inputType: 'select',
      options: models
    });
  } else {
    // 如果没有选择服务商，添加占位模型配置
    config.push({
      key: 'model',
      label: '模型',
      type: 'string',
      required: true,
      default: 'glm-4v-flash',
      description: '请先选择服务商',
      inputType: 'select',
      options: []
    });
  }

  config.push({
    key: 'prompt',
    label: '提示词',
    type: 'string',
    required: false,
    default: '请详细描述这张图片的内容。',
    description: '对图片理解的提示词，告诉AI你想要了解什么',
    inputType: 'textarea'
  });

  return config;
}

// 根据图片扩展名获取MIME类型
function getImageMimeType(imagePath: string): string {
  const ext = path.extname(imagePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp'
  };
  return mimeMap[ext] || 'image/jpeg';
}

// 将图片文件转换为base64
function imageToBase64(imagePath: string): string {
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const mimeType = getImageMimeType(imagePath);
  return `data:${mimeType};base64,${base64Image}`;
}

export const ImageUnderstandNode: NodeHandler = {
  spec: {
    id: 'ai/image-understand',
    label: '图片理解',
    category: 'AI',
    description: '使用AI服务商提供的视觉模型理解图片内容',
    inputs: [{ key: 'image', label: '图片路径', type: ['file', 'string'], required: true }],
    config: [
      {
        key: 'providerId',
        label: '服务商',
        type: 'string',
        required: true,
        default: 'zhipu',
        description: '选择AI服务商',
        inputType: 'select',
        options: [{ value: 'zhipu', label: '智谱 (GLM)' }]
      },
      {
        key: 'model',
        label: '模型',
        type: 'string',
        required: true,
        default: 'glm-4v-flash',
        description: '选择视觉理解模型',
        inputType: 'select',
        options: [
          { value: 'glm-4v-flash', label: 'GLM-4V-Flash - 支持图片理解，完全免费 (免费)' },
          { value: 'glm-4-5v', label: 'GLM-4.5V - 100B级通用视觉模型新标杆' },
          { value: 'glm-4-1v-thinking', label: 'GLM-4.1V-Thinking - 10B级通用视觉模型新标杆' },
          { value: 'glm-4v-plus-0111', label: 'GLM-4V-Plus-0111 - 支持图片和视频理解' }
        ]
      },
      {
        key: 'prompt',
        label: '提示词',
        type: 'string',
        required: false,
        default: '请详细描述这张图片的内容。',
        description: '对图片理解的提示词，告诉AI你想要了解什么',
        inputType: 'textarea'
      }
    ],
    outputs: [{ key: 'text', label: '理解结果', type: 'string' }]
  },
  async run({ input, config, emit }) {
    const imagePath = String(input.image || '');
    if (!imagePath) throw new Error('缺少图片路径');
    if (!fs.existsSync(imagePath)) throw new Error(`图片不存在: ${imagePath}`);

    const providerId = String(config?.providerId || 'zhipu');
    const model = String(config?.model || 'glm-4v-flash');
    const prompt = String(config?.prompt || '请详细描述这张图片的内容。');

    emit('node:progress', { progress: 10, message: '读取图片...' });

    // 将图片转换为base64
    const imageBase64 = imageToBase64(imagePath);

    emit('node:progress', { progress: 30, message: '调用AI服务...' });

    // 获取AI Provider
    const { getProvider } = await import('../../../electron/main/ai/registry');
    const { getAllSecrets } = await import('../../../electron/main/ai/settings-store');
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

    emit('node:progress', { progress: 50, message: '发送请求...' });

    // 构建消息，使用OpenAI兼容的格式
    // OpenAI兼容的视觉模型支持的消息格式：
    // messages: [{ role: 'user', content: [{ type: 'text', text: '...' }, { type: 'image_url', image_url: { url: 'data:image/...;base64,...' } }] }]
    const messages = [
      {
        role: 'user' as const,
        content: [
          {
            type: 'text',
            text: prompt
          },
          {
            type: 'image_url',
            image_url: {
              url: imageBase64
            }
          }
        ]
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

    emit('node:progress', { progress: 100, message: '完成' });

    const resultText = response.message?.content || '';

    if (!resultText) {
      throw new Error('AI服务返回空结果');
    }

    return { text: resultText };
  }
};
