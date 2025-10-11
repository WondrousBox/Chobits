import { ipcRenderer, contextBridge } from 'electron'
import type { SpriteAnimation } from '../../../src/types/sprite'

export type SpriteBridgeType = {
  list(): Promise<SpriteAnimation[]>
  get(id: string): Promise<SpriteAnimation | undefined>
  register(anim: Partial<SpriteAnimation> & { filePath?: string }): Promise<SpriteAnimation>
  remove(id: string, deleteFile?: boolean): Promise<{ ok: boolean }>
}

export const spriteBridge: SpriteBridgeType = {
  async list() {
    return ipcRenderer.invoke('sprite:list')
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
}

export default spriteBridge
