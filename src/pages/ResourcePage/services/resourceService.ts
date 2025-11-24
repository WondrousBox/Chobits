/**
 * 资源服务：处理拖拽/选择文件并写入资源库
 */
// import { Resource } from 'electron/preload/apis/resource';
export type Resource = {
  id: string;
  type: 'image' | 'video' | 'audio' | 'text' | 'link' | 'file' | 'document' | 'other';
  workspaceId?: string;
  title?: string;
  description?: string;
  url?: string;
  domain?: string;
  sourceName?: string;
  authorName?: string;
  language?: string;
  mimeType?: string;
  sizeBytes?: number;
  durationMs?: number;
  width?: number;
  height?: number;
  filePath?: string;
  contentText?: string;
  thumbnail?: ArrayBuffer | Uint8Array;
  thumbnailPath?: string;
  previewUrl?: string;
  tags?: string; // JSON string
  categories?: string; // JSON string
  visibility?: 'private' | 'unlisted' | 'public';
  nsfw?: 0 | 1;
  favorite?: 0 | 1;
  rating?: number;
  status?: 'new' | 'processing' | 'ready' | 'archived' | 'error';
  collectedAt?: number;
  publishedAt?: number;
  createdAt?: number;
  updatedAt?: number;
  metadata?: string; // JSON string
  embedding?: ArrayBuffer | Uint8Array;
};

import type { ResourceItem, SelectedResourceFileType } from '../types';

export const getResourceTypeFromFilename = (fileName: string): ResourceItem['type'] => {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (!ext) return 'file';
  const imageExt = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'ico', 'bmp']);
  const videoExt = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'mpeg', 'mpg', 'm4v']);
  const audioExt = new Set(['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a', 'opus']);
  const documentExt = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'md', 'markdown']);
  const textExt = new Set(['txt', 'csv', 'json', 'yaml', 'yml', 'xml', 'html', 'css', 'js', 'ts', 'jsx', 'tsx']);

  if (imageExt.has(ext)) return 'image';
  if (videoExt.has(ext)) return 'video';
  if (audioExt.has(ext)) return 'audio';
  if (documentExt.has(ext)) return 'document';
  if (textExt.has(ext)) return 'text';
  return 'file';
};

type ResourceLocationOptions = {
  folderId?: string | null;
  workspaceId?: string | null;
};

const getLocationPatch = (options?: ResourceLocationOptions) => {
  const patch: Partial<Pick<Resource, 'folderId' | 'workspaceId'>> = {};
  if (options?.folderId) {
    patch.folderId = options.folderId;
  }
  if (options?.workspaceId) {
    patch.workspaceId = options.workspaceId;
  }
  return patch;
};

export async function addResourcesFromDataTransfer(dt: DataTransfer, options?: ResourceLocationOptions) {
  const items = Array.from(dt.items || []) as DataTransferItem[];
  const files = Array.from(dt.files || []) as File[];
  const fileListForIPC: Array<{ name: string; path: string; isDirectory: boolean }> = [];

  items.forEach((item: DataTransferItem) => {
    if (item.kind === 'file') {
      const anyItem = item as any;
      let entry: any;
      try {
        entry = anyItem.webkitGetAsEntry?.();
      } catch {
        /* noop */
      }
      if (entry?.isDirectory) {
        fileListForIPC.push({ name: entry.name, path: '', isDirectory: true });
      } else {
        const f = item.getAsFile();
        if (f) fileListForIPC.push({ name: f.name, path: (f as any).path || '', isDirectory: false });
      }
    }
  });

  // Insert to DB
  for (const f of fileListForIPC) {
    if (f.isDirectory) continue;
    const now = Date.now();
    const resource = {
      id: (crypto as any).randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: getResourceTypeFromFilename(f.name),
      title: f.name,
      filePath: f.path,
      sizeBytes: undefined as number | undefined,
      collectedAt: now,
      createdAt: now,
      updatedAt: now,
      status: 'new' as const,
      ...getLocationPatch(options)
    };
    try {
      await window.YUA.resource['resource:add']({ resource });
    } catch {
      /* noop */
    }
  }
}

export async function addResourcesFromSelectedFiles(files: SelectedResourceFileType[], options?: ResourceLocationOptions): Promise<Resource[]> {
  const resources: Resource[] = [];
  for (const f of files) {
    const now = Date.now();
    const safeName = f.name || (f.path ? f.path.split(/[/\\]/).pop() || '' : '');
    let finalFilePath: string | undefined = f.path;
    let fileHash: string | undefined;

    if (f.file) {
      try {
        const fileSize = f.file.size;
        // 大于 50MB 使用流式上传，避免内存问题
        const USE_STREAM = fileSize > 50 * 1024 * 1024;

        if (USE_STREAM && typeof f.file.stream === 'function') {
          // 流式上传大文件
          const startResult = await window.YUA?.resource?.uploadResourceFileStreamStart?.({
            fileName: safeName,
            totalSize: fileSize
          });

          if (!startResult?.success || !startResult?.uploadId) {
            throw new Error('Failed to start stream upload');
          }

          const uploadId = startResult.uploadId;
          const stream = f.file.stream();
          const reader = stream.getReader();
          let chunkIndex = 0;

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              if (value && value.length > 0) {
                // 确保传递正确的 ArrayBuffer
                const chunk = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
                const chunkResult = await window.YUA?.resource?.uploadResourceFileStreamChunk?.({
                  uploadId,
                  chunk,
                  chunkIndex
                });

                if (!chunkResult?.success) {
                  throw new Error(`Failed to upload chunk ${chunkIndex}: ${chunkResult?.error || 'unknown error'}`);
                }

                chunkIndex++;
              }
            }

            const uploaded = await window.YUA?.resource?.uploadResourceFileStreamEnd?.({
              uploadId
            });

            if (uploaded?.duplicate) {
              continue;
            }
            if (uploaded?.success && uploaded.filePath) {
              finalFilePath = uploaded.filePath;
              fileHash = uploaded.hash;
            } else {
              throw new Error(`Upload failed: ${uploaded?.error || 'unknown error'}`);
            }
          } catch (streamError) {
            console.error('Stream upload error', streamError);
            throw streamError;
          }
        } else if (typeof f.file.arrayBuffer === 'function') {
          // 小文件使用原来的方式
          const data = await f.file.arrayBuffer();
          const uploaded = await window.YUA?.resource?.uploadResourceFile?.({ fileName: safeName, data });

          if (uploaded?.duplicate) {
            continue;
          }
          if (uploaded?.success && uploaded.filePath) {
            finalFilePath = uploaded.filePath;
            fileHash = uploaded.hash;
          }
        }
      } catch (error) {
        console.error('addResourcesFromSelectedFiles error', error);
      }
    }

    const resource = {
      type: getResourceTypeFromFilename(safeName),
      title: safeName,
      filePath: finalFilePath,
      sizeBytes: f.size,
      collectedAt: now,
      createdAt: now,
      updatedAt: now,
      status: 'new' as const,
      ...getLocationPatch(options),
      ...(fileHash ? { metadata: JSON.stringify({ hashSha256: fileHash }) } : {})
    };
    try {
      const res = await window.YUA.resource['resource:add']({ resource });
      if (res.success) {
        resources.push(res.data);
      }
    } catch (error) {
      console.error('addResourcesFromSelectedFiles error', error);
      /* noop */
    }
  }
  return resources;
}
