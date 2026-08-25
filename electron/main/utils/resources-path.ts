import os from 'node:os';

import { app } from 'electron';

import { getRealPath } from '.';
import { getResourceBinaryName } from './os';

export function getResourcePath(
  binName: 'ffmpeg' | 'recorder' | 'sherpa' | 'ffprobe' | 'yt-dlp' | 'sprites' | 'resources' | 'plugins' | 'providers' | 'logs' | 'workflows' | 'bun' | 'html'
): string | undefined {
  const platform = os.platform();
  const arch = os.arch();

  switch (binName) {
    case 'ffmpeg':
      return getRealPath(`../ffmpeg/${platform}/${arch}/${getResourceBinaryName('ffmpeg')}`, `./resources/ffmpeg/${platform}/${arch}/${getResourceBinaryName('ffmpeg')}`);
    case 'ffprobe':
      return getRealPath(`../ffmpeg/${platform}/${arch}/${getResourceBinaryName('ffprobe')}`, `./resources/ffmpeg/${platform}/${arch}/${getResourceBinaryName('ffprobe')}`);
    case 'yt-dlp':
      return getRealPath(`../yt-dlp/${platform}/${getResourceBinaryName('yt-dlp')}`, `./resources/yt-dlp/${platform}/${getResourceBinaryName('yt-dlp')}`);
    case 'bun':
      return getRealPath(`../bun/${platform}/${arch}/${getResourceBinaryName('bun')}`, `./resources/bun/${platform}/${arch}/${getResourceBinaryName('bun')}`);
    case 'sherpa':
      return getRealPath(`../sherpa`, `./resources/sherpa`);
    case 'resources':
      return getRealPath(`../`, `./resources`);
    case 'plugins':
      return getRealPath(`../plugins/plugins.json`, `./resources/plugins/plugins.json`);
    case 'providers':
      return getRealPath(`../providers`, `./resources/providers`);
    case 'sprites':
      return getRealPath(`../sprites`, `./resources/sprites`);
    case 'workflows':
      return getRealPath(`../workflows/preset.json`, `./resources/workflows/preset.json`);
    case 'logs':
      return app.getPath('logs');
    case 'html':
      return getRealPath(`../html`, `./resources/html`);
    case 'recorder':
      return getRealPath(`../recorder/${platform}/${arch}/${getResourceBinaryName('recorder')}`, `./resources/recorder/${platform}/${arch}/${getResourceBinaryName('recorder')}`);
    default:
      return getRealPath(`../ffmpeg/${platform}/${arch}/${getResourceBinaryName('ffmpeg')}`, `./resources/ffmpeg/${platform}/${arch}/${getResourceBinaryName('ffmpeg')}`);
  }
}
