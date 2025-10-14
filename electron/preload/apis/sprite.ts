import { ipcRenderer, contextBridge } from 'electron'
import type { SpriteAnimation } from '@/components/AIAssistant/messages/types'

export type SpriteBridgeType = {
  list(): Promise<SpriteAnimation[]>
  listByEvent(eventType?: string): Promise<SpriteAnimation[]>
  get(id: string): Promise<SpriteAnimation | undefined>
  register(anim: Partial<SpriteAnimation> & { filePath?: string }): Promise<SpriteAnimation>
  remove(id: string, deleteFile?: boolean): Promise<{ ok: boolean }>
  updateMeta(id: string, meta: Partial<SpriteAnimation['meta']>): Promise<{ ok: boolean; item?: SpriteAnimation }>
}

export const spriteBridge: SpriteBridgeType = {
  async list() {
    return ipcRenderer.invoke('sprite:list')
  },
  async listByEvent(eventType?: string) {
    return ipcRenderer.invoke('sprite:listByEvent', { eventType })
  },
  async get(id: string) {
    return ipcRenderer.invoke('sprite:get', { id })
  },
  async register(anim) {
    return ipcRenderer.invoke('sprite:register', { animation: anim })
  },
  async remove(id, deleteFile) {
    return ipcRenderer.invoke('sprite:remove', { id, deleteFile })
  },
  async updateMeta(id, meta) {
    return ipcRenderer.invoke('sprite:updateMeta', { id, meta })
  },
}

export default spriteBridge
