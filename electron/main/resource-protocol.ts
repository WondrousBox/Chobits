import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

import { getResourcePath } from '@packages/common/utils';
import { app, protocol } from 'electron';

// Register scheme privileges early (module import time)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'res',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon'
};

const allowedRoots: string[] = [];
let isProtocolHandled = false;
// Map workspaceId -> resources root directory
const workspaceRoots: Record<string, string> = {};

export function addAllowedResourceRoot(root: string): void {
  const real = path.resolve(root);
  if (!allowedRoots.includes(real)) {
    allowedRoots.push(real);
    // console.log('[protocol res] root added:', real)
  }
}

export function removeAllowedResourceRoot(root: string): void {
  const real = path.resolve(root);
  const index = allowedRoots.findIndex((item) => item === real);
  if (index >= 0) {
    allowedRoots.splice(index, 1);
  }
}

export function addWorkspaceResourceRoot(workspaceId: string, root: string): void {
  try {
    const real = path.resolve(root);
    workspaceRoots[workspaceId] = real;
    addAllowedResourceRoot(real);
  } catch {
    //
  }
}

function isPathAllowed(target: string): boolean {
  return allowedRoots.some((r) => target === r || target.startsWith(r + path.sep));
}

/** 校验目标路径是否位于任一已注册资源根之内(供 IPC 入口在注册临时根前校验,防止任意目录注册) */
export function isPathWithinAllowedRoots(target: string): boolean {
  try {
    return isPathAllowed(path.resolve(target));
  } catch {
    return false;
  }
}

// URL Patterns:
// 1) Absolute path:  res://local/<encodeURIComponent(C:/path/to/file.ext with forward slashes)>
// 2) Workspace rel:  res://ws/<workspaceId>/<encodeURIComponent(relative/path.ext)>
// 3) (Future) Hash-based: res://id/<resourceId> (not implemented yet)
// This handler resolves to a file inside allowed roots / workspace roots and returns as a Response.

export async function setupResourceProtocol(): Promise<void> {
  if (isProtocolHandled) return;
  const register = async (): Promise<void> => {
    if (isProtocolHandled) return;
    // extraResources are placed directly under Electron's Resources directory
    // in packaged apps, while development assets live under <appPath>/resources.
    const bundledResourceRoot = getResourcePath('resources');
    if (!bundledResourceRoot) throw new Error('Bundled resource root is unavailable');
    addAllowedResourceRoot(bundledResourceRoot);

    await protocol.handle('res', async (request): Promise<Response> => {
      try {
        const url = new URL(request.url);
        const host = url.hostname; // 'local' | 'ws' | etc
        let pathname = url.pathname; // leading '/'
        if (pathname.startsWith('/')) pathname = pathname.slice(1);
        if (!pathname) return new Response('Empty path', { status: 400 });

        let abs: string | null = null;
        if (host === 'local') {
          const decodedForward = decodeURIComponent(pathname);
          let p = decodedForward;
          if (/^[a-zA-Z]:\//.test(p)) {
            // Windows drive absolute
          } else if (p.startsWith('/')) {
            // POSIX absolute
          } else {
            p = path.join(bundledResourceRoot, p);
          }
          abs = path.normalize(p);
        } else if (host === 'ws') {
          // workspace pattern: /<workspaceId>/<encodedRel>
          const firstSlash = pathname.indexOf('/');
          if (firstSlash === -1) return new Response('Bad workspace path', { status: 400 });
          const wsId = pathname.slice(0, firstSlash);
          const relEncoded = pathname.slice(firstSlash + 1);
          const root = workspaceRoots[wsId];
          if (!root) return new Response('Workspace not registered', { status: 404 });
          const relForward = decodeURIComponent(relEncoded);
          abs = path.normalize(path.join(root, relForward));
        } else {
          return new Response('Unsupported host', { status: 400 });
        }

        if (!abs) return new Response('Resolve error', { status: 500 });
        if (!isPathAllowed(abs)) return new Response('Forbidden', { status: 403 });
        if (!fsSync.existsSync(abs) || !fsSync.statSync(abs).isFile()) return new Response('Not Found', { status: 404 });

        const ext = path.extname(abs).toLowerCase();
        const mime = MIME_MAP[ext] || guessMimeType(ext) || 'application/octet-stream';

        // Common headers for CORS/media friendliness
        const baseHeaders: Record<string, string> = {
          'Content-Type': mime,
          'Access-Control-Allow-Origin': '*',
          'Cross-Origin-Resource-Policy': 'cross-origin',
          'Accept-Ranges': 'bytes'
        };

        // Support simple Range requests for media (video/audio)
        const range = request.headers.get('Range');
        if (range) {
          try {
            const stat = fsSync.statSync(abs);
            const size = stat.size;
            const m = range.match(/bytes=([0-9]*)-([0-9]*)/);
            if (m) {
              let start = m[1] ? parseInt(m[1], 10) : 0;
              let end = m[2] ? parseInt(m[2], 10) : size - 1;
              if (isNaN(start) || start < 0) start = 0;
              if (isNaN(end) || end >= size) end = size - 1;
              if (start > end) return new Response('Range Not Satisfiable', { status: 416 });
              const chunkSize = end - start + 1;
              // Use Web ReadableStream for better cross-platform support
              const nodeStream = fsSync.createReadStream(abs, { start, end });
              const webStream = (Readable as any).toWeb ? (Readable as any).toWeb(nodeStream) : (nodeStream as any);
              const headers: Record<string, string> = {
                ...baseHeaders,
                'Content-Range': `bytes ${start}-${end}/${size}`,
                'Content-Length': String(chunkSize)
              };
              return new Response(webStream, { status: 206, headers });
            }
          } catch {
            //
          }
        }

        // Handle HEAD request (metadata only)
        if (request.method === 'HEAD') {
          try {
            const stat = fsSync.statSync(abs);
            const headers: Record<string, string> = {
              ...baseHeaders,
              'Content-Length': String(stat.size)
            };
            return new Response(null, { status: 200, headers });
          } catch {
            //
          }
        }

        // Non-range: small/normal file read fully (images, text, small media)
        const buf = await fs.readFile(abs);
        return new Response(new Uint8Array(buf), { status: 200, headers: { ...baseHeaders, 'Content-Length': String(buf.byteLength) } });
      } catch (e: any) {
        console.log(e);
        return new Response('Internal Error', { status: 500 });
      }
    });
    isProtocolHandled = true;
  };

  if (app.isReady()) await register();
  else app.once('ready', register);
}

// Helper for renderer (documentation): build src for a given absolute path
// function makeResSrc(absPath: string) => 'res://local/' + encodeURIComponent(absPath.replace(/\\/g,'/'))
// function makeWorkspaceResSrc(workspaceId: string, rel: string) => 'res://ws/' + workspaceId + '/' + encodeURIComponent(rel.replace(/\\/g,'/'))

function guessMimeType(ext: string): string | undefined {
  switch (ext) {
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.ogg':
      return 'video/ogg';
    case '.mov':
      return 'video/quicktime';
    case '.mkv':
      return 'video/x-matroska';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.m4a':
      return 'audio/mp4';
    case '.flac':
      return 'audio/flac';
    case '.opus':
      return 'audio/ogg';
    case '.ogv':
      return 'video/ogg';
    case '.txt':
      return 'text/plain; charset=utf-8';
    case '.json':
      return 'application/json';
    case '.pdf':
      return 'application/pdf';
    default:
      return undefined;
  }
}
