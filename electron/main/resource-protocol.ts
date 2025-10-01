import { app, protocol } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import fscb from 'node:fs'

// Register scheme privileges early (module import time)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'res',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
])

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
}

let allowedRoots: string[] = []
let protocolHandled = false
// Map workspaceId -> resources root directory
const workspaceRoots: Record<string, string> = {}

export function addAllowedResourceRoot(root: string) {
  try {
    const real = path.resolve(root)
    if (!allowedRoots.includes(real)) {
      allowedRoots.push(real)
      // console.log('[protocol res] root added:', real)
    }
  } catch {}
}

export function addWorkspaceResourceRoot(workspaceId: string, root: string) {
  try {
    const real = path.resolve(root)
    workspaceRoots[workspaceId] = real
    addAllowedResourceRoot(real)
  } catch {}
}

function isAllowed(target: string) {
  return allowedRoots.some(r => target === r || target.startsWith(r + path.sep))
}

// URL Patterns:
// 1) Absolute path:  res://local/<encodeURIComponent(C:/path/to/file.ext with forward slashes)>
// 2) Workspace rel:  res://ws/<workspaceId>/<encodeURIComponent(relative/path.ext)>
// 3) (Future) Hash-based: res://id/<resourceId> (not implemented yet)
// This handler resolves to a file inside allowed roots / workspace roots and returns as a Response.

export async function setupResourceProtocol() {
  if (protocolHandled) return
  const register = async () => {
    if (protocolHandled) return
    // Provide a default root so relative or empty list does not block everything.
    addAllowedResourceRoot(path.join(process.cwd(), 'resources'))

    await protocol.handle('res', async (request): Promise<Response> => {
      try {
        const url = new URL(request.url)
        const host = url.hostname // 'local' | 'ws' | etc
        let pathname = url.pathname // leading '/'
        if (pathname.startsWith('/')) pathname = pathname.slice(1)
        if (!pathname) return new Response('Empty path', { status: 400 })

        let abs: string | null = null
        if (host === 'local') {
          const decodedForward = decodeURIComponent(pathname)
          let p = decodedForward
          if (/^[a-zA-Z]:\//.test(p)) {
            // Windows drive absolute
          } else if (p.startsWith('/')) {
            // POSIX absolute
          } else {
            if (allowedRoots.length === 0) addAllowedResourceRoot(path.join(process.cwd(), 'resources'))
            p = path.join(allowedRoots[0], p)
          }
          abs = path.normalize(p)
        } else if (host === 'ws') {
          // workspace pattern: /<workspaceId>/<encodedRel>
            const firstSlash = pathname.indexOf('/')
            if (firstSlash === -1) return new Response('Bad workspace path', { status: 400 })
            const wsId = pathname.slice(0, firstSlash)
            const relEncoded = pathname.slice(firstSlash + 1)
            const root = workspaceRoots[wsId]
            if (!root) return new Response('Workspace not registered', { status: 404 })
            const relForward = decodeURIComponent(relEncoded)
            abs = path.normalize(path.join(root, relForward))
        } else {
          return new Response('Unsupported host', { status: 400 })
        }

        if (!abs) return new Response('Resolve error', { status: 500 })
        if (!isAllowed(abs)) return new Response('Forbidden', { status: 403 })
        if (!fscb.existsSync(abs) || !fscb.statSync(abs).isFile()) return new Response('Not Found', { status: 404 })

        const ext = path.extname(abs).toLowerCase()
        const mime = MIME_MAP[ext] || guessMime(ext) || 'application/octet-stream'

        // Support simple Range requests for media (video/audio)
        const range = request.headers.get('Range')
        if (range) {
          try {
            const stat = fscb.statSync(abs)
            const size = stat.size
            const m = range.match(/bytes=([0-9]*)-([0-9]*)/)
            if (m) {
              let start = m[1] ? parseInt(m[1], 10) : 0
              let end = m[2] ? parseInt(m[2], 10) : size - 1
              if (isNaN(start) || start < 0) start = 0
              if (isNaN(end) || end >= size) end = size - 1
              if (start > end) return new Response('Range Not Satisfiable', { status: 416 })
              const chunkSize = end - start + 1
              const stream = fscb.createReadStream(abs, { start, end })
              const headers: Record<string, string> = {
                'Content-Type': mime,
                'Content-Range': `bytes ${start}-${end}/${size}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': String(chunkSize),
              }
              // Cast Node stream to any (Response can handle it internally in Electron runtime)
              return new Response(stream as any, { status: 206, headers })
            }
          } catch {}
        }

        // Non-range: small/normal file read fully (images, text, small media)
        const buf = await fs.readFile(abs)
        return new Response(new Uint8Array(buf), { status: 200, headers: { 'Content-Type': mime } })
      } catch (e: any) {
        return new Response('Internal Error', { status: 500 })
      }
    })
    protocolHandled = true
  }

  if (app.isReady()) await register(); else app.once('ready', register)
}

// Helper for renderer (documentation): build src for a given absolute path
// function makeResSrc(absPath: string) => 'res://local/' + encodeURIComponent(absPath.replace(/\\/g,'/'))
// function makeWorkspaceResSrc(workspaceId: string, rel: string) => 'res://ws/' + workspaceId + '/' + encodeURIComponent(rel.replace(/\\/g,'/'))

function guessMime(ext: string): string | undefined {
  switch (ext) {
    case '.mp4': return 'video/mp4'
    case '.webm': return 'video/webm'
    case '.ogg': return 'video/ogg'
    case '.mov': return 'video/quicktime'
    case '.mkv': return 'video/x-matroska'
    case '.mp3': return 'audio/mpeg'
    case '.wav': return 'audio/wav'
    case '.m4a': return 'audio/mp4'
    case '.flac': return 'audio/flac'
    case '.opus': return 'audio/ogg'
    case '.ogv': return 'video/ogg'
    case '.txt': return 'text/plain; charset=utf-8'
    case '.json': return 'application/json'
    case '.pdf': return 'application/pdf'
    default: return undefined
  }
}
