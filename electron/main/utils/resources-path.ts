import os from 'node:os';
import { getRealPath } from '.';

export function getResourcePath(binName: 'ffmpeg' | 'yt-dlp' | 'sprites' | 'resources' | 'providers'): string {
  switch (binName) {
    case 'ffmpeg':
      return getRealPath(
        `../ffmpeg/${os.platform()}/${os.arch()}/${os.platform() === 'darwin' ? 'ffmpeg' : 'ffmpeg.exe'}`,
        `./resources/ffmpeg/${os.platform()}/${os.arch()}/${os.platform() === 'darwin' ? 'ffmpeg' : 'ffmpeg.exe'}`
      );
    case 'yt-dlp':
      return getRealPath(
        `../yt-dlp/${os.platform()}/${os.platform() === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp.exe'}`,
        `./resources/yt-dlp/${os.platform()}/${os.platform() === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp.exe'}`
      );
    case 'resources':
      return getRealPath(`../`, `./resources`);
    case 'providers':
      return getRealPath(`../providers`, `./resources/providers`);
    case 'sprites':
      return getRealPath(`../sprites`, `./resources/sprites`);
    default:
      return getRealPath(
        `../ffmpeg/${os.platform()}/${os.arch()}/${os.platform() === 'darwin' ? 'ffmpeg' : 'ffmpeg.exe'}`,
        `./resources/ffmpeg/${os.platform()}/${os.arch()}/${os.platform() === 'darwin' ? 'ffmpeg' : 'ffmpeg.exe'}`
      );
  }
}
