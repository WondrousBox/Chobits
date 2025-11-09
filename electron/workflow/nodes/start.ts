import { NodeHandler } from '../types';

export const StartNode: NodeHandler = {
  spec: {
    id: 'core/start',
    label: '开始',
    category: 'Core',
    description: '工作流开始节点，输出初始输入',
    inputs: [],
    outputs: [{ key: 'payload', label: '初始输入', type: 'any', description: '从触发器传入的初始数据' }]
  },
  async run({ input }) {
    // input at start node is the initial payload supplied to engine
    return { payload: input };
  }
};
