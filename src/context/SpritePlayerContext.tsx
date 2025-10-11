import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { SpriteAnimation } from '@/types/sprite'

interface SpritePlayerContextValue {
  currentId: string | null
  current?: SpriteAnimation
  setCurrent: (id: string) => void
  list: () => SpriteAnimation[]
}

const SpritePlayerContext = createContext<SpritePlayerContextValue | null>(null)

export const SpritePlayerProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const [anims, setAnims] = useState<SpriteAnimation[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)

  useEffect(() => {
    let stopped = false
    const load = async () => {
      try {
        const items: SpriteAnimation[] = await window.YUA.sprite.list()
        if (stopped) return
        setAnims(items)
        setCurrentId(prev => prev ?? items[0]?.meta.id ?? null)
      } catch {
        // fallback: nothing
      }
    }
    load()
    return () => { stopped = true }
  }, [])

  const setCurrent = useCallback((id: string) => {
    if (anims.find(a => a.meta.id === id)) setCurrentId(id)
  }, [anims])

  const list = useCallback(() => anims, [anims])

  const value = useMemo(() => ({
    currentId,
    current: currentId ? anims.find(a => a.meta.id === currentId) : undefined,
    setCurrent,
    list,
  }), [currentId, anims, setCurrent, list])

  return (
    <SpritePlayerContext.Provider value={value}>
      {children}
    </SpritePlayerContext.Provider>
  )
}

export function useSpritePlayer() {
  const ctx = useContext(SpritePlayerContext)
  if (!ctx) throw new Error('useSpritePlayer must be used within SpritePlayerProvider')
  return ctx
}


