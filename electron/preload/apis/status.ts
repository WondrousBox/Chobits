import { ipcRenderer } from 'electron'
import type { IPCParams } from '../type'

export type RoleProfile = {
  name: string
  mood?: string
  level?: number
  favor?: number
  description?: string
}

export type StatusOverview = {
  database: { path: string; dir: string }
  workspace: any | null
  resources: { total: number; totalSizeBytes: number; byType: Array<{ type: string; count: number; size: number }>; thumbnails: { withThumb: number; withoutThumb: number } }
  documents: { total: number; withEmbedding: number; byDocType: Array<{ docType: string | null; count: number }> }
  vectors: { enabled: boolean; total: number }
  recycleBin: { total: number }
  system: { userDataDir: string }
}

export type StatusBridgeParams = {
  'status:getRole': IPCParams<[void], { ok: boolean; role: RoleProfile }>
  'status:updateRole': IPCParams<[{ patch: Partial<RoleProfile> }], { ok: boolean; role: RoleProfile }>
  'status:getOverview': IPCParams<[void], { ok: boolean } & StatusOverview>
}

const methods: Array<keyof StatusBridgeParams> = ['status:getRole', 'status:updateRole', 'status:getOverview']

export type StatusBridgeType = {
  [K in keyof StatusBridgeParams]: (
    ...args: StatusBridgeParams[K]['request']
  ) => Promise<StatusBridgeParams[K]['response']>
}

const bridge: Record<string, any> = {}
methods.forEach((m) => {
  bridge[m] = (...args: any[]) => ipcRenderer.invoke(m as string, ...args)
})

export const statusBridge = bridge as StatusBridgeType
