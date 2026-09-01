import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

import type { Plugin } from '@chobits/workflow';
import ffmpeg from 'fluent-ffmpeg';

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
  async isInstalled(ctx) {
    // 优先使用 ExecutionContext 中注入的路径
    if (ctx.ffmpegPath && ctx.ffprobePath && fs.existsSync(ctx.ffmpegPath) && fs.existsSync(ctx.ffprobePath)) {
      return true;
    }
    // fallback 到系统 PATH
    return existsInPath('ffmpeg') && existsInPath('ffprobe');
  },
  async prepare(ctx) {
    // 如果应用通过 ctx 提供了 ffmpeg/ffprobe 路径，则优先使用这些路径
    if (ctx.ffmpegPath && fs.existsSync(ctx.ffmpegPath)) {
      ffmpeg.setFfmpegPath(ctx.ffmpegPath);
    }
    if (ctx.ffprobePath && fs.existsSync(ctx.ffprobePath)) {
      ffmpeg.setFfprobePath(ctx.ffprobePath);
    }
  }
};
