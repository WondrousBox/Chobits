import os from 'node:os';

import { app } from 'electron';

import { getRealPath } from './env';
import { getResourceBinaryName } from './os';

export function getResourcePath(binName: 'ffmpeg' | 'sherpa' | 'ffprobe' | 'characters' | 'resources' | 'plugins' | 'providers' | 'logs' | 'html'): string | undefined {
  const platform = os.platform();
  const arch = os.arch();

  switch (binName) {
    case 'ffmpeg':
      return getRealPath(`../ffmpeg/${platform}/${arch}/${getResourceBinaryName('ffmpeg')}`, `./resources/ffmpeg/${platform}/${arch}/${getResourceBinaryName('ffmpeg')}`);
    case 'ffprobe':
      return getRealPath(`../ffmpeg/${platform}/${arch}/${getResourceBinaryName('ffprobe')}`, `./resources/ffmpeg/${platform}/${arch}/${getResourceBinaryName('ffprobe')}`);
    case 'sherpa':
      return getRealPath(`../sherpa`, `./resources/sherpa`);
    case 'resources':
      return getRealPath(`../`, `./resources`);
    case 'plugins':
      return getRealPath(`../plugins/plugins.json`, `./resources/plugins/plugins.json`);
    case 'providers':
      return getRealPath(`../providers`, `./resources/providers`);
    case 'characters':
      return getRealPath(`../characters`, `./resources/characters`);
    case 'logs':
      return app.getPath('logs');
    case 'html':
      return getRealPath(`../html`, `./resources/html`);
    default:
      return getRealPath(`../ffmpeg/${platform}/${arch}/${getResourceBinaryName('ffmpeg')}`, `./resources/ffmpeg/${platform}/${arch}/${getResourceBinaryName('ffmpeg')}`);
  }
}
