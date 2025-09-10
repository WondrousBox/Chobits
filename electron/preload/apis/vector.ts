import { ipcRenderer } from 'electron';
import { IPCParams } from '../type';

export type VectorBridgeParams = {
  'insertVectors': IPCParams<[{ items: Array<{ id?: string; content: string; metadata?: any; embedding: number[] }>; dim?: number }], { inserted: number }>;
  'searchVectors': IPCParams<[{ embedding: number[]; k?: number; dim?: number }], Array<{ id: string; content: string; metadata: any; score: number }>>;
  'deleteVectors': IPCParams<[{ ids: string[] }], { deleted: number }>;
};

const methods: Array<keyof VectorBridgeParams> = [
  'insertVectors',
  'searchVectors',
  'deleteVectors'
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
} as VectorBridgeType;
