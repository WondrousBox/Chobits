import ffmpeg from 'fluent-ffmpeg';

import { NodeHandler } from '../types';

export const TranscodeNode: NodeHandler = {
  spec: {
    id: 'media/transcode',
    label: '转码',
    category: 'Media',
    description: '对音视频进行转码（需要 FFmpeg 插件）',
    requires: ['plugin:ffmpeg'],
    inputs: [
      { key: 'input', label: '输入文件', type: ['file', 'string'], required: true },
      { key: 'format', label: '格式', type: 'string', required: true, description: '输出格式，如 mp4/mp3/webm' },
      { key: 'audioCodec', label: '音频编码', type: 'string', required: false },
      { key: 'videoCodec', label: '视频编码', type: 'string', required: false },
      { key: 'bitrate', label: '码率', type: 'string', required: false },
      { key: 'extraArgs', label: '额外参数', type: 'array', required: false }
    ],
    outputs: [{ key: 'output', label: '输出文件', type: 'file' }]
  },
  async run({ input }) {
    const src = String(input.input);
    if (!src) throw new Error('缺少输入文件');
    const fmt = String(input.format || 'mp4');
    const out = `${src}.${fmt}`;
    const args: string[] = Array.isArray(input.extraArgs) ? input.extraArgs : [];

    await new Promise<void>((resolve, reject) => {
      const cmd = ffmpeg(src);
      if (input.audioCodec) cmd.audioCodec(String(input.audioCodec));
      if (input.videoCodec) cmd.videoCodec(String(input.videoCodec));
      if (input.bitrate) cmd.videoBitrate(String(input.bitrate));
      if (args.length) cmd.addOptions(args);
      cmd
        .output(out)
        .on('end', () => resolve())
        .on('error', (e) => reject(e))
        .run();
    });

    return { output: out };
  }
};
