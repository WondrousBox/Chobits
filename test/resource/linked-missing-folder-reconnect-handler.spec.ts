import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => {
  const nextState: any = {
    foldersTable: { __table: 'folders', id: 'id' },
    resourcesTable: { __table: 'resources', id: 'id' },
    folderRows: [] as any[],
    resourceRows: [] as any[],
    mountRows: [] as any[],
    handlers: new Map<string, (...args: any[]) => any>(),
    folderGetByIdMock: vi.fn(),
    folderGetByLinkedRelativePathMock: vi.fn(),
    folderListMock: vi.fn(),
    getLinkedFolderContextMock: vi.fn(),
    linkedMountListMock: vi.fn(),
    rescanLinkedDirectoryByFolderIdMock: vi.fn(),
    resourceListMock: vi.fn(),
    showOpenDialogMock: vi.fn(),
    statMock: vi.fn()
  };

  nextState.getOrmMock = vi.fn(() => ({
    update: (table: any) => {
      let patch: any;
      let condition: any;
      return {
        set(nextPatch: any) {
          patch = nextPatch;
          return this;
        },
        where(nextCondition: any) {
          condition = nextCondition;
          return {
            run: async () => {
              const rows = table?.__table === 'folders' ? nextState.folderRows : nextState.resourceRows;
              if (condition?.kind === 'eq' && condition.field === 'id') {
                const row = rows.find((item: any) => item.id === condition.value);
                if (row) Object.assign(row, patch);
              }
            }
          };
        }
      };
    }
  }));

  return nextState;
});

vi.mock('drizzle-orm', () => ({
  and: (...conditions: any[]) => ({ kind: 'and', conditions }),
  eq: (field: any, value: any) => ({ kind: 'eq', field, value }),
  inArray: (field: any, values: any[]) => ({ kind: 'inArray', field, values }),
  isNull: (field: any) => ({ kind: 'isNull', field }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: any[]) => ({ kind: 'sql', strings, values }),
    {
      join: (values: any[]) => ({ kind: 'sql-join', values })
    }
  )
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      state.handlers.set(channel, handler);
    })
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null)
  },
  dialog: {
    showMessageBox: vi.fn(),
    showOpenDialog: state.showOpenDialogMock
  }
}));

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  rmdir: vi.fn(),
  stat: state.statMock,
  writeFile: vi.fn()
}));

vi.mock('../../packages/event', () => ({
  eventManager: {
    emit: vi.fn()
  }
}));

vi.mock('../../electron/main/db', () => ({
  getOrm: state.getOrmMock
}));

vi.mock('../../electron/main/db/repositories', () => ({
  FoldersRepo: {
    create: vi.fn(),
    getById: state.folderGetByIdMock,
    getByLinkedRelativePath: state.folderGetByLinkedRelativePathMock,
    list: state.folderListMock,
    move: vi.fn(),
    rename: vi.fn(),
    restore: vi.fn(),
    softDelete: vi.fn()
  },
  LinkedFolderMountsRepo: {
    getById: vi.fn(),
    list: state.linkedMountListMock
  },
  RecycleBinRepo: {
    restoreEntitiesByRecycleIds: vi.fn()
  },
  ResourcesRepo: {
    list: state.resourceListMock
  },
  WorkspacesRepo: {
    getById: vi.fn(),
    getDefault: vi.fn()
  }
}));

vi.mock('../../electron/main/db/schema', () => ({
  folders: state.foldersTable,
  recycle_bin: {},
  resources: state.resourcesTable
}));

vi.mock('../../electron/main/handlers/folder/linked-sync', () => ({
  linkLocalDirectory: vi.fn(),
  rescanLinkedDirectoryByFolderId: state.rescanLinkedDirectoryByFolderIdMock,
  unlinkLinkedDirectoryByFolderId: vi.fn()
}));

vi.mock('../../electron/main/handlers/folder/linked-utils', () => ({
  ensureUniqueEntryName: vi.fn(),
  getLinkedFolderContext: state.getLinkedFolderContextMock,
  joinRelativePath: vi.fn(),
  movePathSafe: vi.fn(),
  normalizeRelativePath: (value?: string | null) =>
    String(value || '')
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, ''),
  replaceRelativePathPrefix: (value: string, oldPrefix: string, newPrefix: string) => {
    const normalizedValue = String(value || '')
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '');
    const normalizedOldPrefix = String(oldPrefix || '')
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '');
    const normalizedNewPrefix = String(newPrefix || '')
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '');

    if (!normalizedOldPrefix) return normalizedValue;
    if (normalizedValue === normalizedOldPrefix) return normalizedNewPrefix;
    if (!normalizedValue.startsWith(`${normalizedOldPrefix}/`)) return normalizedValue;
    const suffix = normalizedValue.slice(`${normalizedOldPrefix}/`.length);
    return normalizedNewPrefix ? `${normalizedNewPrefix}/${suffix}` : suffix;
  }
}));

vi.mock('../../electron/main/handlers/folder/storage', () => ({
  getWorkspaceFoldersRoot: vi.fn(),
  resolveFolderLayoutPath: vi.fn(),
  resolveFolderPath: vi.fn(),
  resolveWorkspaceResourcesPath: vi.fn()
}));

import { initFolderHandlers } from '../../electron/main/handlers/folder/ipc-main';

describe('folder.reconnectLinkedMissingDirectory handler', () => {
  beforeEach(() => {
    state.handlers.clear();
    state.folderRows.splice(0, state.folderRows.length);
    state.resourceRows.splice(0, state.resourceRows.length);
    state.mountRows.splice(0, state.mountRows.length);
    vi.clearAllMocks();

    state.folderGetByIdMock.mockImplementation(async (id: string) => state.folderRows.find((row: any) => row.id === id));
    state.folderGetByLinkedRelativePathMock.mockImplementation(
      async (linkedMountId: string, relativePath: string) =>
        state.folderRows.find((row: any) => row.linkedMountId === linkedMountId && (row.relativePath || '') === relativePath)
    );
    state.folderListMock.mockImplementation(async (filter: any = {}) =>
      state.folderRows.filter((row: any) => {
        if (filter.linkedMountId && row.linkedMountId !== filter.linkedMountId) return false;
        return true;
      })
    );
    state.resourceListMock.mockImplementation(async (filter: any = {}) =>
      state.resourceRows.filter((row: any) => {
        if (filter.linkedMountId && row.linkedMountId !== filter.linkedMountId) return false;
        return true;
      })
    );
    state.linkedMountListMock.mockImplementation(async (filter: any = {}) =>
      state.mountRows.filter((row: any) => {
        if (filter.workspaceId && row.workspaceId !== filter.workspaceId) return false;
        if (filter.status && row.status !== filter.status) return false;
        return true;
      })
    );

    initFolderHandlers();
  });

  it('rejects reconnect targets that are outside every active linked mount in the workspace', async () => {
    state.folderRows.push({
      id: 'folder-1',
      linkedMountId: 'mount-1',
      metadata: JSON.stringify({
        linkedFolderState: {
          issueType: 'missing-folder'
        }
      }),
      originType: 'linked',
      relativePath: 'old/path',
      workspaceId: 'ws-1'
    });
    state.mountRows.push({
      absolutePath: '/mount-a',
      id: 'mount-1',
      rootFolderId: 'root-1',
      status: 'active',
      workspaceId: 'ws-1'
    });
    state.getLinkedFolderContextMock.mockResolvedValue({
      folder: {
        id: 'folder-1',
        workspaceId: 'ws-1'
      },
      folderPath: '/mount-a/old/path',
      mount: {
        absolutePath: '/mount-a',
        id: 'mount-1',
        rootFolderId: 'root-1',
        workspaceId: 'ws-1'
      },
      relativePath: 'old/path'
    });
    state.showOpenDialogMock.mockResolvedValue({
      canceled: false,
      filePaths: ['/other-mount/new/path']
    });
    state.statMock.mockResolvedValue({
      isDirectory: () => true
    });

    const handler = state.handlers.get('folder.reconnectLinkedMissingDirectory');
    expect(handler).toBeTypeOf('function');

    const result = await handler({}, { folderId: 'folder-1' });

    expect(result).toMatchObject({
      success: false,
      error: 'linked-folder-reconnect-target-not-linked'
    });
    expect(state.folderGetByLinkedRelativePathMock).not.toHaveBeenCalledWith('mount-1', 'new/path');
  });

  it('rejects reconnect targets that point at another linked mount root', async () => {
    state.folderRows.push({
      id: 'folder-1',
      linkedMountId: 'mount-1',
      metadata: JSON.stringify({
        linkedFolderState: {
          issueType: 'missing-folder'
        }
      }),
      originType: 'linked',
      relativePath: 'old/path',
      workspaceId: 'ws-1'
    });
    state.mountRows.push(
      {
        absolutePath: '/mount-a',
        id: 'mount-1',
        rootFolderId: 'root-1',
        status: 'active',
        workspaceId: 'ws-1'
      },
      {
        absolutePath: '/mount-b',
        id: 'mount-2',
        rootFolderId: 'root-2',
        status: 'active',
        workspaceId: 'ws-1'
      }
    );
    state.getLinkedFolderContextMock.mockResolvedValue({
      folder: {
        id: 'folder-1',
        workspaceId: 'ws-1'
      },
      folderPath: '/mount-a/old/path',
      mount: {
        absolutePath: '/mount-a',
        id: 'mount-1',
        rootFolderId: 'root-1',
        workspaceId: 'ws-1'
      },
      relativePath: 'old/path'
    });
    state.showOpenDialogMock.mockResolvedValue({
      canceled: false,
      filePaths: ['/mount-b']
    });
    state.statMock.mockResolvedValue({
      isDirectory: () => true
    });

    const handler = state.handlers.get('folder.reconnectLinkedMissingDirectory');
    const result = await handler({}, { folderId: 'folder-1' });

    expect(result).toMatchObject({
      success: false,
      error: 'linked-folder-reconnect-target-is-root'
    });
  });

  it('rejects reconnect targets that are already indexed under the target mount', async () => {
    state.folderRows.push(
      {
        id: 'folder-1',
        linkedMountId: 'mount-1',
        metadata: JSON.stringify({
          linkedFolderState: {
            issueType: 'missing-folder'
          }
        }),
        originType: 'linked',
        relativePath: 'old/path',
        workspaceId: 'ws-1'
      },
      {
        id: 'folder-2',
        deletedAt: null,
        linkedMountId: 'mount-2',
        originType: 'linked',
        relativePath: 'new/path',
        workspaceId: 'ws-1'
      },
      {
        id: 'root-2',
        linkedMountId: 'mount-2',
        originType: 'linked',
        relativePath: '',
        workspaceId: 'ws-1'
      }
    );
    state.mountRows.push(
      {
        absolutePath: '/mount-a',
        id: 'mount-1',
        rootFolderId: 'root-1',
        status: 'active',
        workspaceId: 'ws-1'
      },
      {
        absolutePath: '/mount-b',
        id: 'mount-2',
        rootFolderId: 'root-2',
        status: 'active',
        workspaceId: 'ws-1'
      }
    );
    state.getLinkedFolderContextMock.mockResolvedValue({
      folder: {
        id: 'folder-1',
        workspaceId: 'ws-1'
      },
      folderPath: '/mount-a/old/path',
      mount: {
        absolutePath: '/mount-a',
        id: 'mount-1',
        rootFolderId: 'root-1',
        workspaceId: 'ws-1'
      },
      relativePath: 'old/path'
    });
    state.showOpenDialogMock.mockResolvedValue({
      canceled: false,
      filePaths: ['/mount-b/new/path']
    });
    state.statMock.mockResolvedValue({
      isDirectory: () => true
    });

    const handler = state.handlers.get('folder.reconnectLinkedMissingDirectory');
    const result = await handler({}, { folderId: 'folder-1' });

    expect(state.folderGetByLinkedRelativePathMock).toHaveBeenCalledWith('mount-2', 'new/path');
    expect(result).toMatchObject({
      success: false,
      error: 'linked-folder-path-already-indexed'
    });
  });

  it('moves a missing linked subtree into another active mount and rescans both roots', async () => {
    state.folderRows.push(
      {
        id: 'root-1',
        linkedMountId: 'mount-1',
        metadata: null,
        name: 'mount-a',
        originType: 'linked',
        relativePath: '',
        workspaceId: 'ws-1'
      },
      {
        id: 'folder-1',
        linkedMountId: 'mount-1',
        metadata: JSON.stringify({
          linkedFolderState: {
            issueType: 'missing-folder',
            pathStatus: 'missing'
          }
        }),
        name: 'old-folder',
        originType: 'linked',
        parentId: 'root-1',
        relativePath: 'old/path',
        workspaceId: 'ws-1'
      },
      {
        id: 'folder-1-child',
        linkedMountId: 'mount-1',
        metadata: null,
        name: 'raw',
        originType: 'linked',
        parentId: 'folder-1',
        relativePath: 'old/path/raw',
        workspaceId: 'ws-1'
      },
      {
        id: 'root-2',
        linkedMountId: 'mount-2',
        metadata: null,
        name: 'mount-b',
        originType: 'linked',
        relativePath: '',
        workspaceId: 'ws-1'
      },
      {
        id: 'parent-2',
        linkedMountId: 'mount-2',
        metadata: null,
        name: 'reconnected',
        originType: 'linked',
        parentId: 'root-2',
        relativePath: 'reconnected',
        workspaceId: 'ws-1'
      }
    );
    state.resourceRows.push({
      filePath: '/mount-a/old/path/raw/image.jpg',
      folderId: 'folder-1-child',
      id: 'res-1',
      linkedMountId: 'mount-1',
      relativePath: 'old/path/raw/image.jpg',
      workspaceId: 'ws-1'
    });
    state.mountRows.push(
      {
        absolutePath: '/mount-a',
        id: 'mount-1',
        rootFolderId: 'root-1',
        status: 'active',
        workspaceId: 'ws-1'
      },
      {
        absolutePath: '/mount-b',
        id: 'mount-2',
        rootFolderId: 'root-2',
        status: 'active',
        workspaceId: 'ws-1'
      }
    );
    state.getLinkedFolderContextMock.mockResolvedValue({
      folder: {
        id: 'folder-1',
        workspaceId: 'ws-1'
      },
      folderPath: '/mount-a/old/path',
      mount: {
        absolutePath: '/mount-a',
        id: 'mount-1',
        rootFolderId: 'root-1',
        workspaceId: 'ws-1'
      },
      relativePath: 'old/path'
    });
    state.showOpenDialogMock.mockResolvedValue({
      canceled: false,
      filePaths: ['/mount-b/reconnected/photos']
    });
    state.statMock.mockResolvedValue({
      isDirectory: () => true
    });
    state.rescanLinkedDirectoryByFolderIdMock.mockImplementation(async (rootFolderId: string) => ({
      mount: {
        id: rootFolderId === 'root-1' ? 'mount-1' : 'mount-2'
      },
      rootFolder: {
        id: rootFolderId
      },
      stats: {
        conflictCount: 0,
        folderCount: rootFolderId === 'root-2' ? 2 : 1,
        hiddenFolderCount: 0,
        hiddenResourceCount: 0,
        resourceCount: rootFolderId === 'root-2' ? 1 : 0,
        restoredFolderCount: 0,
        restoredResourceCount: 0,
        thumbnailCount: 0
      }
    }));

    const handler = state.handlers.get('folder.reconnectLinkedMissingDirectory');
    expect(handler).toBeTypeOf('function');

    const result = await handler({}, { folderId: 'folder-1' });

    expect(result).toMatchObject({
      success: true,
      data: {
        folderId: 'folder-1',
        path: '/mount-b/reconnected/photos',
        relativePath: 'reconnected/photos',
        rootFolderId: 'root-2'
      }
    });

    expect(state.folderRows.find((row: any) => row.id === 'folder-1')).toMatchObject({
      linkedMountId: 'mount-2',
      metadata: null,
      name: 'photos',
      parentId: 'parent-2',
      relativePath: 'reconnected/photos',
      workspaceId: 'ws-1'
    });
    expect(state.folderRows.find((row: any) => row.id === 'folder-1-child')).toMatchObject({
      linkedMountId: 'mount-2',
      parentId: 'folder-1',
      relativePath: 'reconnected/photos/raw',
      workspaceId: 'ws-1'
    });
    expect(state.resourceRows.find((row: any) => row.id === 'res-1')).toMatchObject({
      filePath: '/mount-b/reconnected/photos/raw/image.jpg',
      linkedMountId: 'mount-2',
      relativePath: 'reconnected/photos/raw/image.jpg',
      workspaceId: 'ws-1'
    });
    expect(state.rescanLinkedDirectoryByFolderIdMock).toHaveBeenNthCalledWith(1, 'root-1');
    expect(state.rescanLinkedDirectoryByFolderIdMock).toHaveBeenNthCalledWith(2, 'root-2');
  });
});
