import { BrowserWindow, ipcMain } from 'electron';
import { insertVectors, searchVectors, deleteVectors, VectorInsertItem } from '../db';

const DEFAULT_DIM = 1536; // adjust to your embedding model dimension

export function initVectorHandlers(win: BrowserWindow) {
  ipcMain.handle('insertVectors', (_e, payload: { items: VectorInsertItem[]; dim?: number }) => {
    const dim = payload.dim || DEFAULT_DIM;
    return insertVectors(payload.items, dim);
  });
  ipcMain.handle('searchVectors', (_e, payload: { embedding: number[]; k?: number; dim?: number }) => {
    const dim = payload.dim || DEFAULT_DIM;
    const k = payload.k || 5;
    return searchVectors(payload.embedding, k, dim);
  });
  ipcMain.handle('deleteVectors', (_e, payload: { ids: string[] }) => {
    return deleteVectors(payload.ids || []);
  });
}
