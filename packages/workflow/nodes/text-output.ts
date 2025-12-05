import { NodeHandler } from '../types';

/**
 * 文本输出节点
 * - 不接受输入，文本内容存储在配置中
 * - 直接输出配置中的文本内容
 */
export const TextOutputNode: NodeHandler = {
  spec: {
    id: 'core/text-output',
    label: '文本输出',
    category: 'Core',
    description: '输出配置中的文本内容，不接受输入',
    backgroundColor: '#10b981',
    icon: 'TbText',
    inputs: [],
    config: [
      {
        key: 'text',
        label: '文本内容',
        type: 'string',
        required: false,
        default: '',
        description: '要输出的文本内容',
        inputType: 'textarea',
        showInNode: true
      }
    ],
    outputs: [
      {
        key: 'text',
        label: '文本',
        type: 'string',
        description: '输出的文本内容'
      }
    ]
  },
  async run({ config }) {
    const text = String(config?.text || '');
    return { text };
  }
};
