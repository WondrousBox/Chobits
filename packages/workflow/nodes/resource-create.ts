import { NodeHandler } from '../types';

/**
 * 资源创建节点
 * - 输入资源类型和所有可创建的资源字段
 * - 不直接访问数据库，仅通过 emit('resource:create-request', ...) 通知主进程适配层
 * - 输出创建后的完整资源对象
 */
export const ResourceCreateNode: NodeHandler = {
  spec: {
    id: 'resource/create',
    label: '新建资源',
    category: 'Resource',
    description: '创建一个新的资源，返回创建后的完整资源对象',
    inputs: [
      {
        key: 'type',
        label: '资源类型',
        type: 'string',
        required: true,
        description: '资源类型：image, video, audio, text, link, file, document, other'
      },
      {
        key: 'title',
        label: '标题',
        type: 'string',
        required: false,
        description: '资源标题'
      },
      {
        key: 'contentText',
        label: '正文内容',
        type: 'string',
        required: false,
        description: '提取的纯文本内容'
      },
      {
        key: 'description',
        label: '描述',
        type: 'string',
        required: false,
        description: '资源描述'
      },
      {
        key: 'url',
        label: 'URL',
        type: 'string',
        required: false,
        description: '原始资源URL'
      },
      {
        key: 'domain',
        label: '域名',
        type: 'string',
        required: false,
        description: '资源域名'
      },
      {
        key: 'sourceName',
        label: '来源名称',
        type: 'string',
        required: false,
        description: '来源名称'
      },
      {
        key: 'authorName',
        label: '作者名称',
        type: 'string',
        required: false,
        description: '作者/发布者名称'
      },
      {
        key: 'language',
        label: '语言',
        type: 'string',
        required: false,
        description: '资源语言'
      },
      {
        key: 'mimeType',
        label: 'MIME 类型',
        type: 'string',
        required: false,
        description: '媒体类型'
      },
      {
        key: 'sizeBytes',
        label: '文件大小（字节）',
        type: 'number',
        required: false,
        description: '文件大小（字节）'
      },
      {
        key: 'durationMs',
        label: '时长（毫秒）',
        type: 'number',
        required: false,
        description: '时长（毫秒，音视频）'
      },
      {
        key: 'width',
        label: '宽度（像素）',
        type: 'number',
        required: false,
        description: '媒体宽度（像素）'
      },
      {
        key: 'height',
        label: '高度（像素）',
        type: 'number',
        required: false,
        description: '媒体高度（像素）'
      },
      {
        key: 'filePath',
        label: '文件路径',
        type: 'string',
        required: false,
        description: '本地缓存路径'
      },
      {
        key: 'thumbnailPath',
        label: '缩略图路径',
        type: 'string',
        required: false,
        description: '缩略图文件路径'
      },
      {
        key: 'previewUrl',
        label: '预览URL',
        type: 'string',
        required: false,
        description: '远程预览图/视频等'
      },
      {
        key: 'tags',
        label: '标签',
        type: 'string',
        required: false,
        description: '标签（JSON字符串数组）'
      },
      {
        key: 'categories',
        label: '分类',
        type: 'string',
        required: false,
        description: '分类（JSON字符串数组）'
      },
      {
        key: 'visibility',
        label: '可见性',
        type: 'string',
        required: false,
        description: '可见性：private, unlisted, public'
      },
      {
        key: 'nsfw',
        label: 'NSFW',
        type: 'number',
        required: false,
        description: '是否涉黄（0/1）'
      },
      {
        key: 'favorite',
        label: '收藏',
        type: 'number',
        required: false,
        description: '是否收藏（0/1）'
      },
      {
        key: 'rating',
        label: '评分',
        type: 'number',
        required: false,
        description: '用户评分'
      },
      {
        key: 'status',
        label: '状态',
        type: 'string',
        required: false,
        description: '状态：new, processing, ready, archived, error'
      },
      {
        key: 'collectedAt',
        label: '收集时间',
        type: 'number',
        required: false,
        description: '用户收集时间（毫秒时间戳）'
      },
      {
        key: 'publishedAt',
        label: '发布时间',
        type: 'number',
        required: false,
        description: '来源发布时间（毫秒时间戳）'
      },
      {
        key: 'metadata',
        label: '元数据',
        type: 'string',
        required: false,
        description: '额外元数据（JSON字符串）'
      },
      {
        key: 'workspaceId',
        label: '工作空间 ID',
        type: 'string',
        required: false,
        description: '归属工作空间'
      },
      {
        key: 'folderId',
        label: '文件夹 ID',
        type: 'string',
        required: false,
        description: '归属文件夹（可为空，表示在根目录）'
      }
    ],
    outputs: [{ key: 'resource', label: '创建的资源', type: 'resource', description: '创建后的完整资源对象' }]
  },
  async run({ input, emit }) {
    const type = String(input.type || '').trim();
    if (!type) throw new Error('缺少资源类型 type');

    // 验证资源类型是否有效
    const validTypes = ['image', 'video', 'audio', 'text', 'link', 'file', 'document', 'other'];
    if (!validTypes.includes(type)) {
      throw new Error(`无效的资源类型: ${type}，有效类型为: ${validTypes.join(', ')}`);
    }

    // 构建资源对象，只包含提供的字段
    const resourceData: Record<string, any> = {
      type
    };

    // 可创建的字段列表
    const creatableFields = [
      'title',
      'description',
      'url',
      'domain',
      'sourceName',
      'authorName',
      'language',
      'mimeType',
      'sizeBytes',
      'durationMs',
      'width',
      'height',
      'filePath',
      'contentText',
      'thumbnailPath',
      'previewUrl',
      'tags',
      'categories',
      'visibility',
      'nsfw',
      'favorite',
      'rating',
      'status',
      'collectedAt',
      'publishedAt',
      'metadata',
      'workspaceId',
      'folderId'
    ];

    for (const field of creatableFields) {
      if (input[field] !== undefined && input[field] !== null) {
        resourceData[field] = input[field];
      }
    }

    // 设置默认时间戳
    const now = Date.now();
    if (!resourceData.collectedAt) {
      resourceData.collectedAt = now;
    }
    if (!resourceData.status) {
      resourceData.status = 'new';
    }

    // 通过事件通知主进程适配层进行实际 DB 创建
    // 使用 Promise 等待创建完成并获取创建后的资源
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('资源创建超时'));
      }, 10000);

      // 发送创建请求，通过回调获取创建后的资源
      emit('resource:create-request', {
        resourceData,
        callback: (createdResource: any) => {
          clearTimeout(timeout);
          if (!createdResource) {
            reject(new Error('资源创建失败'));
            return;
          }
          resolve({ resource: createdResource });
        }
      });
    });
  }
};
