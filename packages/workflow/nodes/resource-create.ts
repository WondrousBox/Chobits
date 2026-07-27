import * as fs from 'fs';
import * as path from 'path';

import { NodeHandler } from '../types';

/**
 * 资源创建节点
 * - 输入文件对象、本地文件路径或URL，或者文本内容
 * - 如果是URL，会自动下载到资源存储文件夹
 * - 如果只有文本内容，会创建文本资源
 * - 系统会自动获取文件信息并补充字段（类型、大小、MIME等）
 * - 不直接访问数据库，仅通过 emit('resource:create-request', ...) 通知主进程适配层
 * - 输出创建后的完整资源对象
 */
export const ResourceCreateNode: NodeHandler = {
  spec: {
    id: 'resource/create',
    label: '新建资源',
    category: 'Resource',
    description: '通过文件对象、文件路径、URL或文本内容创建资源',
    backgroundColor: '#3b82f6',
    icon: 'TbFilePlus',
    inputs: [
      {
        key: 'file',
        label: '文件',
        type: ['file', 'string'],
        required: false,
        description: '文件对象、本地文件路径或URL（http/https）。如果不提供文件，可以只提供文本内容创建文本资源'
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
        description: '文本内容。如果不提供文件，可以只提供此字段创建文本资源'
      },
      {
        key: 'description',
        label: '描述',
        type: 'string',
        required: false,
        description: '资源描述'
      },
      {
        key: 'tags',
        label: '标签',
        type: 'string',
        required: false,
        description: '标签（JSON字符串数组）'
      },
      {
        key: 'parentResourceId',
        label: '父级资源 ID',
        type: 'string',
        required: false,
        description: '父级资源ID（用于记录资源来源关系）'
      }
    ],
    outputs: [
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
      { key: 'contentText', label: '内容文本', type: 'string' },
      { key: 'parentResourceId', label: '父级资源 ID', type: 'string', description: '父级资源ID（用于记录资源来源关系）' }
    ]
  },
  async run({ input, emit, ctx }) {
    // 获取文件路径或URL
    let filePath: string | undefined;
    let isUrl = false;
    let url: string | undefined;

    // 处理文件输入：可能是文件对象、文件路径字符串或URL
    if (input.file) {
      if (typeof input.file === 'string') {
        // 检查是否是URL
        const trimmed = input.file.trim();
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
          isUrl = true;
          url = trimmed;
        } else {
          // 字符串路径
          filePath = trimmed;
        }
      } else if (typeof input.file === 'object' && input.file !== null) {
        // 文件对象，尝试获取路径
        if ('filePath' in input.file) {
          filePath = String(input.file.filePath || '');
        } else if ('path' in input.file) {
          filePath = String(input.file.path || '');
        } else if ('url' in input.file) {
          const urlValue = String(input.file.url || '');
          if (urlValue.startsWith('http://') || urlValue.startsWith('https://')) {
            isUrl = true;
            url = urlValue;
          }
        } else if ('name' in input.file && 'data' in input.file) {
          // 如果是包含 data 的文件对象，需要先保存到临时文件
          // 这种情况应该由调用方处理，这里暂时不支持
          throw new Error('不支持直接传入文件数据，请先保存为文件路径');
        }
      }
    }

    // 检查是否有文件或文本内容
    const hasContentText = input.contentText !== undefined && input.contentText !== null && String(input.contentText).trim() !== '';

    if (!filePath && !url && !hasContentText) {
      throw new Error('缺少输入：需要提供文件对象、文件路径、URL或文本内容');
    }

    // 如果是URL，需要先下载到资源存储文件夹
    if (isUrl && url) {
      // 通过事件请求下载文件
      filePath = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('文件下载超时'));
        }, 300000); // 5分钟超时

        emit('resource:download-request', {
          url,
          workspaceId: ctx.workspaceId,
          folderId: ctx.folderId,
          callback: (downloadedPath: string | null, error?: string) => {
            clearTimeout(timeout);
            if (error || !downloadedPath) {
              reject(new Error(error || '文件下载失败'));
              return;
            }
            resolve(downloadedPath);
          }
        });
      });
    }

    // 从执行上下文中获取工作空间和文件夹信息
    if (!ctx.workspaceId) {
      throw new Error('工作流执行上下文缺少工作空间 ID (workspaceId)，请确保工作流是从资源页面启动的');
    }
    if (!ctx.folderId) {
      throw new Error('工作流执行上下文缺少文件夹 ID (folderId)，请确保工作流是从资源页面启动的');
    }

    // 如果只有文本内容，创建文本资源（不创建文件）
    if (!filePath && !url && hasContentText) {
      const contentText = String(input.contentText).trim();

      // 构建文本资源对象（不包含 filePath）
      const title = input.title !== undefined && input.title !== null ? String(input.title).trim() : '';
      const resourceData: Record<string, any> = {
        type: 'text',
        title: title || contentText.split('\n')[0].slice(0, 40) || '文本资源',
        contentText: contentText,
        // 根据 contentText 计算 sizeBytes
        sizeBytes: Buffer.from(contentText, 'utf8').byteLength,
        collectedAt: Date.now(),
        status: 'new',
        workspaceId: ctx.workspaceId,
        folderId: ctx.folderId
      };

      // 添加可选的 description、tags 和 parentResourceId
      if (input.description !== undefined && input.description !== null) {
        resourceData.description = String(input.description).trim();
      }
      if (input.tags !== undefined && input.tags !== null) {
        resourceData.tags = input.tags;
      }
      if (input.parentResourceId !== undefined && input.parentResourceId !== null) {
        resourceData.parentResourceId = String(input.parentResourceId).trim() || undefined;
      }

      // 通过事件通知主进程适配层进行实际 DB 创建
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('资源创建超时'));
        }, 10000);

        emit('resource:create-request', {
          resourceData,
          callback: (createdResource: any) => {
            clearTimeout(timeout);
            if (!createdResource) {
              reject(new Error('资源创建失败'));
              return;
            }
            resolve({
              resource: createdResource,
              resourceId: createdResource.id,
              path: createdResource.filePath,
              name: createdResource.title || '文本资源',
              ext: '',
              mime: 'text/plain',
              kind: 'text',
              contentText: createdResource.contentText,
              parentResourceId: createdResource.parentResourceId
            });
          }
        });
      });
    }

    // 如果有文件，处理文件资源
    if (!filePath) {
      throw new Error('无法获取文件路径');
    }

    // 验证文件是否存在
    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }

    // 获取工作空间信息以确定目标文件夹路径
    let finalFilePath = filePath;
    try {
      const workspaces = ctx.services?.workspaces;
      if (!workspaces) throw new Error('工作流工作空间查询服务未配置');
      const ws = await workspaces.getById(ctx.workspaceId);

      if (ws?.rootPath) {
        // 确定目标文件夹路径
        const targetDir = path.join(ws.rootPath, 'resources', 'folders', ctx.folderId);
        await fs.promises.mkdir(targetDir, { recursive: true });

        // 检查文件是否已经在目标文件夹中
        const targetFilePath = path.join(targetDir, path.basename(filePath));
        const isFileInTargetDir = path.resolve(filePath) === path.resolve(targetFilePath);

        if (!isFileInTargetDir) {
          // 文件不在目标文件夹中，需要复制
          let copyTargetPath = targetFilePath;

          // 处理同名文件
          if (fs.existsSync(copyTargetPath)) {
            const ext = path.extname(filePath);
            const nameNoExt = path.basename(filePath, ext);
            let counter = 1;
            while (fs.existsSync(copyTargetPath)) {
              copyTargetPath = path.join(targetDir, `${nameNoExt}(${counter})${ext}`);
              counter++;
            }
          }

          // 复制文件
          await fs.promises.copyFile(filePath, copyTargetPath);
          finalFilePath = copyTargetPath;

          // 复制字幕伴随文件（.segments.json）
          // 如果是字幕文件，检查是否存在同名的 .segments.json 并一起复制
          try {
            const ext = path.extname(filePath).toLowerCase();
            const subtitleExts = ['.srt', '.vtt', '.ass', '.ssa'];
            if (subtitleExts.includes(ext)) {
              const srcBase = path.basename(filePath, path.extname(filePath));
              const srcDir = path.dirname(filePath);
              const segmentsSource = path.join(srcDir, `${srcBase}.segments.json`);
              if (fs.existsSync(segmentsSource)) {
                const destBase = path.basename(copyTargetPath, path.extname(copyTargetPath));
                const segmentsTarget = path.join(targetDir, `${destBase}.segments.json`);
                await fs.promises.copyFile(segmentsSource, segmentsTarget);
                console.log('[resource-create] 已复制字幕伴随 segments 文件:', segmentsTarget);
              }
            }
          } catch (segErr) {
            console.warn('[resource-create] 复制伴随 segments 文件失败:', segErr);
          }
        } else {
          // 文件已经在目标文件夹中，直接使用
          finalFilePath = filePath;
        }
      }
    } catch (error) {
      // 如果获取工作空间或复制文件失败，记录警告但继续使用原始路径
      console.warn('[resource-create] Failed to copy file to target folder:', error);
      // 继续使用原始文件路径
    }

    // 获取文件基本信息（使用最终的文件路径）
    const stats = fs.statSync(finalFilePath);
    const filename = path.basename(finalFilePath);

    // 构建资源对象，只包含必要的字段
    // 其他字段（类型、MIME、大小等）由系统自动检测和补充
    const resourceData: Record<string, any> = {
      filePath: finalFilePath,
      title: input.title !== undefined && input.title !== null ? String(input.title).trim() : filename,
      sizeBytes: stats.size,
      collectedAt: Date.now(),
      status: 'new'
    };

    // 添加可选的 contentText、description、tags 和 parentResourceId
    if (input.contentText !== undefined && input.contentText !== null) {
      resourceData.contentText = String(input.contentText).trim();
    }
    if (input.description !== undefined && input.description !== null) {
      resourceData.description = String(input.description).trim();
    }
    if (input.tags !== undefined && input.tags !== null) {
      resourceData.tags = input.tags;
    }
    if (input.parentResourceId !== undefined && input.parentResourceId !== null) {
      resourceData.parentResourceId = String(input.parentResourceId).trim() || undefined;
    }

    // 如果是URL下载的，保存原始URL
    if (isUrl && url) {
      resourceData.url = url;
    }

    resourceData.workspaceId = ctx.workspaceId;
    resourceData.folderId = ctx.folderId;

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
          resolve({
            resource: createdResource,
            resourceId: createdResource.id,
            path: createdResource.filePath,
            name: createdResource.title || path.basename(createdResource.filePath || ''),
            ext: createdResource.ext || path.extname(createdResource.filePath || '').toLowerCase(),
            mime: createdResource.mimeType || 'application/octet-stream',
            kind: createdResource.type || 'file',
            contentText: createdResource.contentText,
            parentResourceId: createdResource.parentResourceId
          });
        }
      });
    });
  }
};
