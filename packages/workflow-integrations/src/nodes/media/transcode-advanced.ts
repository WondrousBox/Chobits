import path from 'node:path';

import { type NodeHandler, onAbort } from '@chobits/workflow';
import ffmpeg from 'fluent-ffmpeg';

import { WORKFLOW_LOCAL_PROCESSING } from '../../capabilities/local-processing';

// 音频格式列表
const AUDIO_FORMATS = ['mp3', 'wav', 'm4a', 'flac', 'ogg', 'opus', 'aac'];

// 判断格式是音频还是视频
function isAudioFormat(format: string): boolean {
  return AUDIO_FORMATS.includes(format.toLowerCase());
}

export const TranscodeAdvancedNode: NodeHandler = {
  spec: {
    id: 'media/transcode-advanced',
    label: '转码（高级）',
    category: 'Media',
    description: '对音视频进行转码，支持自定义编码参数（需要 FFmpeg 插件）',
    requires: ['plugin:ffmpeg'],
    inputs: [{ key: 'input', label: '输入文件', type: ['file', 'string'], required: true }],
    config: [
      { key: 'format', label: '格式', type: 'string', required: true, description: '输出格式，如 mp4/mp3/webm', default: 'mp4' },
      { key: 'audioCodec', label: '音频编码', type: 'string', required: false, description: '音频编码器，如 libmp3lame/aac/libopus' },
      { key: 'videoCodec', label: '视频编码', type: 'string', required: false, description: '视频编码器，如 libx264/libx265/libvpx-vp9' },
      { key: 'bitrate', label: '码率', type: 'string', required: false, description: '视频码率，如 2000k/5M' },
      { key: 'audioBitrate', label: '音频码率', type: 'string', required: false, description: '音频码率，如 128k/192k' },
      { key: 'extraArgs', label: '额外参数', type: 'array', required: false, description: '额外的 FFmpeg 参数数组' }
    ],
    outputs: [{ key: 'output', label: '输出文件', type: 'file' }]
  },
  requiredCapabilities: [WORKFLOW_LOCAL_PROCESSING],
  execution: { group: 'ffmpeg' },
  async run({ input, config, ctx: executionContext, capabilities }) {
    const ctx = capabilities.require(WORKFLOW_LOCAL_PROCESSING).resolveContext(executionContext);
    const src = String(input.input);
    if (!src) throw new Error('缺少输入文件');

    // 从节点配置读取参数
    const fmt = String(config?.format || 'mp4');
    const audioCodec = config?.audioCodec ? String(config.audioCodec) : undefined;
    const videoCodec = config?.videoCodec ? String(config.videoCodec) : undefined;
    const bitrate = config?.bitrate ? String(config.bitrate) : undefined;
    const audioBitrate = config?.audioBitrate ? String(config.audioBitrate) : undefined;
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

    let stderrOutput = '';

    await new Promise<void>((resolve, reject) => {
      const cmd = ffmpeg(src);
      const removeAbortListener = onAbort(ctx.signal, () => cmd.kill('SIGKILL'));

      // 如果输出是音频格式，禁用视频轨道
      if (isAudioFormat(fmt)) {
        cmd.noVideo();
      }

      if (audioCodec) cmd.audioCodec(audioCodec);
      if (videoCodec) cmd.videoCodec(videoCodec);
      if (bitrate) cmd.videoBitrate(bitrate);
      if (audioBitrate) cmd.audioBitrate(audioBitrate);
      if (args.length) cmd.addOptions(args.map(String));
      cmd
        .format(fmt)
        .output(out)
        .on('start', (commandLine: string) => {
          console.log('[transcode-advanced] Start:', commandLine);
        })
        .on('stderr', (stderrLine: string) => {
          stderrOutput += stderrLine + '\n';
          console.log('[transcode-advanced] stderr:', stderrLine);
        })
        .on('end', () => {
          removeAbortListener();
          console.log('[transcode-advanced] End:', out);
          resolve();
        })
        .on('error', (e: Error) => {
          removeAbortListener();
          const errorMsg = `转码失败: ${e.message}\nFFmpeg stderr:\n${stderrOutput}`;
          console.log('[transcode-advanced] Error:', errorMsg);
          console.log('[transcode-advanced] 错误消息:', e.message);
          console.log('[transcode-advanced] 错误堆栈:', e.stack);
          console.log('[transcode-advanced] stderr 完整输出:', stderrOutput);
          reject(new Error(errorMsg));
        })
        .run();
    });

    return { output: out };
  }
};
