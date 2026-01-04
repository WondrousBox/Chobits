import { ipcRenderer } from 'electron';

import { IpcParams } from '../types';

export type VectorIpcParams = {
  insertVectors: IpcParams<[{ items: Array<{ id?: string; content: string; metadata?: any; embedding: number[]; providerId?: string; model?: string }>; dim?: number }], { inserted: number }>;
  searchVectors: IpcParams<[{ embedding: number[]; k?: number; dim?: number; providerId?: string; model?: string }], Array<{ id: string; content: string; metadata: any; score: number }>>;
  deleteVectors: IpcParams<[{ ids: string[] }], { deleted: number }>;
  embedText: IpcParams<[{ text: string; dim?: number }], number[]>;
  indexDocuments: IpcParams<[{ items: Array<{ id?: string; content: string; metadata?: any }>; dim?: number }], { inserted: number }>;
  searchByText: IpcParams<[{ text: string; k?: number; dim?: number; providerId?: string; model?: string }], Array<{ id: string; content: string; metadata: any; score: number }>>;
  findDocumentsNeedingReembedding: IpcParams<
    [{ providerId: string; model: string; dim?: number }],
    Array<{
      id: string;
      content: string;
      metadata: any;
      currentProviderId: string | null;
      currentModel: string | null;
      currentDim: number | null;
    }>
  >;
  reembedDocuments: IpcParams<[{ ids: string[]; providerId: string; model: string; dim: number; useProvider?: string }], { reembedded: number; failed: number }>;
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
  'embedding:enqueueIndex': IpcParams<[{ items: Array<{ id?: string; content: string; metadata?: any }>; dim?: number; batchSize?: number; jobId?: string }], { jobId: string }>;
  'embedding:getJob': IpcParams<[{ jobId: string }], { id: string; total: number; done: number; status: string; error?: string } | null>;
  'embedding:cancelJob': IpcParams<[{ jobId: string }], { ok: boolean }>;
};

const methods: Array<keyof VectorIpcParams> = [
  'insertVectors',
  'searchVectors',
  'deleteVectors',
  'embedText',
  'indexDocuments',
  'searchByText',
  'findDocumentsNeedingReembedding',
  'reembedDocuments',
  'vector:getStatistics',
  'embedding:enqueueIndex',
  'embedding:getJob',
  'embedding:cancelJob'
];

export type VectorIpcType = {
  [K in keyof VectorIpcParams]: (...args: VectorIpcParams[K]['request']) => Promise<VectorIpcParams[K]['response']>;
};

const bridge: Record<string, any> = {};
methods.forEach((m) => {
  bridge[m] = (...args: VectorIpcParams[typeof m]['request']) => ipcRenderer.invoke(m, ...args);
});

export const vectorIpcRenderer = {
  ...bridge,
  onEmbeddingJob(cb: (job: any) => void): () => void {
    const listener = (_e: any, job: any): void => cb(job);
    ipcRenderer.on('embedding:job', listener);
    return () => {
      ipcRenderer.off('embedding:job', listener);
    };
  },
  onEmbeddingProgress(cb: (p: { id: string; done: number; total: number; status?: string }) => void): () => void {
    const listener = (_e: any, p: any): void => cb(p);
    ipcRenderer.on('embedding:progress', listener);
    return () => {
      ipcRenderer.off('embedding:progress', listener);
    };
  }
} as VectorIpcType & {
  onEmbeddingJob(cb: (job: any) => void): () => void;
  onEmbeddingProgress(cb: (p: { id: string; done: number; total: number; status?: string }) => void): () => void;
};
