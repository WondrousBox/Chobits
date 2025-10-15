/**
 * 资源服务：处理拖拽/选择文件并写入资源库
 * - 行为：
 *   - DataTransfer：解析条目（目录跳过）、可选打开文件列表窗口、入库资源。
 *   - SelectedFiles：若有 File 对象优先上传（去重），然后入库。
 * - 副作用：调用 window.YUA.resource.addResource、window.YUA.resource.uploadResourceFile、window.YUA.window.openFileListWindow。
 */
import { getResourceTypeFromFilename } from '../utils/resource'
import type { SelectedResourceFileType } from '@/types'

export async function addResourcesFromDataTransfer(dt: DataTransfer) {
  const items = Array.from(dt.items || []) as DataTransferItem[]
  const files = Array.from(dt.files || []) as File[]
  const fileListForIPC: Array<{ name: string; path: string; isDirectory: boolean }> = []

  items.forEach((item: DataTransferItem) => {
    if (item.kind === 'file') {
      const anyItem = item as any
      let entry: any
      try { entry = anyItem.webkitGetAsEntry?.() } catch { /* noop */ }
      if (entry?.isDirectory) {
        fileListForIPC.push({ name: entry.name, path: '', isDirectory: true })
      } else {
        const f = item.getAsFile()
        if (f) fileListForIPC.push({ name: f.name, path: (f as any).path || '', isDirectory: false })
      }
    }
  })

  if (fileListForIPC.length) {
    try { await window.YUA.window.openFileListWindow(fileListForIPC) } catch { /* noop */ }
  }

  // Insert to DB
  for (const f of fileListForIPC) {
    if (f.isDirectory) continue
    const now = Date.now()
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
    }
    try { await window.YUA.resource.addResource({ resource }) } catch { /* noop */ }
  }
}

export async function addResourcesFromSelectedFiles(files: SelectedResourceFileType[]) {
  for (const f of files) {
    const now = Date.now();
    const safeName = f.name || (f.path ? (f.path.split(/[/\\]/).pop() || '') : '');
    let finalFilePath: string | undefined = f.path;
    let fileHash: string | undefined;

    if (f.file && typeof f.file.arrayBuffer === 'function') {
      try {
        const data = await f.file.arrayBuffer();
        const uploaded = await (window as any).YUA?.resource?.uploadResourceFile?.({ fileName: safeName, data });
        if (uploaded?.duplicate) {
          continue;
        }
        if (uploaded?.success && uploaded.filePath) {
          finalFilePath = uploaded.filePath;
          fileHash = uploaded.hash;
        }
      } catch { /* noop */ }
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
      ...(fileHash ? { metadata: JSON.stringify({ hashSha256: fileHash }) } : {}),
    };
    try { await window.YUA.resource.addResource({ resource }); } catch { /* noop */ }
  }
}
