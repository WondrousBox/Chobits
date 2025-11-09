import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import ffmpeg from 'fluent-ffmpeg';

import { Plugin } from '../types';

function getBinaryCandidates(resourcesDir: string): { ffmpeg: string; ffprobe: string }[] {
  const plat = process.platform;
  const arch = process.arch;
  const base = path.join(resourcesDir, 'ffmpeg');
  const candidates: { ffmpeg: string; ffprobe: string }[] = [];
  if (plat === 'darwin') {
    candidates.push({ ffmpeg: path.join(base, 'darwin', arch, 'ffmpeg'), ffprobe: path.join(base, 'darwin', arch, 'ffprobe') });
    candidates.push({ ffmpeg: path.join(base, 'darwin', 'ffmpeg'), ffprobe: path.join(base, 'darwin', 'ffprobe') });
  } else if (plat === 'win32') {
    candidates.push({ ffmpeg: path.join(base, 'win32', arch, 'ffmpeg.exe'), ffprobe: path.join(base, 'win32', arch, 'ffprobe.exe') });
  } else if (plat === 'linux') {
    candidates.push({ ffmpeg: path.join(base, 'linux', arch, 'ffmpeg'), ffprobe: path.join(base, 'linux', arch, 'ffprobe') });
  }
  return candidates;
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
  installHint:
    process.platform === 'darwin'
      ? 'pnpm run download-ffmpeg-darwin-arm64'
      : process.platform === 'win32'
        ? 'pnpm run download-ffmpeg-win32-x64'
        : 'Install FFmpeg & FFprobe via your package manager (e.g. apt, yum, pacman)',
  async isInstalled(ctx) {
    const candidates = getBinaryCandidates(ctx.resourcesDir);
    for (const c of candidates) {
      if (fs.existsSync(c.ffmpeg) && fs.existsSync(c.ffprobe)) return true;
    }
    // fallback to PATH
    return existsInPath('ffmpeg') && existsInPath('ffprobe');
  },
  async prepare(ctx) {
    const candidates = getBinaryCandidates(ctx.resourcesDir);
    for (const c of candidates) {
      if (fs.existsSync(c.ffmpeg)) ffmpeg.setFfmpegPath(c.ffmpeg);
      if (fs.existsSync(c.ffprobe)) ffmpeg.setFfprobePath(c.ffprobe);
    }
  }
};
