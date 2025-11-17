import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import ffmpeg from 'fluent-ffmpeg';

import { NodeHandler } from '../types';

function clampNumber(value: number, options: { min?: number; max?: number }): number {
  const { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = options;
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export const ExtractKeyframesNode: NodeHandler = {
  spec: {
    id: 'media/extract-keyframes',
    label: '提取关键帧',
    category: 'Media',
    description: '使用 FFmpeg 从视频或音频可视化轨道提取关键帧缩略图',
    requires: ['plugin:ffmpeg'],
    inputs: [{ key: 'input', label: '输入文件', type: ['file', 'string'], required: true }],
    config: [
      {
        key: 'intervalSeconds',
        label: '间隔秒数',
        type: 'number',
        required: false,
        description: '每隔多少秒提取一帧',
        default: 2
      },
      {
        key: 'maxFrames',
        label: '最大帧数',
        type: 'number',
        required: false,
        description: '最多输出多少帧',
        default: 12
      },
      {
        key: 'width',
        label: '缩放宽度',
        type: 'number',
        required: false,
        description: '输出缩略图宽度，留空则按原视频宽度'
      },
      {
        key: 'height',
        label: '缩放高度',
        type: 'number',
        required: false,
        description: '输出缩略图高度，留空则按原视频高度'
      },
      {
        key: 'quality',
        label: 'JPEG 质量 (1-31)',
        type: 'number',
        required: false,
        description: '数值越小质量越高，默认 4',
        default: 4
      }
    ],
    outputs: [
      { key: 'frames', label: '关键帧列表', type: 'array' },
      { key: 'directory', label: '输出目录', type: 'file' },
      { key: 'count', label: '帧数量', type: 'number' },
      { key: 'result', label: '结果对象', type: 'object', description: '包含 frames/directory/count' }
    ]
  },
  async run({ input, config, ctx, emit }) {
    const src = String(input.input || '');
    if (!src) throw new Error('缺少输入文件');
    if (!fs.existsSync(src)) throw new Error(`输入文件不存在: ${src}`);

    const interval = clampNumber(Number(config?.intervalSeconds ?? 2), { min: 0.2, max: 60 });
    const maxFrames = Math.round(clampNumber(Number(config?.maxFrames ?? 12), { min: 1, max: 200 }));
    const width = config?.width != null ? Math.round(clampNumber(Number(config.width), { min: 1, max: 4096 })) : undefined;
    const height = config?.height != null ? Math.round(clampNumber(Number(config.height), { min: 1, max: 4096 })) : undefined;
    const quality = Math.round(clampNumber(Number(config?.quality ?? 4), { min: 1, max: 31 }));

    const outDir = path.join(ctx.tmpDir, `keyframes-${randomUUID()}`);
    await fsp.mkdir(outDir, { recursive: true });
    const outputPattern = path.join(outDir, 'frame-%04d.jpg');

    emit('node:progress', { progress: 0, message: '开始提取关键帧...' });

    await new Promise<void>((resolve, reject) => {
      const vfFilters: string[] = [`fps=1/${interval}`];
      if (width || height) {
        const w = width ?? -1;
        const h = height ?? -1;
        vfFilters.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease`);
      }

      const cmd = ffmpeg(src)
        .output(outputPattern)
        .outputOptions(['-vsync', 'vfr', '-qscale:v', `${quality}`, '-vf', vfFilters.join(',')])
        .frames(maxFrames)
        .on('start', (commandLine: string) => {
          console.log('[extract-keyframes] Start:', commandLine);
        })
        .on('progress', (progress) => {
          const percent = progress.percent != null ? clampNumber(Number(progress.percent), { min: 0, max: 100 }) : 0;
          emit('node:progress', { progress: percent, message: '提取关键帧中...' });
        })
        .on('end', () => {
          console.log('[extract-keyframes] End:', outputPattern);
          resolve();
        })
        .on('error', (err: Error) => {
          console.error('[extract-keyframes] Error:', err);
          reject(new Error(`提取关键帧失败: ${err.message}`));
        });

      cmd.run();
    });

    const files = (await fsp.readdir(outDir)).filter((file) => /^frame-\d+\.jpg$/i.test(file)).sort();

    const frames = files.map((file, idx) => ({
      path: path.join(outDir, file),
      filename: file,
      index: idx,
      timestamp: Number((idx * interval).toFixed(2))
    }));
    const result = { frames, directory: outDir, count: frames.length };

    emit('node:progress', { progress: 100, message: '关键帧提取完成' });

    return { ...result, result };
  }
};
