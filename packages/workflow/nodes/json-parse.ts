import type { NodeHandler } from '../types.js';

export const JsonParseNode: NodeHandler = {
  spec: {
    id: 'data/json-parse',
    label: 'JSON 反序列化',
    category: 'Data',
    description: '将 JSON 字符串转换为数据对象',
    backgroundColor: '#607d8b',
    icon: 'TbJson',
    inputs: [
      {
        key: 'input',
        label: 'JSON 字符串',
        type: 'string',
        required: true,
        description: '要解析的 JSON 字符串'
      }
    ],
    outputs: [
      {
        key: 'output',
        label: '数据',
        type: 'any',
        description: '解析后的数据对象'
      }
    ]
  },
  async run({ input }) {
    const jsonStr = input.input;

    if (typeof jsonStr !== 'string') {
      // If it's already an object, just return it (lenient mode)
      if (typeof jsonStr === 'object' && jsonStr !== null) {
        return { data: jsonStr };
      }
      throw new Error('Input is not a string');
    }

    try {
      const output = JSON.parse(jsonStr);
      return { output };
    } catch (err: any) {
      throw new Error(`JSON parse failed: ${err.message}`);
    }
  }
};
