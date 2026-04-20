import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  addResourceMock: vi.fn(),
  emitMock: vi.fn(),
  folderGetByIdMock: vi.fn(),
  getLinkedFolderContextMock: vi.fn(),
  rescanLinkedDirectoryByFolderIdMock: vi.fn(),
  resourceGetByIdMock: vi.fn(),
  resourceUpdateMock: vi.fn(),
  statMock: vi.fn()
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      state.handlers.set(channel, handler);
    })
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
    getFocusedWindow: vi.fn(() => null)
  },
  dialog: {
    showMessageBox: vi.fn(),
    showOpenDialog: vi.fn()
  },
  shell: {
    showItemInFolder: vi.fn()
  }
}));

vi.mock('node:fs/promises', () => ({
  cp: vi.fn(),
  copyFile: vi.fn(),
  mkdir: vi.fn(),
  readFile: vi.fn(),
  readdir: vi.fn(),
  rename: vi.fn(),
  rm: vi.fn(),
  stat: state.statMock,
  unlink: vi.fn(),
  writeFile: vi.fn()
}));

vi.mock('../packages/event', () => ({
  eventManager: {
    emit: state.emitMock
  },
  sendAppBusyEnd: vi.fn(),
  sendAppBusyProgress: vi.fn(),
  sendAppBusyStart: vi.fn()
}));

vi.mock('../electron/main/db/repositories', () => ({
  FoldersRepo: {
    getById: state.folderGetByIdMock
  },
  ResourcesRepo: {
    getById: state.resourceGetByIdMock,
    update: state.resourceUpdateMock
  },
  TagsRepo: {},
  WorkspacesRepo: {
    getById: vi.fn(),
    getDefault: vi.fn()
  }
}));

vi.mock('../electron/main/handlers/folder/linked-sync', () => ({
  rescanLinkedDirectoryByFolderId: state.rescanLinkedDirectoryByFolderIdMock
}));

vi.mock('../electron/main/handlers/folder/linked-utils', () => ({
  copyPathIntoDirectory: vi.fn(),
  ensureUniquePath: vi.fn(),
  getLinkedFolderContext: state.getLinkedFolderContextMock,
  getRelativePathWithinMount: vi.fn(),
  movePathSafe: vi.fn()
}));

vi.mock('../electron/main/handlers/resource/index', () => ({
  addResource: state.addResourceMock,
  ensureDailyFolder: vi.fn(),
  getOrCreateAudioFolder: vi.fn(),
  getOrCreateScreenshotFolder: vi.fn()
}));

vi.mock('../electron/main/handlers/resource/resource-project', () => ({
  clearResourceProjectDir: vi.fn(),
  createCustomProjectSubDir: vi.fn(),
  deleteProjectTrack: vi.fn(),
  deleteProjectTranslation: vi.fn(),
  deleteResourceProjectDir: vi.fn(),
  ensureResourceProjectDir: vi.fn(),
  getResourceProjectPath: vi.fn(),
  getResourceProjectStats: vi.fn(),
  listProjectTracks: vi.fn(),
  readProjectDataJsonSubDir: vi.fn(),
  readProjectMeta: vi.fn(),
  readProjectTrackConfig: vi.fn(),
  updateSubtitleEditTrackSegments: vi.fn(),
  writeProjectDataSubDirFile: vi.fn(),
  writeProjectMeta: vi.fn(),
  writeProjectTrackConfig: vi.fn()
}));

vi.mock('../electron/main/utils/thumbnail', () => ({
  detectBasicType: vi.fn(() => ({
    mimeType: 'application/octet-stream',
    type: 'file'
  })),
  generateThumbnailForResource: vi.fn()
}));

import { initResourceHandlers } from '../electron/main/handlers/resource/ipc-main';

describe('resolveLinkedResourceConflict handler', () => {
  beforeEach(() => {
    state.handlers.clear();
    vi.clearAllMocks();
    initResourceHandlers();
  });

  it('copies the disk snapshot before confirming a conflict when requested', async () => {
    state.resourceGetByIdMock.mockResolvedValue({
      id: 'res-1',
      filePath: '/linked/foo.txt',
      folderId: 'folder-1',
      originType: 'linked',
      syncState: 'conflict',
      title: 'Foo',
      workspaceId: 'ws-1'
    });
    state.statMock.mockResolvedValue({
      isFile: () => true,
      mtimeMs: 654,
      size: 321
    });
    state.addResourceMock.mockResolvedValue({
      success: true,
      data: {
        id: 'copy-1',
        title: 'Foo (磁盘副本)'
      }
    });
    const updatedRow = {
      id: 'res-1',
      syncState: 'synced'
    };
    state.resourceUpdateMock.mockResolvedValue(updatedRow);
    state.folderGetByIdMock.mockResolvedValue({
      id: 'folder-1',
      originType: 'linked'
    });
    state.getLinkedFolderContextMock.mockResolvedValue({
      mount: {
        rootFolderId: 'root-1'
      }
    });
    state.rescanLinkedDirectoryByFolderIdMock.mockResolvedValue({
      rootFolder: {
        id: 'root-1'
      }
    });

    const handler = state.handlers.get('resolveLinkedResourceConflict');
    expect(handler).toBeTypeOf('function');

    const result = await handler({}, { action: 'copy-disk-snapshot', id: 'res-1' });

    expect(state.addResourceMock).toHaveBeenCalledWith({
      resource: expect.objectContaining({
        filePath: '/linked/foo.txt',
        folderId: null,
        title: 'Foo (磁盘副本)',
        workspaceId: 'ws-1'
      })
    });
    expect(state.resourceUpdateMock).toHaveBeenCalledWith(
      'res-1',
      expect.objectContaining({
        externalMtimeMs: 654,
        externalSizeBytes: 321,
        sizeBytes: 321,
        syncState: 'synced'
      })
    );
    expect(state.rescanLinkedDirectoryByFolderIdMock).toHaveBeenCalledWith('root-1');
    expect(result).toMatchObject({
      success: true,
      data: {
        copy: {
          id: 'copy-1'
        },
        resource: updatedRow
      }
    });
  });

  it('rejects non-conflict linked resources before mutating state', async () => {
    state.resourceGetByIdMock.mockResolvedValue({
      id: 'res-1',
      originType: 'linked',
      syncState: 'synced'
    });

    const handler = state.handlers.get('resolveLinkedResourceConflict');
    const result = await handler({}, { action: 'accept-disk', id: 'res-1' });

    expect(result).toMatchObject({
      success: false,
      error: 'linked-resource-not-conflict'
    });
    expect(state.addResourceMock).not.toHaveBeenCalled();
    expect(state.resourceUpdateMock).not.toHaveBeenCalled();
    expect(state.rescanLinkedDirectoryByFolderIdMock).not.toHaveBeenCalled();
  });
});
