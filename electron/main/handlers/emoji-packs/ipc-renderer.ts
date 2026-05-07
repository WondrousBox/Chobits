import { ipcRenderer } from 'electron';

import type { EmojiPackImportResult, EmojiPackListNode, EmojiPackSearchResult, EmojiPackSummary } from './types';

export type EmojiPacksIpcType = typeof emojiPacksIpcRenderer;

export const emojiPacksIpcRenderer = {
  'emojiPacks:listPacks': async (): Promise<EmojiPackSummary[]> => ipcRenderer.invoke('emojiPacks:listPacks'),

  'emojiPacks:listNodes': async (payload: { packId: string; relativePath?: string; limit?: number }): Promise<{ nodes: EmojiPackListNode[]; pack?: EmojiPackSummary }> =>
    ipcRenderer.invoke('emojiPacks:listNodes', payload),

  'emojiPacks:search': async (payload: { packId?: string; query: string; limit?: number }): Promise<EmojiPackSearchResult[]> => ipcRenderer.invoke('emojiPacks:search', payload),

  'emojiPacks:importFromPaths': async (payload: { paths: string[] }): Promise<EmojiPackImportResult[]> => ipcRenderer.invoke('emojiPacks:importFromPaths', payload),

  'emojiPacks:pickFolderAndImport': async (): Promise<{ canceled: boolean; results: EmojiPackImportResult[] }> => ipcRenderer.invoke('emojiPacks:pickFolderAndImport'),

  'emojiPacks:pickArchiveAndImport': async (): Promise<{ canceled: boolean; results: EmojiPackImportResult[] }> => ipcRenderer.invoke('emojiPacks:pickArchiveAndImport'),

  'emojiPacks:revealPack': async (payload: { packId: string }): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('emojiPacks:revealPack', payload)
};
