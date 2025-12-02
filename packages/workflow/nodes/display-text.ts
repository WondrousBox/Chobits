import { NodeHandler } from '../types';

// 文本展示节点：用于在工作流节点中直观展示文本结果
export const DisplayTextNode: NodeHandler = {
  spec: {
    id: 'ui/display-text',
    label: '文本展示',
    category: 'Display',
    description: '展示上游节点输出的文本内容（如大模型结果）',
    inputs: [{ key: 'text', label: '文本', type: 'string', required: true, description: '要展示的文本内容' }],
    config: [],
    outputs: [{ key: 'text', label: '文本', type: 'string' }]
  },
  async run({ input }) {
    const text = String(input.text ?? '');
    return { text };
  }
};
