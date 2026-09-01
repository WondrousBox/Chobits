import fs from 'node:fs';

import type { NodeHandler } from '@chobits/workflow';

// 图片展示节点：用于在工作流节点中预览图片
export const DisplayImageNode: NodeHandler = {
  spec: {
    id: 'ui/display-image',
    label: '图片展示',
    category: 'Display',
    description: '展示上游节点输出的图片（文件路径或 URL）',
    backgroundColor: '#f7b947',
    icon: 'TbPhoto',
    inputs: [{ key: 'image', label: '图片路径或 URL', type: ['file', 'string'], required: true, description: '本地文件路径或网络 URL' }],
    // 展示节点尽量保持简单，这里不提供额外配置
    config: [],
    outputs: [{ key: 'image', label: '图片', type: ['file', 'string'] }]
  },
  async run({ input }) {
    const raw = input.image;
    if (!raw) throw new Error('缺少图片输入');
    const image = String(raw);
    // 对于本地文件，可做一次存在性检查，但不过度失败整个工作流
    if (image && !/^https?:\/\//i.test(image)) {
      try {
        if (!fs.existsSync(image)) throw new Error(`图片不存在: ${image}`);
      } catch {
        // 忽略检查错误，由前端决定如何处理
      }
    }
    return { image };
  }
};
