import { BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import fscb from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { SpriteAnimation } from '@/types/sprite'
import { addAllowedResourceRoot } from '../resource-protocol'
import { getFfmpegPath } from '../utils/bin-path'

type SpriteIndex = {
  version: 1
  items: SpriteAnimation[]
}

async function ensureDirs(dir: string) {
  try { await fs.mkdir(dir, { recursive: true }) } catch {}
}

async function getWorkspaceSpritesDir(): Promise<string> {
  // Global shared resources folder (not tied to workspace), similar to ffmpeg path
  const baseResources = getFfmpegPath('resources')
  // Make sure our custom protocol can serve this directory
  try { addAllowedResourceRoot(baseResources) } catch {}
  const spritesDir = path.join(baseResources, 'sprites')
  await ensureDirs(spritesDir)
  return spritesDir
}

async function readIndex(): Promise<SpriteIndex> {
  const dir = await getWorkspaceSpritesDir()
  const idxPath = path.join(dir, 'index.json')
  if (!fscb.existsSync(idxPath)) {
    return { version: 1, items: [] }
  }
  try {
    const raw = await fs.readFile(idxPath, 'utf-8')
    const data = JSON.parse(raw)
    if (Array.isArray(data.items)) {
      // Normalize relative localPath to absolute path under the same-level folder of `dir` (i.e., parent of sprites dir)
      const baseDir = path.dirname(dir)
      const items = (data.items as SpriteAnimation[]).map((item) => {
        const lp = (item as any)?.source?.localPath
        // Skip if not a string
        if (typeof lp !== 'string') return item
        // Treat URL-like strings (e.g. resource://, file://, http://) as-is
        const isUrlLike = /^[a-zA-Z]+:\/\//.test(lp)
        if (isUrlLike || path.isAbsolute(lp)) return item
        // Resolve relative path against the parent of the sprites directory
        const resolved = path.resolve(baseDir, lp)
        return { ...item, source: { ...item.source, localPath: resolved } }
      })
      return { version: 1, items }
    }
  } catch {}
  return { version: 1, items: [] }
}

async function writeIndex(index: SpriteIndex) {
  const dir = await getWorkspaceSpritesDir()
  const idxPath = path.join(dir, 'index.json')
  await fs.writeFile(idxPath, JSON.stringify(index, null, 2), 'utf-8')
}

function inferMimeFromExt(ext: string): string | undefined {
  switch (ext.toLowerCase()) {
    case '.mp4': return 'video/mp4'
    case '.webm': return 'video/webm'
    case '.mov': return 'video/quicktime'
    case '.mkv': return 'video/x-matroska'
    default: return undefined
  }
}

export function initSpriteHandlers(_win: BrowserWindow) {
  ipcMain.handle('sprite:list', async () => {
    const idx = await readIndex()
    return idx.items
  })

  ipcMain.handle('sprite:get', async (_e, payload: { id: string }) => {
    const idx = await readIndex()
    return idx.items.find(i => i.meta.id === payload.id)
  })

  ipcMain.handle('sprite:register', async (_e, payload: { animation?: Partial<SpriteAnimation> & { filePath?: string } }) => {
    const anim = payload?.animation || {}
    const srcPath = anim.filePath
    const id = anim.meta?.id || randomUUID()
    const title = anim.meta?.title || id
    const spritesDir = await getWorkspaceSpritesDir()

    let finalPath: string | undefined
    let type = anim.source?.type
    if (srcPath && fscb.existsSync(srcPath)) {
      const ext = path.extname(srcPath) || '.webm'
      const baseName = `${id}${ext}`
      finalPath = path.join(spritesDir, baseName)
      let counter = 1
      while (fscb.existsSync(finalPath)) {
        finalPath = path.join(spritesDir, `${id}-${counter}${ext}`)
        counter++
      }
      await fs.copyFile(srcPath, finalPath)
      type = type || inferMimeFromExt(ext) || 'video/webm'
    } else if (anim.source?.localPath) {
      // trust provided localPath if inside spritesDir
      finalPath = anim.source.localPath
    }

    const newItem: SpriteAnimation = {
      meta: { id, title, description: anim.meta?.description, tags: anim.meta?.tags, coverSrc: anim.meta?.coverSrc },
      source: { localPath: finalPath!, type: type || 'video/webm' },
      width: anim.width ?? 180,
      height: anim.height ?? 220,
      autoplay: anim.autoplay ?? true,
      muted: anim.muted ?? true,
      playsInline: anim.playsInline ?? true,
      loopStrategy: anim.loopStrategy ?? 'early',
      cutoffSeconds: anim.cutoffSeconds,
      durationMs: anim.durationMs,
    }

    const idx = await readIndex()
    const existedIdx = idx.items.findIndex(i => i.meta.id === id)
    if (existedIdx >= 0) idx.items.splice(existedIdx, 1, newItem); else idx.items.push(newItem)
    await writeIndex(idx)
    return newItem
  })

  ipcMain.handle('sprite:remove', async (_e, payload: { id: string; deleteFile?: boolean }) => {
    const { id, deleteFile } = payload || ({} as any)
    const idx = await readIndex()
    const i = idx.items.findIndex(a => a.meta.id === id)
    if (i === -1) return { ok: false }
    const [removed] = idx.items.splice(i, 1)
    await writeIndex(idx)
    try {
      if (deleteFile && removed?.source?.localPath) {
        await fs.unlink(removed.source.localPath).catch(() => {})
      }
    } catch {}
    return { ok: true }
  })
}
