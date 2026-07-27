import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import ffmpeg from 'fluent-ffmpeg';

import { onAbort } from '../abort';
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
        key: 'maxFrames',
        label: '最大帧数',
        type: 'number',
        required: false,
        description: '最多输出多少帧（0 表示不限制）',
        default: 0
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

    const maxFrames = config?.maxFrames != null && Number(config.maxFrames) > 0 ? Math.round(clampNumber(Number(config.maxFrames), { min: 1, max: 200 })) : undefined;
    const width = config?.width != null ? Math.round(clampNumber(Number(config.width), { min: 1, max: 4096 })) : undefined;
    const height = config?.height != null ? Math.round(clampNumber(Number(config.height), { min: 1, max: 4096 })) : undefined;
    const quality = Math.round(clampNumber(Number(config?.quality ?? 4), { min: 1, max: 31 }));

    // 使用新的存储结构：在同级目录下的 keyframes 文件夹
    const { ensureTaskTypeDir } = await import('../task-results');
    const outDir = await ensureTaskTypeDir(src, 'keyframes');
    const outputPattern = path.join(outDir, 'frame-%04d.jpg');

    emit('node:progress', { progress: 0, message: '开始提取关键帧...' });

    // 存储从 stderr 解析出的帧时间戳信息
    const frameTimestamps: number[] = [];

    await new Promise<void>((resolve, reject) => {
      // 使用 select='key' 滤镜来只提取关键帧（I-frames）
      const vfFilters: string[] = ["select='key'"];
      if (width || height) {
        const w = width ?? -1;
        const h = height ?? -1;
        vfFilters.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease`);
      }
      // 添加 showinfo 滤镜来输出帧信息（包括时间戳）到 stderr
      vfFilters.push('showinfo');

      const outputOptions: string[] = [
        '-vsync',
        '0', // 保持原始时间戳
        '-qscale:v',
        `${quality}`,
        '-vf',
        vfFilters.join(',')
      ];

      const cmd = ffmpeg(src).output(outputPattern).outputOptions(outputOptions);
      const removeAbortListener = onAbort(ctx.signal, () => cmd.kill('SIGKILL'));

      // 如果设置了 maxFrames，限制输出帧数
      if (maxFrames) {
        cmd.frames(maxFrames);
      }

      // 解析 stderr 中的 showinfo 输出来获取时间戳
      cmd.on('stderr', (stderrLine: string) => {
        // showinfo 输出格式示例: [Parsed_showinfo_2 @ 0x...] n:   0 pts:      0 pts_time:0.000000 ...
        const ptsTimeMatch = stderrLine.match(/pts_time:([\d.]+)/);
        if (ptsTimeMatch) {
          const timestamp = parseFloat(ptsTimeMatch[1]);
          frameTimestamps.push(timestamp);
        }
      });

      cmd
        .on('start', (commandLine: string) => {
          console.log('[extract-keyframes] Start:', commandLine);
        })
        .on('progress', (progress) => {
          const percent = progress.percent != null ? clampNumber(Number(progress.percent), { min: 0, max: 100 }) : 0;
          emit('node:progress', { progress: percent, message: '提取关键帧中...' });
        })
        .on('end', () => {
          removeAbortListener();
          console.log('[extract-keyframes] End:', outputPattern);
          resolve();
        })
        .on('error', (err: Error) => {
          removeAbortListener();
          console.error('[extract-keyframes] Error:', err);
          reject(new Error(`提取关键帧失败: ${err.message}`));
        });

      cmd.run();
    });

    // 读取提取的帧文件
    const files = (await fsp.readdir(outDir))
      .filter((file) => /^frame-\d+\.jpg$/i.test(file))
      .sort((a, b) => {
        // 从文件名中提取数字进行排序
        const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
        const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
        return numA - numB;
      });

    // 构建帧信息，使用从 stderr 解析的时间戳
    const frames = files.map((file, idx) => {
      const timestamp = frameTimestamps[idx] ?? 0;
      return {
        path: path.join(outDir, file),
        filename: file,
        index: idx,
        timestamp: Number(timestamp.toFixed(3))
      };
    });

    const result = { frames, directory: outDir, count: frames.length };

    emit('node:progress', { progress: 100, message: '关键帧提取完成' });

    return { ...result, result };
  }
};
