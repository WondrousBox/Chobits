import { useEffect } from 'react'
import useSpriteConductor from './useSpriteConductor'
import { subscribeSpriteEvents } from '../events/spriteEvents'

export default function useSpriteEventController() {
  const sprite = useSpriteConductor()

  useEffect(() => {
    // Local event bus
    const off = subscribeSpriteEvents((evt) => {
      switch (evt.type) {
        case 'idle':
          sprite.to('idle')
          break
        case 'click':
          sprite.playOnce('click')
          break
        case 'drop':
          sprite.playOnce('drop', { durationMs: 600 })
          break
        case 'hold:start':
          sprite.playOnce('hold', { durationMs: 300 })
          break
        case 'hold:end':
          sprite.to('idle')
          break
        case 'drag:start':
          sprite.to('dragging')
          break
        case 'drag:end':
          sprite.to('idle')
          break
        case 'walk:start':
          sprite.to('walking')
          break
        case 'walk:end':
          sprite.to('idle')
          break
        case 'run:start':
          sprite.to('running')
          break
        case 'run:end':
          sprite.to('idle')
          break
        default:
          break
      }
    })

    // IPC bridge from main process
    const onSpriteCommand = (_: any, action: string, payload?: any) => {
      switch (action) {
        case 'sprite:idle':
          sprite.to('idle'); break
        case 'sprite:click':
          sprite.playOnce('click'); break
        case 'sprite:drag:start':
          sprite.to('dragging'); break
        case 'sprite:drag:end':
          sprite.to('idle'); break
        case 'sprite:walk:start':
          sprite.to('walking'); break
        case 'sprite:walk:end':
          sprite.to('idle'); break
        case 'sprite:run:start':
          sprite.to('running'); break
        case 'sprite:run:end':
          sprite.to('idle'); break
        case 'sprite:drop':
          sprite.playOnce('drop', { durationMs: payload?.durationMs || 600 }); break
        default:
          break
      }
    }
    window.ipcRenderer?.on('sprite-command', onSpriteCommand)

    return () => {
      off()
      window.ipcRenderer?.off('sprite-command', onSpriteCommand as any)
    }
  }, [sprite])
}
