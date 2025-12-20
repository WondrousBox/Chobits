import fs from 'node:fs';
import path from 'node:path';

import type { ChatMessage } from '@packages/ai/types';

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

// 动态获取指定服务商的视觉模型列表
async function getVisionModels(providerId: string): Promise<{ value: string; label: string }[]> {
  try {
    // 根据服务商 ID 动态构建模型配置文件路径
    const modelsPath = path.join(process.env.APP_ROOT || process.cwd(), 'resources', 'providers', `${providerId}.models.json`);

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

    // 如果配置文件不存在，返回空数组
    return [];
  } catch (error) {
    // 如果读取失败，返回空数组
    console.warn(`[image-understand] Failed to load vision models for provider ${providerId}:`, error);
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
    const models = await getVisionModels(providerId);
    if (models.length > 0) {
      config.push({
        key: 'model',
        label: '模型',
        type: 'string',
        required: true,
        default: models[0]?.value || '',
        description: '选择视觉理解模型',
        inputType: 'select',
        options: models
      });
    } else {
      // 如果该服务商没有视觉模型，显示提示
      config.push({
        key: 'model',
        label: '模型',
        type: 'string',
        required: true,
        default: '',
        description: `服务商 ${providerId} 暂不支持视觉模型`,
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
    id: 'image/image-understand',
    label: '图片理解',
    category: 'Image',
    description: '通过 AI 视觉模型分析图片，提取文本内容、生成描述和标签',
    backgroundColor: '#ec4899',
    icon: 'TbPhoto',
    inputs: [{ key: 'image', label: '图片路径', type: ['file', 'string'], required: true }],
    // 静态配置作为默认值，实际配置通过 getConfig 动态获取
    config: [],
    outputs: [
      { key: 'contentText', label: '文本内容', type: 'string', description: '图片中的文本内容，如果不存在文本内容则返回空字符串' },
      { key: 'description', label: '描述', type: 'string', description: '文本内容的总结或画面的分析总结' },
      { key: 'tags', label: '标签', type: 'array', description: '标签数组，包含分类标签和其他相关标签' }
    ]
  },
  // 动态获取配置，根据当前配置值返回相应的选项
  async getConfig(config?: NodeConfig): Promise<PortSchema[]> {
    const providerId = config?.providerId as string | undefined;
    return getDynamicConfig(providerId);
  },
  async run({ input, config, emit }) {
    const imagePath = String(input.image || '');
    if (!imagePath) throw new Error('缺少图片路径');
    if (!fs.existsSync(imagePath)) throw new Error(`图片不存在: ${imagePath}`);

    const providerId = String(config?.providerId || 'zhipu');
    const model = String(config?.model || 'glm-4v-flash');

    emit('node:progress', { progress: 10, message: '读取图片...' });

    // 将图片转换为base64
    const imageBase64 = imageToBase64(imagePath);

    emit('node:progress', { progress: 30, message: '调用AI服务...' });

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

    emit('node:progress', { progress: 50, message: '分析图片内容...' });

    // 构建详细的提示词，要求AI返回JSON格式
    const prompt = `请仔细分析这张图片，并返回一个JSON格式的结果。要求如下：

1. **文本提取**：如果图片中包含文本内容（如文档、截图、书籍、海报等），请完整提取所有可见的文本内容。如果图片中没有文本或文本很少，则返回空字符串。

2. **内容分析**：分析图片的主要内容，可能是：
   - 景物（自然风景、建筑、物品等）
   - 人物（肖像、合影、生活场景等）
   - 文本内容（文档、书籍、截图、海报等）
   - 学习相关（教材、笔记、课程、教育等）
   - 工作相关（办公场景、会议、文档、工具等）
   - 其他类型

3. **描述生成**：
   - 如果图片中有大量文本内容，请总结文本的核心内容和主题
   - 如果图片中没有文本或文本很少，请分析画面内容并生成一个简短的描述（50-100字）

4. **标签生成**：
   - 首先根据内容判断分类（如：学习、工作、生活、娱乐、自然、人物、文本等），分类作为第一个标签
   - 然后根据文本内容或画面内容，提取3-8个相关的关键词作为标签（如：技术、设计、美食、旅行、教育、办公等）
   - 标签应该是简洁的中文词汇或短语

请严格按照以下JSON格式返回结果，不要包含任何其他文字说明：
{
  "contentText": "提取的文本内容，没有就不返回文本内容",
  "description": "简短的描述总结",
  "tags": ["分类标签", "标签1", "标签2", "标签3"]
}`;

    // 构建消息，使用OpenAI兼容的格式
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
        messages: messages as unknown as ChatMessage[],
        providerId,
        extras: {
          model,
          secrets
        }
      },
      undefined, // 不使用流式输出
      undefined // 不使用AbortSignal
    );

    emit('node:progress', { progress: 90, message: '解析结果...' });

    const resultText = response.message?.content || '';

    if (!resultText) {
      throw new Error('AI服务返回空结果');
    }

    // 尝试从返回的文本中提取JSON
    let jsonResult: { contentText: string; description: string; tags: string[] };

    try {
      // 先尝试直接解析JSON
      jsonResult = JSON.parse(resultText);
    } catch {
      try {
        // 如果直接解析失败，尝试从markdown代码块中提取
        const codeBlockMatch = resultText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (codeBlockMatch) {
          jsonResult = JSON.parse(codeBlockMatch[1]);
        } else {
          // 尝试从文本中提取JSON对象
          const jsonMatch = resultText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            jsonResult = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('无法提取JSON');
          }
        }
      } catch {
        // 如果完全无法提取JSON，使用默认值
        jsonResult = {
          contentText: '',
          description: resultText.trim(),
          tags: []
        };
      }
    }

    // 验证和规范化结果
    // 兼容处理：如果AI返回的是旧的 "content" 字段，也支持
    const contentText = typeof jsonResult.contentText === 'string' ? jsonResult.contentText.trim() : typeof (jsonResult as any).content === 'string' ? (jsonResult as any).content.trim() : '';
    const description = typeof jsonResult.description === 'string' ? jsonResult.description.trim() : '';
    const tags = Array.isArray(jsonResult.tags) ? jsonResult.tags.filter((tag) => typeof tag === 'string' && tag.trim()) : [];

    // 如果description为空，使用原始文本作为fallback
    const finalDescription = description || resultText.trim().substring(0, 200);

    emit('node:progress', { progress: 100, message: '完成' });

    return {
      contentText,
      description: finalDescription,
      tags
    };
  }
};
