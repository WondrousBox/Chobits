import { NodeHandler } from '../types';

export const EndNode: NodeHandler = {
  spec: {
    id: 'core/end',
    label: '结束',
    category: 'Core',
    description: '工作流结束节点，汇总并输出最终结果',
    backgroundColor: '#ef4444',
    icon: 'TbSquare',
    inputs: [{ key: 'result', label: '结果', type: 'any', required: false, description: '最终要返回的结果对象或值' }],
    outputs: []
  },
  async run({ input }) {
    return { ...input };
  }
};
