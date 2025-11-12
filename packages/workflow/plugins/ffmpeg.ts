import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import ffmpeg from 'fluent-ffmpeg';

import { getResourcePath } from '../../../electron/main/utils/resources-path';
import { Plugin } from '../types';

function getFfmpegPaths(): { ffmpeg: string; ffprobe: string } | null {
  try {
    const ffmpegPath = getResourcePath('ffmpeg');
    const ffmpegDir = path.dirname(ffmpegPath);
    const ffmpegName = path.basename(ffmpegPath);
    // ffprobe 和 ffmpeg 在同一目录下，只是文件名不同
    const ffprobeName = ffmpegName.replace('ffmpeg', 'ffprobe');
    const ffprobePath = path.join(ffmpegDir, ffprobeName);

    if (fs.existsSync(ffmpegPath) && fs.existsSync(ffprobePath)) {
      return { ffmpeg: ffmpegPath, ffprobe: ffprobePath };
    }
  } catch {
    // 如果 getResourcePath 失败，返回 null
  }
  return null;
}

function existsInPath(cmd: string): boolean {
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' });
  return which.status === 0;
}

export const FfmpegPlugin: Plugin = {
  id: 'plugin:ffmpeg',
  label: 'FFmpeg',
  description: 'Provides media transcode and probe capabilities via FFmpeg/FFprobe',
  capabilities: ['transcode', 'probe', 'audio-extract'],
  installHint: '软件内置',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async isInstalled(_ctx) {
    // 首先尝试使用项目的 getResourcePath 获取 ffmpeg
    const paths = getFfmpegPaths();
    if (paths) {
      return true;
    }
    // fallback to PATH
    return existsInPath('ffmpeg') && existsInPath('ffprobe');
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async prepare(_ctx) {
    // 使用项目的 getResourcePath 获取 ffmpeg 路径
    const paths = getFfmpegPaths();
    if (paths) {
      if (fs.existsSync(paths.ffmpeg)) ffmpeg.setFfmpegPath(paths.ffmpeg);
      if (fs.existsSync(paths.ffprobe)) ffmpeg.setFfprobePath(paths.ffprobe);
    }
  }
};
