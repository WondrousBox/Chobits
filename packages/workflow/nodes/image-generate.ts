import fs from 'node:fs';
import path from 'node:path';

import OpenAI from 'openai';

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

// 动态获取指定服务商的图像生成模型列表
async function getImageModels(providerId: string): Promise<{ value: string; label: string }[]> {
  try {
    // 根据服务商 ID 动态构建模型配置文件路径
    const modelsPath = path.join(process.env.APP_ROOT || process.cwd(), 'resources', 'providers', `${providerId}.models.json`);

    if (fs.existsSync(modelsPath)) {
      const modelsData = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
      const imageModels = modelsData.models
        ?.filter((m: any) => m.type === 'image' && m.capabilities?.image_generation)
        .map((m: any) => ({
          value: m.id,
          label: m.label + (m.description ? ` - ${m.description}` : '') + (m.free ? ' (免费)' : '')
        }));
      return imageModels || [];
    }

    // 如果配置文件不存在，返回空数组
    return [];
  } catch (error) {
    // 如果读取失败，返回空数组
    console.warn(`[image-generate] Failed to load image models for provider ${providerId}:`, error);
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
    const models = await getImageModels(providerId);
    if (models.length > 0) {
      config.push({
        key: 'model',
        label: '模型',
        type: 'string',
        required: true,
        default: models[0]?.value || '',
        description: '选择图片生成模型',
        inputType: 'select',
        options: models
      });
    } else {
      // 如果该服务商没有图片生成模型，显示提示
      config.push({
        key: 'model',
        label: '模型',
        type: 'string',
        required: true,
        default: '',
        description: `服务商 ${providerId} 暂不支持图片生成模型`,
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
      required: true,
      default: '',
      description: '请先选择服务商',
      inputType: 'select',
      options: []
    });
  }

  // 通用图片生成配置
  config.push(
    {
      key: 'size',
      label: '图片尺寸',
      type: 'string',
      required: false,
      default: '1024x1024',
      description: '生成图片的尺寸，例如 512x512、1024x1024',
      inputType: 'select',
      options: [
        { value: '512x512', label: '512 x 512' },
        { value: '768x768', label: '768 x 768' },
        { value: '1024x1024', label: '1024 x 1024' }
      ]
    },
    {
      key: 'quality',
      label: '图片质量',
      type: 'string',
      required: false,
      default: 'standard',
      description: 'standard（标准）或 hd（高清，仅部分模型支持）',
      inputType: 'select',
      options: [
        { value: 'standard', label: '标准' },
        { value: 'hd', label: '高清' }
      ]
    }
  );

  return config;
}

export const ImageGenerateNode: NodeHandler = {
  spec: {
    id: 'image/image-generate',
    label: '图像生成',
    category: 'Image',
    description: '通过文字描述/添加参考图生成图片',
    backgroundColor: '#ec4899',
    icon: 'TbPhoto',
    inputs: [{ key: 'prompt', label: '提示词', type: 'string', required: true, description: '用于生成图片的文本描述' }],
    // 静态配置作为默认值，实际配置通过 getConfig 动态获取
    config: [],
    outputs: [
      { key: 'image', label: '图片', type: ['file', 'string'], description: '生成图片的 URL 或本地路径，可直接连接到图片展示节点' },
      { key: 'imageUrl', label: '图片 URL', type: 'string', description: '生成图片的 URL（同 image 输出）' }
    ]
  },
  // 动态获取配置，根据当前配置值返回相应的选项
  async getConfig(config?: NodeConfig): Promise<PortSchema[]> {
    const providerId = config?.providerId as string | undefined;
    return getDynamicConfig(providerId);
  },
  async run({ input, config, emit }) {
    const prompt = String(input.prompt || '').trim();
    if (!prompt) throw new Error('缺少提示词');

    const providerId = String(config?.providerId || 'zhipu');
    const model = String(config?.model || 'cogview-3-flash');
    const size = String(config?.size || '1024x1024');
    const quality = String(config?.quality || 'standard');

    emit('node:progress', { progress: 10, message: '准备调用图片生成服务...' });

    // 获取服务商的配置字段与当前秘钥
    const { getProvider } = await import('../../ai/registry');
    const { getAllSecrets } = await import('../../ai/settings-store');
    const provider = getProvider(providerId);

    if (!provider) {
      throw new Error(`未找到服务商: ${providerId}`);
    }

    // 获取服务商的配置字段定义
    const schema = provider.getConfigSchema?.();
    const keys = (schema?.fields || []).map((f) => f.key);
    const secrets = await getAllSecrets(providerId, keys);

    // 如果缺少关键字段（例如 apiKey），通知前端弹出配置窗口，并终止本次节点执行
    const needsFields: string[] = [];
    if (!secrets.apiKey) {
      needsFields.push('apiKey');
    }

    if (needsFields.length > 0) {
      emit('ai:missing-provider', {
        providerId,
        fields: needsFields
      });
      throw new Error(`服务商 ${providerId} 未配置必要秘钥（例如 API Key），已弹出配置窗口，请完成配置后重试。`);
    }

    emit('node:progress', { progress: 30, message: '调用图片生成服务...' });

    // 使用 OpenAI SDK 的 images.generate 接口，适配 OpenAI 兼容的图片生成 API（如智谱 CogView）
    const apiKey = secrets.apiKey;
    const baseURL = (secrets as any).baseUrl || (providerId === 'zhipu' ? 'https://open.bigmodel.cn/api/paas/v4/' : undefined);

    const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });

    const res = await client.images.generate({
      model,
      prompt,
      size,
      // quality 字段在部分 OpenAI 兼容实现中存在
      quality
    } as any);

    emit('node:progress', { progress: 70, message: '解析图片生成结果...' });

    const url = (res as any)?.data?.[0]?.url;
    if (!url) {
      throw new Error('图片生成失败：未返回图片 URL');
    }

    emit('node:progress', { progress: 100, message: '图片生成完成' });

    return {
      image: url,
      imageUrl: url
    };
  }
};
