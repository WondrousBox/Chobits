import { ResourceItem } from '../types';

export type LinkedResourceSyncIssue = 'missing' | 'conflict';

type LinkedFolderRow = {
  id: string;
  parentId?: string | null;
  originType?: 'workspace' | 'linked';
  relativePath?: string | null;
};

type RescanLinkedResourceResult = {
  success: boolean;
  error?: string;
  rootFolderId?: string;
  resourceCount?: number;
};

type OpenContainingFolderResult = {
  success: boolean;
  error?: string;
};

type ResolveLinkedResourceConflictResult = {
  success: boolean;
  error?: string;
  data?: {
    resource?: ResourceItem;
    copy?: ResourceItem | null;
  };
};

export function getLinkedResourceSyncIssue(item?: Pick<ResourceItem, 'originType' | 'syncState'> | null): LinkedResourceSyncIssue | null {
  if (!item || item.originType !== 'linked') return null;
  if (item.syncState === 'missing' || item.syncState === 'conflict') {
    return item.syncState;
  }
  return null;
}

export function isLinkedResourceSyncIssue(item?: Pick<ResourceItem, 'originType' | 'syncState'> | null): boolean {
  return getLinkedResourceSyncIssue(item) !== null;
}

export function getLinkedResourceSyncIssueLabel(issue?: LinkedResourceSyncIssue | null): string {
  if (issue === 'conflict') return '冲突';
  if (issue === 'missing') return '缺失';
  return '';
}

export function getLinkedResourceSyncIssueDescription(issue?: LinkedResourceSyncIssue | null): string {
  if (issue === 'conflict') {
    return '关联文件在磁盘上发生外部改动，请重新扫描关联目录以确认磁盘版本，或打开所在目录处理。';
  }
  if (issue === 'missing') {
    return '关联文件在磁盘上不存在，请重新扫描关联目录或打开所在目录。';
  }
  return '';
}

export async function resolveLinkedResourceConflict(
  item: Pick<ResourceItem, 'id' | 'originType' | 'syncState'>,
  action: 'accept-disk' | 'copy-disk-snapshot'
): Promise<ResolveLinkedResourceConflictResult> {
  if (item.originType !== 'linked') {
    return { success: false, error: 'linked-resource-required' };
  }
  if (item.syncState !== 'conflict') {
    return { success: false, error: 'linked-resource-not-conflict' };
  }

  const resourceApi: any = window.YUA?.resource;
  if (!resourceApi?.resolveLinkedResourceConflict) {
    return { success: false, error: 'unsupported' };
  }
  return resourceApi.resolveLinkedResourceConflict({ id: item.id, action });
}

export function getResolveLinkedResourceConflictErrorMessage(error?: string | null): string {
  switch (error) {
    case 'unsupported':
      return '当前版本缺少冲突处理接口。';
    case 'invalid-resource-id':
      return '缺少要处理的资源 ID。';
    case 'resource-not-found':
      return '没有找到这个资源。';
    case 'linked-resource-required':
      return '只有关联资源可以使用这个修复动作。';
    case 'linked-resource-not-conflict':
      return '这个关联资源当前不是冲突状态。';
    case 'linked-resource-path-missing':
      return '这个资源没有可用的文件路径。';
    case 'linked-resource-file-missing':
      return '磁盘文件当前不可访问，请检查文件位置。';
    case 'linked-resource-copy-failed':
      return '另存磁盘副本失败。';
    case 'invalid-conflict-action':
      return '未知的冲突处理动作。';
    default:
      return error || 'unknown';
  }
}

export type LinkedResourceDiskInfo = {
  db: { sizeBytes?: number | null; mtimeMs?: number | null; title?: string | null; filePath?: string | null };
  disk: { sizeBytes?: number; mtimeMs?: number; exists: boolean };
};

export async function getLinkedResourceDiskInfo(
  item: Pick<ResourceItem, 'id' | 'originType'>
): Promise<{ success: boolean; data?: LinkedResourceDiskInfo; error?: string }> {
  if (item.originType !== 'linked') {
    return { success: false, error: 'linked-resource-required' };
  }
  const resourceApi: any = window.YUA?.resource;
  if (!resourceApi?.getLinkedResourceDiskInfo) {
    return { success: false, error: 'unsupported' };
  }
  return resourceApi.getLinkedResourceDiskInfo({ id: item.id });
}

export async function findLinkedRootFolderId(startFolderId?: string | null): Promise<string | null> {
  const folderApi: any = window.YUA?.folder;
  if (!startFolderId || !folderApi?.['folder.get']) return null;

  let currentId: string | null = startFolderId;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const folder = (await folderApi['folder.get']({ id: currentId })) as LinkedFolderRow | undefined;
    if (!folder) return null;

    if (folder.originType === 'linked' && (folder.relativePath || '') === '') {
      return folder.id;
    }

    currentId = folder.parentId ?? null;
  }

  return null;
}

export async function rescanLinkedResourceRoot(item: Pick<ResourceItem, 'originType' | 'folderId'>): Promise<RescanLinkedResourceResult> {
  if (item.originType !== 'linked') {
    return { success: false, error: 'not-linked-resource' };
  }

  const folderApi: any = window.YUA?.folder;
  if (!folderApi?.['folder.rescanLinkedDirectory']) {
    return { success: false, error: 'folder-rescan-unavailable' };
  }

  const rootFolderId = await findLinkedRootFolderId(item.folderId ?? null);
  if (!rootFolderId) {
    return { success: false, error: 'linked-root-folder-not-found' };
  }

  const result = await folderApi['folder.rescanLinkedDirectory']({ rootFolderId });
  if (!result?.success) {
    return { success: false, error: result?.error || 'linked-rescan-failed', rootFolderId };
  }

  return {
    success: true,
    rootFolderId,
    resourceCount: result?.data?.stats?.resourceCount ?? 0
  };
}

export async function openContainingFolderForResource(item: Pick<ResourceItem, 'folderId' | 'workspaceId'>): Promise<OpenContainingFolderResult> {
  const folderApi: any = window.YUA?.folder;
  const fileApi: any = window.YUA?.file;

  if (!folderApi?.['folder.getResolvedPath'] || !fileApi?.['file:openPath']) {
    return { success: false, error: 'folder-open-unavailable' };
  }

  const resolved = await folderApi['folder.getResolvedPath']({
    id: item.folderId ?? null,
    workspaceId: item.workspaceId || undefined
  });
  const folderPath: string | undefined = resolved?.success ? resolved.path : undefined;
  if (!folderPath) {
    return { success: false, error: resolved?.error || 'linked-folder-path-not-found' };
  }

  await fileApi['file:openPath'](folderPath);
  return { success: true };
}
