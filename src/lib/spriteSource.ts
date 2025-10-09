import { SpriteSource } from '@/types/sprite'
import { makeResSrc } from '@/lib/resourceProtocol'

export function resolveSpriteSrc(source: SpriteSource): { url: string; type?: string } {
  if (source.src) return { url: source.src, type: source.type }
  if (source.localPath) return { url: makeResSrc(source.localPath), type: source.type }
  // fallback（理论上不应触发）
  return { url: '/idle.webm', type: 'video/webm' }
}


