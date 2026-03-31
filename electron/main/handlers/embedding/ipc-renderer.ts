import { ipcRenderer } from 'electron';

import { IpcParams } from '../types';

export type VectorIpcParams = {
  insertVectors: IpcParams<[{ items: Array<{ id?: string; content: string; metadata?: any; embedding: number[]; providerId?: string; model?: string }>; dim?: number }], { inserted: number }>;
  searchVectors: IpcParams<[{ embedding: number[]; k?: number; dim?: number; providerId?: string; model?: string }], Array<{ id: string; content: string; metadata: any; score: number }>>;
  deleteVectors: IpcParams<[{ ids: string[] }], { deleted: number }>;
  'vector:getStatistics': IpcParams<
    [],
    {
      providers: Array<{
        providerId: string;
        models: Array<{ model: string | null; dim: number | null; count: number }>;
        total: number;
      }>;
    }
  >;
};

const methods: Array<keyof VectorIpcParams> = ['insertVectors', 'searchVectors', 'deleteVectors', 'vector:getStatistics'];

export type VectorIpcType = {
  [K in keyof VectorIpcParams]: (...args: VectorIpcParams[K]['request']) => Promise<VectorIpcParams[K]['response']>;
};

const bridge: Record<string, any> = {};
methods.forEach((m) => {
  bridge[m] = (...args: VectorIpcParams[typeof m]['request']) => ipcRenderer.invoke(m, ...args);
});

export const vectorIpcRenderer = bridge as VectorIpcType;
