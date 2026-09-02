import { makeResSrc } from '@/lib/resource-protocol';

import { SpriteAnimation } from '../types';

export function resolveSpriteSrc(source: SpriteAnimation['source']): { url: string; type?: string } {
  if (source.src) return { url: source.src, type: source.type };
  if (source.localPath) return { url: makeResSrc(source.localPath), type: source.type };
  // fallback（理论上不应触发）
  return { url: '/idle.webm', type: 'video/webm' };
}
