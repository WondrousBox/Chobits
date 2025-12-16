import { NodeHandler } from '../types';

export const JsonStringifyNode: NodeHandler = {
  spec: {
    id: 'data/json-stringify',
    label: 'JSON 序列化',
    category: 'Data',
    description: '将数据转换为 JSON 字符串',
    backgroundColor: '#607d8b',
    icon: 'TbJson',
    inputs: [
      {
        key: 'input',
        label: '数据',
        type: 'any',
        required: true,
        description: '要序列化的数据'
      }
    ],
    config: [
      {
        key: 'space',
        label: '缩进空格数',
        type: 'number',
        default: 2,
        description: 'JSON 字符串的缩进空格数 (0-8)',
        inputType: 'number'
      }
    ],
    outputs: [
      {
        key: 'output',
        label: 'JSON 字符串',
        type: 'string',
        description: '序列化后的 JSON 字符串'
      }
    ]
  },
  async run({ input, config }) {
    const data = input.input;
    const space = Math.max(0, Math.min(8, Number(config?.space ?? 2)));

    try {
      const output = JSON.stringify(data, null, space);
      return { output };
    } catch (err: any) {
      throw new Error(`JSON serialization failed: ${err.message}`);
    }
  }
};
