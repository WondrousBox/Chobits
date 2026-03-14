import fs from 'node:fs';

import { NodeConfig, NodeHandler, PortSchema } from '../types';
import { executeWorkflowChatRequest, getDynamicModelConfig, readImageAsRichContent } from './ai-workflow-utils';

async function getDynamicConfig(providerId?: string, providerInstanceId?: string): Promise<PortSchema[]> {
  return getDynamicModelConfig({
    emptyModelDescription: providerId ? `服务商 ${providerId} 暂不支持视觉模型` : '请先选择服务商',
    modelDescription: '选择视觉理解模型',
    modelLabel: '模型',
    modelPredicate: (model) => model.type === 'vision' && Boolean(model.capabilities?.vision),
    providerId,
    providerInstanceId,
    required: true,
    warningScope: 'image-understand'
  });
}

function parseImageUnderstandResult(resultText: string): { contentText: string; description: string; tags: string[] } {
  let jsonResult: { contentText?: string; content?: string; description?: string; tags?: string[] };

  try {
    jsonResult = JSON.parse(resultText);
  } catch {
    try {
      const codeBlockMatch = resultText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        jsonResult = JSON.parse(codeBlockMatch[1]);
      } else {
        const jsonMatch = resultText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonResult = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('无法提取JSON');
        }
      }
    } catch {
      jsonResult = {
        contentText: '',
        description: resultText.trim(),
        tags: []
      };
    }
  }

  const contentText = typeof jsonResult.contentText === 'string' ? jsonResult.contentText.trim() : typeof jsonResult.content === 'string' ? jsonResult.content.trim() : '';
  const description = typeof jsonResult.description === 'string' ? jsonResult.description.trim() : '';
  const tags = Array.isArray(jsonResult.tags) ? jsonResult.tags.filter((tag) => typeof tag === 'string' && tag.trim()) : [];

  return {
    contentText,
    description: description || resultText.trim().substring(0, 200),
    tags
  };
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
    config: [],
    outputs: [
      { key: 'contentText', label: '文本内容', type: 'string', description: '图片中的文本内容，如果不存在文本内容则返回空字符串' },
      { key: 'description', label: '描述', type: 'string', description: '文本内容的总结或画面的分析总结' },
      { key: 'tags', label: '标签', type: 'array', description: '标签数组，包含分类标签和其他相关标签' }
    ]
  },
  async getConfig(config?: NodeConfig): Promise<PortSchema[]> {
    const providerId = config?.providerId as string | undefined;
    const providerInstanceId = config?.providerInstanceId as string | undefined;
    return getDynamicConfig(providerId, providerInstanceId);
  },
  async run({ input, config, emit }) {
    const imagePath = String(input.image || '');
    if (!imagePath) throw new Error('缺少图片路径');
    if (!fs.existsSync(imagePath)) throw new Error(`图片不存在: ${imagePath}`);

    const providerId = String(config?.providerId || 'zhipu');
    const providerInstanceId = config?.providerInstanceId ? String(config.providerInstanceId) : undefined;
    const model = String(config?.model || 'glm-4v-flash');

    emit('node:progress', { progress: 10, message: '读取图片...' });

    const imageContent = readImageAsRichContent(imagePath);

    emit('node:progress', { progress: 30, message: '调用AI服务...' });

    emit('node:progress', { progress: 50, message: '分析图片内容...' });

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

    const { text: resultText } = await executeWorkflowChatRequest({
      emit,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            },
            imageContent
          ]
        }
      ],
      model,
      providerId,
      providerInstanceId
    });

    emit('node:progress', { progress: 90, message: '解析结果...' });

    if (!resultText) {
      throw new Error('AI服务返回空结果');
    }

    const parsed = parseImageUnderstandResult(resultText);

    emit('node:progress', { progress: 100, message: '完成' });

    return parsed;
  }
};
