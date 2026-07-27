import fs from 'node:fs';
import path from 'node:path';

import { NodeConfig, NodeHandler, PortSchema } from '../types';

type StartInputMode = 'resource' | 'text' | 'file' | 'url' | 'folder';

function detectType(ext: string): 'image' | 'video' | 'audio' | 'document' | 'other' {
  const e = ext.toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(e)) return 'image';
  if (['.mp4', '.webm', '.mov', '.mkv', '.ogv'].includes(e)) return 'video';
  if (['.mp3', '.wav', '.m4a', '.flac', '.opus', '.ogg'].includes(e)) return 'audio';
  if (['.pdf', '.doc', '.docx', '.md', '.txt', '.rtf'].includes(e)) return 'document';
  return 'other';
}

function guessMime(ext: string): string | undefined {
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    case '.bmp':
      return 'image/bmp';
    case '.ico':
      return 'image/x-icon';
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.ogg':
      return 'video/ogg';
    case '.mov':
      return 'video/quicktime';
    case '.mkv':
      return 'video/x-matroska';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.m4a':
      return 'audio/mp4';
    case '.flac':
      return 'audio/flac';
    case '.opus':
      return 'audio/ogg';
    case '.ogv':
      return 'video/ogg';
    case '.txt':
      return 'text/plain; charset=utf-8';
    case '.json':
      return 'application/json';
    case '.pdf':
      return 'application/pdf';
    default:
      return undefined;
  }
}

function getOutputsByMode(mode: StartInputMode): PortSchema[] {
  switch (mode) {
    case 'text':
      return [
        {
          key: 'text',
          label: '文本',
          type: 'string',
          description: '从触发器传入的文本内容'
        }
      ];
    case 'file':
      return [
        {
          key: 'file',
          label: '文件',
          type: 'file',
          description: '从触发器传入的文件资源'
        }
      ];
    case 'url':
      return [
        {
          key: 'url',
          label: '链接',
          type: 'string',
          description: '从触发器传入的链接地址'
        }
      ];
    case 'folder':
      return [
        {
          key: 'workspaceId',
          label: '工作空间 ID',
          type: 'string',
          description: '当前工作空间 ID'
        },
        {
          key: 'folderId',
          label: '文件夹 ID',
          type: 'string',
          description: '当前文件夹 ID'
        }
      ];
    case 'resource':
    default: {
      // 资源模式下，直接提供类似 resource/load 节点的输出端口
      return [
        {
          key: 'resource',
          label: '资源对象',
          type: 'any',
          description: '原始资源对象，兼容旧逻辑'
        },
        { key: 'resourceId', label: '资源 ID', type: 'string' },
        { key: 'path', label: '路径', type: 'file' },
        { key: 'name', label: '文件名', type: 'string' },
        { key: 'ext', label: '扩展名', type: 'string' },
        { key: 'mime', label: 'MIME', type: 'string' },
        { key: 'kind', label: '类型', type: 'string' },
        { key: 'contentText', label: '内容文本', type: 'string' }
      ];
    }
  }
}

export const StartNode: NodeHandler = {
  spec: {
    id: 'core/start',
    label: '开始',
    category: 'Core',
    description: '工作流开始节点，根据配置输出初始输入',
    backgroundColor: '#10b981',
    icon: 'TbPlayerPlay',
    // 静态输入定义：用于校验和默认展示；实际使用 getInputs 动态计算
    inputs: [],
    // 默认使用资源模式的输出定义，实际由 getOutputs 按配置计算
    outputs: getOutputsByMode('resource'),
    // 仅配置开始节点的输入模式
    config: [
      {
        key: 'inputMode',
        label: '数据来源',
        type: 'string',
        required: true,
        default: 'resource',
        description: '选择工作流开始时的数据来源',
        inputType: 'select',
        showInNode: true,
        options: [
          { value: 'resource', label: '资源（默认）' },
          { value: 'text', label: '输入文本' },
          { value: 'file', label: '选择文件' },
          { value: 'url', label: '网页链接' },
          { value: 'folder', label: '文件夹' }
        ]
      },
      {
        key: 'resourceKinds',
        label: '适用资源类型',
        type: 'array',
        description: '限定可以从哪些类型的资源启动该工作流；为空或包含 any 时表示不限',
        inputType: 'select-multiple',
        options: [
          { value: 'any', label: '不限（默认）' },
          { value: 'image', label: '图片' },
          { value: 'video', label: '视频' },
          { value: 'audio', label: '音频' },
          { value: 'document', label: '文档/文本' },
          { value: 'other', label: '其他' }
        ]
      }
    ]
  },
  // 根据配置动态返回输入端口定义
  getInputs(config?: NodeConfig): PortSchema[] {
    const mode = (config?.inputMode as StartInputMode) || 'resource';
    switch (mode) {
      case 'text':
        return [
          {
            key: 'text',
            label: '文本内容',
            type: 'string',
            description: '在单独运行工作流时，可以直接在开始节点上输入文本',
            inputType: 'textarea',
            group: 'runtime'
          }
        ];
      case 'file':
        return [
          {
            key: 'file',
            label: '文件路径',
            type: 'file',
            description: '在单独运行工作流时，可以在开始节点上指定文件路径',
            inputType: 'text',
            group: 'runtime'
          }
        ];
      case 'url':
        return [
          {
            key: 'url',
            label: '链接地址',
            type: 'string',
            description: '在单独运行工作流时，可以在开始节点上输入链接',
            inputType: 'text',
            group: 'runtime'
          }
        ];
      case 'folder':
        return [
          {
            key: 'folderId',
            label: '文件夹 ID',
            type: 'string',
            description: '在单独运行工作流时，可以在开始节点上指定文件夹 ID',
            inputType: 'text',
            group: 'runtime'
          }
        ];
      case 'resource':
      default:
        // 资源模式下不需要前驱节点输入，直接使用引擎传入的 initialInput
        return [];
    }
  },
  // 根据配置动态返回输出端口定义
  getOutputs(config?: NodeConfig): PortSchema[] {
    const mode = (config?.inputMode as StartInputMode) || 'resource';
    return getOutputsByMode(mode);
  },
  async run({ input, config, ctx, emit }) {
    // input 是工作流引擎传入的初始输入对象
    const mode: StartInputMode = (config?.inputMode as StartInputMode) || 'resource';

    switch (mode) {
      case 'text':
        return { text: (input as any).text };
      case 'file':
        return { file: (input as any).file };
      case 'url':
        return { url: (input as any).url };
      case 'folder': {
        // 文件夹模式下，从输入或上下文获取文件夹ID和工作空间ID
        const inputFolderId = (input as any).folderId;
        const inputWorkspaceId = (input as any).workspaceId;
        const folderId = inputFolderId || ctx.folderId;
        const workspaceId = inputWorkspaceId || ctx.workspaceId;

        if (!workspaceId) {
          throw new Error('工作流执行上下文缺少工作空间 ID (workspaceId)');
        }

        if (!folderId) {
          throw new Error('缺少文件夹 ID (folderId)，请在开始节点输入或确保工作流从文件夹上下文启动');
        }

        // 如果从输入获取到了 folderId 和 workspaceId，但上下文中没有，则通过事件更新上下文
        // 只有当输入中有值且上下文中没有时才更新
        if (inputFolderId && inputWorkspaceId && (!ctx.folderId || !ctx.workspaceId)) {
          emit('wf:update-context', {
            workspaceId,
            folderId
          });
        }

        return {
          workspaceId,
          folderId
        };
      }
      case 'resource':
      default: {
        // 兼容老行为：如果有 resource 字段就用，没有则把整个 input 当作资源透传
        let resource = 'resource' in (input as any) ? (input as any).resource : input;

        let resourceId = '';
        let inputFilePath = '';
        let contentText = '';

        if (typeof resource === 'string') {
          inputFilePath = String(resource || '');
        } else if (typeof resource === 'object' && resource) {
          if ('filePath' in resource) {
            inputFilePath = String((resource as any).filePath || '');
          }
          if ('id' in resource && (resource as any).id) {
            resourceId = String((resource as any).id || '');
          } else if ('resourceId' in resource && (resource as any).resourceId) {
            resourceId = String((resource as any).resourceId || '');
          }
          if ('contentText' in resource) {
            contentText = String((resource as any).contentText || '');
          }
        }

        // 如果有 ID，尝试从数据库获取完整资源信息
        if (resourceId && ctx.services?.resources) {
          try {
            const fullResource = await ctx.services.resources.getById(resourceId);
            if (fullResource) {
              resource = fullResource;
              if (fullResource.filePath) inputFilePath = fullResource.filePath;
              if (fullResource.contentText) contentText = fullResource.contentText;
            }
          } catch (e) {
            console.warn('[StartNode] Failed to fetch resource by id:', resourceId, e);
          }
        }

        if (inputFilePath && fs.existsSync(inputFilePath)) {
          const name = path.basename(inputFilePath);
          const ext = path.extname(inputFilePath).toLowerCase();
          const kind = detectType(ext);
          const m = guessMime(ext) || 'application/octet-stream';
          return { resource, resourceId, path: inputFilePath, name, ext, mime: m, kind, contentText };
        }

        // 如果拿不到文件路径，就只返回资源对象本身
        return { resource, contentText };
      }
    }
  }
};
