import { NodeConfig, NodeHandler, PortSchema } from '../types';
import { buildWorkflowAiUsageContext, executeWorkflowTextRequest, getDynamicModelConfig, getWorkflowProviderPresetId } from './ai-workflow-utils';

async function getDynamicConfig(providerId?: string, providerPresetId?: string): Promise<PortSchema[]> {
  return getDynamicModelConfig({
    emptyModelDescription: providerId ? `服务商 ${providerId} 暂不支持对话模型` : '请先选择服务商',
    modelDescription: '选择对话模型',
    modelLabel: '模型',
    modelPredicate: (model) => model.type === 'chat',
    providerId,
    providerPresetId,
    required: true,
    warningScope: 'ai-chat'
  });
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
    config: [],
    outputs: [{ key: 'response', label: '对话回复', type: 'string', description: 'AI返回的对话回复内容' }]
  },
  async getConfig(config?: NodeConfig): Promise<PortSchema[]> {
    const providerId = config?.providerId as string | undefined;
    const providerPresetId = getWorkflowProviderPresetId(config);
    return getDynamicConfig(providerId, providerPresetId);
  },
  async run({ input, config, ctx, emit }) {
    const message = String(input.message || '');
    if (!message) throw new Error('缺少对话内容');

    const providerId = String(config?.providerId || 'zhipu');
    const providerPresetId = getWorkflowProviderPresetId(config);
    const model = String(config?.model || 'glm-4-5-flash');

    emit('node:progress', { progress: 10, message: '准备调用AI服务...' });

    emit('node:progress', { progress: 30, message: '发送对话请求...' });

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
    const systemPrompt = input.systemPrompt ? String(input.systemPrompt).trim() : '';

    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt
      });
    }

    messages.push({
      role: 'user',
      content: message
    });

    const { text: responseText } = await executeWorkflowTextRequest({
      emit,
      messages,
      model,
      onDelta: (_delta, accumulatedText) => {
        emit('node:progress', { progress: 50, detail: accumulatedText });
      },
      providerId,
      providerPresetId,
      signal: ctx.signal,
      workflowAiUsage: buildWorkflowAiUsageContext(ctx, {
        nodeLabel: '大模型对话',
        nodeType: 'ai/chat',
        operationKey: 'chat',
        usageStage: 'generate'
      })
    });

    emit('node:progress', { progress: 90, message: '处理回复...' });

    if (!responseText) {
      throw new Error('AI服务返回空结果');
    }

    emit('node:progress', { progress: 100, message: '完成' });

    return {
      response: responseText
    };
  }
};
