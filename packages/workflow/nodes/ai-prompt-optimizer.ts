import { NodeConfig, NodeHandler, PortSchema } from '../types';
import { executeWorkflowTextRequest, getDynamicModelConfig } from './ai-workflow-utils';

async function getDynamicConfig(providerId?: string, providerInstanceId?: string): Promise<PortSchema[]> {
  return getDynamicModelConfig({
    defaultProviderId: 'zhipu',
    emptyModelDescription: providerId ? `服务商 ${providerId} 暂不支持对话模型` : '请先选择服务商',
    modelDescription: '选择对话模型',
    modelLabel: '模型',
    modelPredicate: (model) => model.type === 'chat',
    providerId,
    providerInstanceId,
    required: false,
    warningScope: 'ai-prompt-optimizer'
  });
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
  async getConfig(config?: NodeConfig): Promise<PortSchema[]> {
    const providerId = config?.providerId as string | undefined;
    const providerInstanceId = config?.providerInstanceId as string | undefined;
    return getDynamicConfig(providerId, providerInstanceId);
  },
  async run({ input, config, emit }) {
    const prompt = String(input.prompt || '').trim();
    if (!prompt) throw new Error('缺少原始提示词');

    const providerId = String(config?.providerId || 'zhipu');
    const providerInstanceId = config?.providerInstanceId ? String(config.providerInstanceId) : undefined;
    const model = String(config?.model || '');
    const optimizationGoal = input.optimizationGoal ? String(input.optimizationGoal).trim() : '';

    emit('node:progress', { progress: 10, message: '准备调用AI服务...' });

    emit('node:progress', { progress: 30, message: '发送优化请求...' });

    const systemPrompt = `你是一个专业的提示词优化专家。你的任务是优化用户提供的提示词，使其更加清晰、具体、有效。

优化原则：
1. 保持原意的同时，使表达更加清晰明确
2. 添加必要的上下文信息
3. 使用更准确的专业术语
4. 确保提示词结构完整、逻辑清晰
5. 如果用户指定了优化目标，请重点考虑该目标

请直接返回优化后的提示词，不要添加任何解释或说明文字。`;

    let userMessage = `请优化以下提示词：\n\n${prompt}`;
    if (optimizationGoal) {
      userMessage += `\n\n优化目标：${optimizationGoal}`;
    }

    const { text: optimizedPrompt } = await executeWorkflowTextRequest({
      emit,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: userMessage
        }
      ],
      model,
      providerId,
      providerInstanceId
    });

    emit('node:progress', { progress: 90, message: '处理优化结果...' });

    if (!optimizedPrompt) {
      throw new Error('AI服务返回空结果');
    }

    emit('node:progress', { progress: 100, message: '完成' });

    return {
      optimizedPrompt: optimizedPrompt.trim()
    };
  }
};
