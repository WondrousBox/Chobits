import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { SpriteAnimation } from '@/types/sprite'
import builtinSprites from '@/config/sprites'
import { spriteRegistry } from '@/lib/spriteRegistry'

// 初始化注册内置动画（只注册一次）
if (spriteRegistry.list().length === 0) {
  spriteRegistry.register(...builtinSprites)
}

interface SpritePlayerContextValue {
  currentId: string | null
  current?: SpriteAnimation
  setCurrent: (id: string) => void
  register: (...anims: SpriteAnimation[]) => void
  list: () => SpriteAnimation[]
}

const SpritePlayerContext = createContext<SpritePlayerContextValue | null>(null)

export const SpritePlayerProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const [currentId, setCurrentId] = useState<string | null>(() => {
    return spriteRegistry.list()[0]?.meta.id ?? null
  })

  const setCurrent = useCallback((id: string) => {
    if (spriteRegistry.get(id)) setCurrentId(id)
  }, [])

  const register = useCallback((...anims: SpriteAnimation[]) => {
    spriteRegistry.register(...anims)
  }, [])

  const list = useCallback(() => spriteRegistry.list(), [])

  const value = useMemo(() => ({
    currentId,
    current: currentId ? spriteRegistry.get(currentId) : undefined,
    setCurrent,
    register,
    list,
  }), [currentId, setCurrent, register, list])

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


