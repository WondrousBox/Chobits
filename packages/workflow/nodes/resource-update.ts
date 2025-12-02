import { NodeHandler } from '../types';

/**
 * 资源更新节点
 * - 输入 resourceId + 文本内容
 * - 根据配置决定写入 contentText 或 description，支持 overwrite / append
 * - 不直接访问数据库，仅通过 emit('resource:update-request', ...) 通知主进程适配层
 */
export const ResourceUpdateNode: NodeHandler = {
  spec: {
    id: 'resource/update',
    label: '更新资源',
    category: 'Resource',
    description: '将上游节点输出写回资源表（例如图片理解结果写入 contentText）',
    inputs: [
      {
        key: 'resourceId',
        label: '资源 ID',
        type: 'string',
        required: true,
        description: '要更新的资源主键 ID（resources.id）'
      },
      {
        key: 'text',
        label: '文本内容',
        type: 'string',
        required: false,
        description: '要写入资源的文本内容（例如图片理解结果）'
      }
    ],
    configGroups: {
      basic: { label: '基础配置', defaultExpanded: true },
      advanced: { label: '高级选项', defaultExpanded: false }
    },
    config: [
      {
        key: 'targetField',
        label: '写入字段',
        type: 'string',
        required: true,
        default: 'contentText',
        description: '选择要写入资源表的字段',
        inputType: 'select',
        options: [
          { value: 'contentText', label: '正文内容（contentText）' },
          { value: 'description', label: '描述（description）' }
        ],
        group: 'basic'
      },
      {
        key: 'mode',
        label: '写入模式',
        type: 'string',
        required: true,
        default: 'overwrite',
        description: '覆盖原内容，或以换行形式追加到原内容之后',
        inputType: 'select',
        options: [
          { value: 'overwrite', label: '覆盖（overwrite）' },
          { value: 'append', label: '追加（append）' }
        ],
        group: 'basic'
      },
      {
        key: 'appendSeparator',
        label: '追加分隔符',
        type: 'string',
        required: false,
        default: '\n\n',
        description: '当模式为追加时，原内容与新内容之间使用的分隔符',
        inputType: 'text',
        group: 'advanced'
      }
    ],
    outputs: [
      { key: 'resourceId', label: '资源 ID', type: 'string' },
      { key: 'updated', label: '是否已提交更新请求', type: 'boolean' },
      { key: 'updatedFields', label: '请求更新的字段列表', type: 'array' }
    ]
  },
  async run({ input, config, emit }) {
    const resourceId = String(input.resourceId || '').trim();
    if (!resourceId) throw new Error('缺少 resourceId');

    const text = typeof input.text === 'string' ? input.text : '';
    if (!text) {
      // 没有文本时可以选择直接跳过，也可以仅更新其它字段；此处简单提示
      throw new Error('缺少要写入的文本内容（text）');
    }

    const targetField = String(config?.targetField || 'contentText');
    const mode = (config?.mode as string) || 'overwrite';
    const appendSeparator = typeof config?.appendSeparator === 'string' ? config.appendSeparator : '\n\n';

    const patch: Record<string, any> = {};
    if (targetField === 'contentText') {
      patch.contentText = text;
    } else if (targetField === 'description') {
      patch.description = text;
    } else {
      throw new Error(`不支持的写入字段: ${targetField}`);
    }

    const updatedFields = Object.keys(patch);

    // 通过事件通知主进程适配层进行实际 DB 更新
    emit('resource:update-request', {
      resourceId,
      patch,
      mode,
      appendSeparator
    });

    return { resourceId, updated: true, updatedFields };
  }
};
