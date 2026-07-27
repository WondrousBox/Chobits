import { NodeConfig, NodeHandler, PortSchema } from '../types';

const defaultInputs: PortSchema[] = [{ key: 'result', label: '结果', type: 'any', required: false, description: '最终要返回的结果对象或值' }];

export const EndNode: NodeHandler = {
  spec: {
    id: 'core/end',
    label: '结束',
    category: 'Core',
    description: '工作流结束节点，汇总并输出最终结果',
    backgroundColor: '#ef4444',
    icon: 'TbSquare',
    inputs: defaultInputs,
    outputs: [],
    config: [
      {
        key: 'inputs',
        label: '结果端口',
        type: 'array',
        inputType: 'port-list',
        default: [{ key: 'result', label: '结果' }],
        description: '为需要汇总的多个结果配置独立端口'
      }
    ],
    hasDynamicInputs: true
  },
  getInputs(config?: NodeConfig): PortSchema[] {
    const inputs = Array.isArray(config?.inputs) && config.inputs.length > 0 ? config.inputs : defaultInputs;
    return inputs.map((input: any) => ({
      key: input.key,
      label: input.label || input.key,
      type: 'any',
      required: Boolean(input.required)
    }));
  },
  async run({ input }) {
    return { ...input };
  }
};
