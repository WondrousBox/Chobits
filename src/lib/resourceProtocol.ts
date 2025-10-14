// Helper functions for building URLs to custom resource protocol
import type { SpriteAnimation } from '@/components/AIAssistant/messages/types'

export function makeResSrc(absPath: string) {
  const forward = absPath.replace(/\\/g, '/')
  return 'res://local/' + encodeURIComponent(forward)
}

export function makeWorkspaceResSrc(workspaceId: string, relativePath: string) {
  const forward = relativePath.replace(/\\/g, '/')
  return 'res://ws/' + workspaceId + '/' + encodeURIComponent(forward)
}

export function isImageFile(p?: string) {
  if (!p) return false
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(p)
}
export function isVideoFile(p?: string) {
  if (!p) return false
  return /\.(mp4|webm|ogg|mov|mkv|ogv)$/i.test(p)
}
export function isAudioFile(p?: string) {
  if (!p) return false
  return /\.(mp3|wav|m4a|flac|ogg|opus)$/i.test(p)
}

export function resolveSpriteSrc(source: SpriteAnimation['source']): { url: string; type?: string } {
  if (source.src) return { url: source.src, type: source.type }
  if (source.localPath) return { url: makeResSrc(source.localPath), type: source.type }
  // fallback（理论上不应触发）
  return { url: '/idle.webm', type: 'video/webm' }
}
