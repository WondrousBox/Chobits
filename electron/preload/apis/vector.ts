import { ipcRenderer } from 'electron';
import { IPCParams } from '../type';

export type VectorBridgeParams = {
  'insertVectors': IPCParams<[{ items: Array<{ id?: string; content: string; metadata?: any; embedding: number[] }>; dim?: number }], { inserted: number }>;
  'searchVectors': IPCParams<[{ embedding: number[]; k?: number; dim?: number }], Array<{ id: string; content: string; metadata: any; score: number }>>;
  'deleteVectors': IPCParams<[{ ids: string[] }], { deleted: number }>;
  'embedText': IPCParams<[{ text: string; dim?: number }], number[]>;
  'indexDocuments': IPCParams<[{ items: Array<{ id?: string; content: string; metadata?: any }>; dim?: number }], { inserted: number }>;
  'searchByText': IPCParams<[{ text: string; k?: number; dim?: number }], Array<{ id: string; content: string; metadata: any; score: number }>>;
  'embedding:enqueueIndex': IPCParams<[{ items: Array<{ id?: string; content: string; metadata?: any }>; dim?: number; batchSize?: number; jobId?: string }], { jobId: string }>;
  'embedding:getJob': IPCParams<[{ jobId: string }], { id: string; total: number; done: number; status: string; error?: string } | null>;
  'embedding:cancelJob': IPCParams<[{ jobId: string }], { ok: boolean }>;
};

const methods: Array<keyof VectorBridgeParams> = [
  'insertVectors',
  'searchVectors',
  'deleteVectors',
  'embedText',
  'indexDocuments',
  'searchByText',
  'embedding:enqueueIndex',
  'embedding:getJob',
  'embedding:cancelJob'
];

export type VectorBridgeType = {
  [K in keyof VectorBridgeParams]: (
    ...args: VectorBridgeParams[K]["request"]
  ) => Promise<VectorBridgeParams[K]["response"]>;
};

const bridge: Record<string, any> = {};
methods.forEach(m => {
  bridge[m] = (...args: VectorBridgeParams[typeof m]['request']) => ipcRenderer.invoke(m, ...args);
});

export const vectorBridge = {
  ...bridge,
  onEmbeddingJob(cb: (job: any) => void): () => void {
    const listener = (_e: any, job: any) => cb(job);
    ipcRenderer.on('embedding:job', listener);
    return () => { ipcRenderer.off('embedding:job', listener); };
  },
  onEmbeddingProgress(cb: (p: { id: string; done: number; total: number; status?: string }) => void): () => void {
    const listener = (_e: any, p: any) => cb(p);
    ipcRenderer.on('embedding:progress', listener);
    return () => { ipcRenderer.off('embedding:progress', listener); };
  }
} as VectorBridgeType & {
  onEmbeddingJob(cb: (job: any) => void): () => void;
  onEmbeddingProgress(cb: (p: { id: string; done: number; total: number; status?: string }) => void): () => void;
};
