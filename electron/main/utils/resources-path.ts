import os from 'node:os';
import path from 'node:path';

import { app } from 'electron';

import { getRealPath } from '.';

export function getResourcePath(binName: 'ffmpeg' | 'recorder' | 'sherpa' | 'ffprobe' | 'yt-dlp' | 'sprites' | 'resources' | 'plugins' | 'providers' | 'logs' | 'workflows'): string | undefined {
  switch (binName) {
    case 'ffmpeg':
      return getRealPath(
        `../ffmpeg/${os.platform()}/${os.arch()}/${os.platform() === 'darwin' ? 'ffmpeg' : 'ffmpeg.exe'}`,
        `./resources/ffmpeg/${os.platform()}/${os.arch()}/${os.platform() === 'darwin' ? 'ffmpeg' : 'ffmpeg.exe'}`
      );
    case 'ffprobe':
      return getRealPath(
        `../ffmpeg/${os.platform()}/${os.arch()}/${os.platform() === 'darwin' ? 'ffprobe' : 'ffprobe.exe'}`,
        `./resources/ffmpeg/${os.platform()}/${os.arch()}/${os.platform() === 'darwin' ? 'ffprobe' : 'ffprobe.exe'}`
      );
    case 'yt-dlp':
      return getRealPath(
        `../yt-dlp/${os.platform()}/${os.platform() === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp.exe'}`,
        `./resources/yt-dlp/${os.platform()}/${os.platform() === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp.exe'}`
      );
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
    case 'recorder':
      return getRealPath(
        `../recorder/${os.platform()}/${os.arch()}/${os.platform() === 'darwin' ? 'recorder' : 'recorder.exe'}`,
        `./resources/recorder/${os.platform()}/${os.arch()}/${os.platform() === 'darwin' ? 'recorder' : 'recorder.exe'}`
      );
    default:
      return getRealPath(
        `../ffmpeg/${os.platform()}/${os.arch()}/${os.platform() === 'darwin' ? 'ffmpeg' : 'ffmpeg.exe'}`,
        `./resources/ffmpeg/${os.platform()}/${os.arch()}/${os.platform() === 'darwin' ? 'ffmpeg' : 'ffmpeg.exe'}`
      );
  }
}
