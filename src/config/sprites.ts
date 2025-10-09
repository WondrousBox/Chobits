import type { SpriteAnimation } from '@/types/sprite'

// 预置动画清单（可扩展）
const builtinSprites: SpriteAnimation[] = [
  {
    meta: {
      id: 'idle-default',
      title: 'Idle 默认站立',
      description: '默认的待机动画',
      tags: ['idle', 'default'],
    },
    source: {
      src: '/idle.webm',
      type: 'video/webm',
    },
    width: 180,
    height: 220,
    autoplay: true,
    muted: true,
    playsInline: true,
    loopStrategy: 'early',
  },
]

export default builtinSprites


