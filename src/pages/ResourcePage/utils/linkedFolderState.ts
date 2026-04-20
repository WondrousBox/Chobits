type FolderLike = {
  originType?: 'workspace' | 'linked';
  relativePath?: string | null;
  metadata?: string | null;
};

export type LinkedRootState = {
  mountStatus?: 'active' | 'disconnected' | 'missing';
  pathStatus?: 'available' | 'missing';
  watchEnabled?: boolean;
  absolutePath?: string | null;
  lastScanAt?: number | null;
  hiddenFolderCount?: number;
  hiddenResourceCount?: number;
  conflictCount?: number;
  lastSyncStatus?: 'ok' | 'root-missing' | 'error' | null;
  lastSyncError?: string | null;
  issueType?: 'missing-root' | 'missing-children' | 'conflict' | 'sync-error' | null;
};

export type LinkedFolderState = {
  syncState?: 'missing' | 'synced' | null;
  issueType?: 'missing-folder' | null;
  pathStatus?: 'available' | 'missing' | null;
  lastMissingAt?: number | null;
};

export type RecreateLinkedMissingDirectoryResult = {
  success: boolean;
  error?: string;
  data?: {
    folderId: string;
    path: string;
    rootFolderId: string;
    stats?: {
      folderCount?: number;
      resourceCount?: number;
      restoredFolderCount?: number;
      restoredResourceCount?: number;
      hiddenFolderCount?: number;
      hiddenResourceCount?: number;
      conflictCount?: number;
      thumbnailCount?: number;
    };
  };
};

export type ReconnectLinkedMissingDirectoryResult = {
  success: boolean;
  canceled?: boolean;
  error?: string;
  data?: {
    folderId: string;
    rootFolderId: string;
    relativePath: string;
    path: string;
    stats?: {
      folderCount?: number;
      resourceCount?: number;
      restoredFolderCount?: number;
      restoredResourceCount?: number;
      hiddenFolderCount?: number;
      hiddenResourceCount?: number;
      conflictCount?: number;
      thumbnailCount?: number;
    };
  };
};

export type IgnoreLinkedMissingDirectoryResult = {
  success: boolean;
  error?: string;
  data?: {
    folderId: string;
    rootFolderId: string;
    hiddenFolderCount: number;
    rescanError?: string;
    stats?: {
      folderCount?: number;
      resourceCount?: number;
      restoredFolderCount?: number;
      restoredResourceCount?: number;
      hiddenFolderCount?: number;
      hiddenResourceCount?: number;
      conflictCount?: number;
      thumbnailCount?: number;
    };
  };
};

function parseJsonObject(raw?: string | null): Record<string, any> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getLinkedRootState(folder?: FolderLike | null): LinkedRootState | null {
  if (!folder || folder.originType !== 'linked' || (folder.relativePath || '') !== '') {
    return null;
  }

  const metadata = parseJsonObject(folder.metadata);
  const linkedRootState = metadata.linkedRootState;
  if (!linkedRootState || typeof linkedRootState !== 'object') {
    return null;
  }

  return linkedRootState as LinkedRootState;
}

export function getLinkedFolderState(folder?: FolderLike | null): LinkedFolderState | null {
  if (!folder || folder.originType !== 'linked' || (folder.relativePath || '') === '') {
    return null;
  }

  const metadata = parseJsonObject(folder.metadata);
  const linkedFolderState = metadata.linkedFolderState;
  if (!linkedFolderState || typeof linkedFolderState !== 'object') {
    return null;
  }

  return linkedFolderState as LinkedFolderState;
}

export function getLinkedRootIssueBadge(state?: LinkedRootState | null): { label: string; className: string } | null {
  if (!state?.issueType) return null;
  if (state.issueType === 'missing-root') {
    return {
      label: 'Missing',
      className: 'text-red-700 border-red-300/60 bg-red-50'
    };
  }
  if (state.issueType === 'missing-children') {
    return {
      label: 'Repair',
      className: 'text-amber-700 border-amber-300/60 bg-amber-50'
    };
  }
  if (state.issueType === 'conflict') {
    return {
      label: 'Conflict',
      className: 'text-red-700 border-red-300/60 bg-red-50'
    };
  }
  return {
    label: 'Error',
    className: 'text-red-700 border-red-300/60 bg-red-50'
  };
}

export function getLinkedFolderIssueBadge(state?: LinkedFolderState | null): { label: string; className: string } | null {
  if (state?.issueType !== 'missing-folder') return null;
  return {
    label: 'Missing',
    className: 'text-amber-700 border-amber-300/60 bg-amber-50'
  };
}

export function isLinkedFolderMissing(state?: LinkedFolderState | null): boolean {
  return state?.issueType === 'missing-folder';
}

export function getLinkedRootStateDescription(state?: LinkedRootState | null): string {
  if (!state) return '';

  if (state.issueType === 'missing-root') {
    return '关联根目录当前不可访问，请检查磁盘位置后重新扫描。';
  }

  if (state.issueType === 'missing-children') {
    const hiddenFolderCount = state.hiddenFolderCount || 0;
    const hiddenResourceCount = state.hiddenResourceCount || 0;
    return `最近一次扫描发现 ${hiddenFolderCount} 个子目录、${hiddenResourceCount} 个资源在磁盘上缺失。`;
  }

  if (state.issueType === 'conflict') {
    const conflictCount = state.conflictCount || 0;
    return `最近一次扫描发现 ${conflictCount} 个关联资源在磁盘上发生外部改动，请重新扫描确认或打开目录处理。`;
  }

  if (state.issueType === 'sync-error') {
    return state.lastSyncError || '最近一次关联目录同步失败。';
  }

  return '';
}

export function getLinkedFolderStateDescription(state?: LinkedFolderState | null): string {
  if (state?.issueType === 'missing-folder') {
    return '这个关联子目录在磁盘上不存在；可以重新扫描关联目录，或在原位置重建目录。';
  }
  return '';
}

export async function recreateLinkedMissingDirectory(folderId: string): Promise<RecreateLinkedMissingDirectoryResult> {
  const folderApi = (window as any).YUA?.folder;
  if (!folderApi?.['folder.recreateLinkedMissingDirectory']) {
    return { success: false, error: 'unsupported' };
  }
  return folderApi['folder.recreateLinkedMissingDirectory']({ folderId });
}

export async function reconnectLinkedMissingDirectory(folderId: string): Promise<ReconnectLinkedMissingDirectoryResult> {
  const folderApi = (window as any).YUA?.folder;
  if (!folderApi?.['folder.reconnectLinkedMissingDirectory']) {
    return { success: false, error: 'unsupported' };
  }
  return folderApi['folder.reconnectLinkedMissingDirectory']({ folderId });
}

export async function ignoreLinkedMissingDirectory(folderId: string): Promise<IgnoreLinkedMissingDirectoryResult> {
  const folderApi = (window as any).YUA?.folder;
  if (!folderApi?.['folder.ignoreLinkedMissingDirectory']) {
    return { success: false, error: 'unsupported' };
  }
  return folderApi['folder.ignoreLinkedMissingDirectory']({ folderId });
}

export function getRecreateLinkedMissingDirectoryErrorMessage(error?: string | null): string {
  switch (error) {
    case 'unsupported':
      return '当前版本缺少重建目录接口。';
    case 'invalid-folder-id':
      return '缺少要重建的文件夹 ID。';
    case 'folder-not-found':
      return '没有找到这个文件夹。';
    case 'linked-folder-required':
      return '只有关联目录中的子文件夹可以使用这个修复动作。';
    case 'linked-root-readonly':
      return '关联根目录不能这样重建，请检查磁盘位置后重新扫描。';
    case 'linked-root-missing':
      return '关联根目录当前不可访问，请检查磁盘位置后重新扫描。';
    case 'linked-folder-path-conflict':
      return '原路径已经被同名文件占用，无法重建目录。';
    default:
      return error || 'unknown';
  }
}

export function getIgnoreLinkedMissingDirectoryErrorMessage(error?: string | null): string {
  switch (error) {
    case 'unsupported':
      return '当前版本缺少忽略缺失目录接口。';
    case 'invalid-folder-id':
      return '缺少要忽略的文件夹 ID。';
    case 'folder-not-found':
      return '没有找到这个文件夹。';
    case 'linked-folder-required':
      return '只有关联目录中的子文件夹可以使用这个修复动作。';
    case 'linked-root-readonly':
      return '关联根目录不能这样忽略，请使用 Unlink。';
    case 'linked-folder-not-missing':
      return '这个关联子目录当前不是缺失状态。';
    default:
      return error || 'unknown';
  }
}

export function getReconnectLinkedMissingDirectoryErrorMessage(error?: string | null): string {
  switch (error) {
    case 'unsupported':
      return '当前版本缺少重连目录接口。';
    case 'invalid-folder-id':
      return '缺少要重连的文件夹 ID。';
    case 'folder-not-found':
      return '没有找到这个文件夹。';
    case 'linked-folder-required':
      return '只有关联目录中的子文件夹可以使用这个修复动作。';
    case 'linked-root-readonly':
      return '关联根目录不能这样重连。';
    case 'linked-root-missing':
      return '关联根目录当前不可访问，请检查磁盘位置后重新扫描。';
    case 'linked-folder-not-missing':
      return '这个关联子目录当前不是缺失状态。';
    case 'linked-folder-reconnect-target-not-directory':
      return '选择的位置不是一个可访问目录。';
    case 'linked-folder-reconnect-target-outside-root':
      return '请选择某个已关联根目录内的子目录。';
    case 'linked-folder-reconnect-target-not-linked':
      return '请选择当前工作空间里某个已关联根目录下的子目录。';
    case 'linked-folder-reconnect-target-is-root':
      return '不能直接重连到另一个关联根目录本身，请选择它下面的子目录。';
    case 'linked-folder-path-already-indexed':
      return '这个目录已经在资源树中索引。';
    case 'linked-folder-parent-not-indexed':
      return '目标目录的父目录还没有索引，请先重新扫描关联根目录。';
    default:
      return error || 'unknown';
  }
}

export function getRecreateLinkedMissingDirectorySuccessMessage(result?: RecreateLinkedMissingDirectoryResult | null): string {
  const hiddenFolderCount = Number(result?.data?.stats?.hiddenFolderCount || 0);
  const hiddenResourceCount = Number(result?.data?.stats?.hiddenResourceCount || 0);
  if (hiddenFolderCount > 0 || hiddenResourceCount > 0) {
    return `重新扫描后仍有 ${hiddenFolderCount} 个子目录、${hiddenResourceCount} 个资源缺失。`;
  }
  return '已重新扫描关联目录。';
}

export function getIgnoreLinkedMissingDirectorySuccessMessage(result?: IgnoreLinkedMissingDirectoryResult | null): string {
  if (result?.data?.rescanError) {
    return `已移入回收站；自动重新扫描失败：${result.data.rescanError}`;
  }

  const hiddenFolderCount = Number(result?.data?.stats?.hiddenFolderCount || 0);
  const hiddenResourceCount = Number(result?.data?.stats?.hiddenResourceCount || 0);
  if (hiddenFolderCount > 0 || hiddenResourceCount > 0) {
    return `已移入回收站；重新扫描后仍有 ${hiddenFolderCount} 个子目录、${hiddenResourceCount} 个资源缺失。`;
  }
  return '已移入回收站，并重新扫描关联目录。';
}

export function getReconnectLinkedMissingDirectorySuccessMessage(result?: ReconnectLinkedMissingDirectoryResult | null): string {
  const hiddenFolderCount = Number(result?.data?.stats?.hiddenFolderCount || 0);
  const hiddenResourceCount = Number(result?.data?.stats?.hiddenResourceCount || 0);
  if (hiddenFolderCount > 0 || hiddenResourceCount > 0) {
    return `已重连；重新扫描后仍有 ${hiddenFolderCount} 个子目录、${hiddenResourceCount} 个资源缺失。`;
  }
  return '已重连并重新扫描关联目录。';
}
