import ffmpeg from 'fluent-ffmpeg';
import path from 'node:path';

import { NodeHandler } from '../types';

export const TranscodeNode: NodeHandler = {
  spec: {
    id: 'media/transcode',
    label: '转码',
    category: 'Media',
    description: '对音视频进行转码（需要 FFmpeg 插件）',
    requires: ['plugin:ffmpeg'],
    // 现在仅保留真正的动态输入：文件来源。其余作为静态配置出现在节点属性面板。
    inputs: [
      { key: 'input', label: '输入文件', type: ['file', 'string'], required: true }
    ],
    // 节点级静态配置（不会作为运行期端口暴露）。
    config: [
      { key: 'format', label: '格式', type: 'string', required: true, description: '输出格式，如 mp4/mp3/webm', default: 'mp4' },
      { key: 'audioCodec', label: '音频编码', type: 'string', required: false },
      { key: 'videoCodec', label: '视频编码', type: 'string', required: false },
      { key: 'bitrate', label: '码率', type: 'string', required: false },
      { key: 'extraArgs', label: '额外参数', type: 'array', required: false }
    ],
    outputs: [{ key: 'output', label: '输出文件', type: 'file' }]
  },
  async run({ input, config }) {
    const src = String(input.input);
    if (!src) throw new Error('缺少输入文件');

    // 从节点配置读取参数
    const fmt = String(config?.format || 'mp4');
    const audioCodec = config?.audioCodec ? String(config.audioCodec) : undefined;
    const videoCodec = config?.videoCodec ? String(config.videoCodec) : undefined;
    const bitrate = config?.bitrate ? String(config.bitrate) : undefined;
    const args: string[] = Array.isArray(config?.extraArgs) ? config!.extraArgs : [];

    // 更稳健的输出文件名：替换扩展名而不是简单追加。
    const out = (() => {
      try {
        const { dir, name } = path.parse(src);
        return path.join(dir, `${name}.${fmt}`);
      } catch {
        return `${src}.${fmt}`; // Fallback
      }
    })();

    await new Promise<void>((resolve, reject) => {
      const cmd = ffmpeg(src);
      if (audioCodec) cmd.audioCodec(audioCodec);
      if (videoCodec) cmd.videoCodec(videoCodec);
      if (bitrate) cmd.videoBitrate(bitrate);
      if (args.length) cmd.addOptions(args.map(String));
      cmd
        .output(out)
        .on('end', () => resolve())
        .on('error', (e) => reject(e))
        .run();
    });

    return { output: out };
  }
};
