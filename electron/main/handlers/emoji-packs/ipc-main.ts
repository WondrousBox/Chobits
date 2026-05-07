import { dialog, ipcMain } from 'electron';

import { importEmojiPacksFromPaths, listEmojiPackNodes, listEmojiPacks, registerEmojiPackResourceRoots, revealEmojiPack, searchEmojiPacks } from './service';

const ARCHIVE_FILTERS = [
  {
    extensions: ['zip', '7z', 'rar', 'tar', 'gz', 'tgz'],
    name: '表情包压缩包'
  }
];

export async function initEmojiPackHandlers(): Promise<void> {
  await registerEmojiPackResourceRoots().catch((error) => {
    console.warn('[emoji-packs] failed to register resource roots:', error);
  });

  ipcMain.handle('emojiPacks:listPacks', async () => listEmojiPacks());

  ipcMain.handle('emojiPacks:listNodes', async (_event, payload: { packId: string; relativePath?: string; limit?: number }) => listEmojiPackNodes(payload));

  ipcMain.handle('emojiPacks:search', async (_event, payload: { packId?: string; query: string; limit?: number }) => searchEmojiPacks(payload));

  ipcMain.handle('emojiPacks:importFromPaths', async (_event, payload: { paths: string[] }) => importEmojiPacksFromPaths(Array.isArray(payload?.paths) ? payload.paths : []));

  ipcMain.handle('emojiPacks:pickFolderAndImport', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'multiSelections']
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, results: [] };
    }
    return {
      canceled: false,
      results: await importEmojiPacksFromPaths(result.filePaths)
    };
  });

  ipcMain.handle('emojiPacks:pickArchiveAndImport', async () => {
    const result = await dialog.showOpenDialog({
      filters: ARCHIVE_FILTERS,
      properties: ['openFile', 'multiSelections']
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, results: [] };
    }
    return {
      canceled: false,
      results: await importEmojiPacksFromPaths(result.filePaths)
    };
  });

  ipcMain.handle('emojiPacks:revealPack', async (_event, payload: { packId: string }) => revealEmojiPack(payload.packId));
}
