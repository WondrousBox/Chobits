import { NodeConfig, NodeHandler, PortSchema } from '../types';
import { buildWorkflowAiUsageContext, executeWorkflowImageGenerationRequest, getDynamicModelConfig, getWorkflowProviderPresetId } from './ai-workflow-utils';

async function getDynamicConfig(providerId?: string, providerPresetId?: string): Promise<PortSchema[]> {
  const config = await getDynamicModelConfig({
    emptyModelDescription: providerId ? `服务商 ${providerId} 暂不支持图片生成模型` : '请先选择服务商',
    modelDescription: '选择图片生成模型',
    modelLabel: '模型',
    modelPredicate: (model) => model.type === 'image' && Boolean(model.capabilities?.image_generation),
    providerCapability: 'imageGeneration',
    providerId,
    providerPresetId,
    required: true,
    warningScope: 'image-generate'
  });

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
    config: [],
    outputs: [
      { key: 'image', label: '图片', type: ['file', 'string'], description: '生成图片的 URL 或本地路径，可直接连接到图片展示节点' },
      { key: 'imageUrl', label: '图片 URL', type: 'string', description: '生成图片的 URL（同 image 输出）' }
    ]
  },
  async getConfig(config?: NodeConfig): Promise<PortSchema[]> {
    const providerId = config?.providerId as string | undefined;
    const providerPresetId = getWorkflowProviderPresetId(config);
    return getDynamicConfig(providerId, providerPresetId);
  },
  async run({ input, config, ctx, emit }) {
    const prompt = String(input.prompt || '').trim();
    if (!prompt) throw new Error('缺少提示词');

    const providerId = String(config?.providerId || 'zhipu');
    const providerPresetId = getWorkflowProviderPresetId(config);
    const model = String(config?.model || 'cogview-3-flash');
    const size = String(config?.size || '1024x1024');
    const quality = String(config?.quality || 'standard');

    emit('node:progress', { progress: 10, message: '准备调用图片生成服务...' });

    emit('node:progress', { progress: 30, message: '调用图片生成服务...' });

    const { imageUrl } = await executeWorkflowImageGenerationRequest({
      emit,
      providerPresetId,
      providerId,
      model,
      prompt,
      quality,
      signal: ctx.signal,
      size,
      workflowAiUsage: buildWorkflowAiUsageContext(ctx, {
        nodeLabel: '图像生成',
        nodeType: 'image/image-generate',
        operationKey: 'generate_image',
        usageStage: 'generate'
      })
    });
    emit('node:progress', { progress: 70, message: '解析图片生成结果...' });

    emit('node:progress', { progress: 100, message: '图片生成完成' });

    return {
      image: imageUrl,
      imageUrl
    };
  }
};
