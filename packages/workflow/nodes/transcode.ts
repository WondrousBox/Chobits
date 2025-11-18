import fs from 'node:fs';
import path from 'node:path';

import ffmpeg from 'fluent-ffmpeg';

import { NodeHandler } from '../types';

// 音频格式列表
const AUDIO_FORMATS = ['mp3', 'wav', 'm4a', 'flac', 'ogg', 'opus', 'aac'];
// 视频格式列表
const VIDEO_FORMATS = ['mp4', 'avi', 'webm', 'mov', 'mkv', 'flv', 'wmv'];

// 判断格式是音频还是视频
function isAudioFormat(format: string): boolean {
  return AUDIO_FORMATS.includes(format.toLowerCase());
}

function isVideoFormat(format: string): boolean {
  return VIDEO_FORMATS.includes(format.toLowerCase());
}

// 根据格式获取合适的音频编码器
function getAudioCodecForFormat(format: string): string | undefined {
  const fmt = format.toLowerCase();
  switch (fmt) {
    case 'mp3':
      return 'libmp3lame';
    case 'm4a':
    case 'aac':
      return 'aac';
    case 'ogg':
    case 'opus':
      return 'libopus';
    case 'flac':
      return 'flac';
    case 'wav':
      return 'pcm_s16le';
    default:
      return undefined; // 让 FFmpeg 自动选择
  }
}

// 根据质量预设获取码率设置
function getQualitySettings(quality: string, format: string, isAudio: boolean): { audioBitrate?: string; videoBitrate?: string; audioCodec?: string; videoCodec?: string } {
  const q = quality.toLowerCase();

  if (isAudio) {
    // 音频质量设置
    const audioCodec = getAudioCodecForFormat(format);
    switch (q) {
      case 'low':
        return { audioBitrate: '64k', audioCodec };
      case 'medium':
        return { audioBitrate: '128k', audioCodec };
      case 'high':
        return { audioBitrate: '320k', audioCodec };
      default:
        return { audioBitrate: '128k', audioCodec };
    }
  } else {
    // 视频质量设置
    switch (q) {
      case 'low':
        return { videoBitrate: '500k', audioBitrate: '64k', videoCodec: 'libx264', audioCodec: 'aac' };
      case 'medium':
        return { videoBitrate: '2000k', audioBitrate: '128k', videoCodec: 'libx264', audioCodec: 'aac' };
      case 'high':
        return { videoBitrate: '5000k', audioBitrate: '192k', videoCodec: 'libx264', audioCodec: 'aac' };
      default:
        return { videoBitrate: '2000k', audioBitrate: '128k', videoCodec: 'libx264', audioCodec: 'aac' };
    }
  }
}

export const TranscodeNode: NodeHandler = {
  spec: {
    id: 'media/transcode',
    label: '转码',
    category: 'Media',
    description: '对音视频进行转码（需要 FFmpeg 插件）',
    requires: ['plugin:ffmpeg'],
    inputs: [{ key: 'input', label: '输入文件', type: ['file', 'string'], required: true }],
    config: [
      {
        key: 'format',
        label: '格式',
        type: 'string',
        required: true,
        description: '输出格式',
        default: 'mp4',
        inputType: 'select',
        options: [
          {
            group: '视频格式',
            options: [
              { value: 'mp4', label: 'MP4' },
              { value: 'avi', label: 'AVI' },
              { value: 'webm', label: 'WebM' },
              { value: 'mov', label: 'MOV' },
              { value: 'mkv', label: 'MKV' },
              { value: 'flv', label: 'FLV' },
              { value: 'wmv', label: 'WMV' }
            ]
          },
          {
            group: '音频格式',
            options: [
              { value: 'mp3', label: 'MP3' },
              { value: 'wav', label: 'WAV' },
              { value: 'm4a', label: 'M4A' },
              { value: 'flac', label: 'FLAC' },
              { value: 'ogg', label: 'OGG' },
              { value: 'opus', label: 'Opus' },
              { value: 'aac', label: 'AAC' }
            ]
          }
        ]
      },
      {
        key: 'quality',
        label: '质量',
        type: 'string',
        required: true,
        description: '转码质量预设',
        default: 'medium',
        inputType: 'select',
        options: [
          { value: 'low', label: '低质量和大小' },
          { value: 'medium', label: '最优质量和大小' },
          { value: 'high', label: '高质量和大小' }
        ]
      }
    ],
    outputs: [{ key: 'output', label: '输出文件', type: 'file' }]
  },
  async run({ input, config, emit }) {
    const src = String(input.input);
    if (!src) throw new Error('缺少输入文件');

    // 检查输入文件是否存在
    if (!fs.existsSync(src)) {
      throw new Error(`输入文件不存在: ${src}`);
    }

    const fmt = String(config?.format || 'mp4');
    const quality = String(config?.quality || 'medium');

    const isAudio = isAudioFormat(fmt);
    const isVideo = isVideoFormat(fmt);

    if (!isAudio && !isVideo) {
      throw new Error(`不支持的格式: ${fmt}`);
    }

    const qualitySettings = getQualitySettings(quality, fmt, isAudio);

    // 使用新的存储结构：在同级目录下的 transcode 文件夹
    const { getTaskOutputPath } = await import('../task-results');
    const { name } = path.parse(src);
    const fileName = `${name}.${fmt}`;
    const out = await getTaskOutputPath(src, 'transcode', fileName);

    const stderrOutput = '';

    await new Promise<void>((resolve, reject) => {
      const cmd = ffmpeg(src);

      // 如果输出是音频格式，禁用视频轨道
      if (isAudio) {
        cmd.noVideo();
      }

      if (isVideo && qualitySettings.videoCodec) {
        cmd.videoCodec(qualitySettings.videoCodec);
      }
      if (qualitySettings.videoBitrate) {
        cmd.videoBitrate(qualitySettings.videoBitrate);
      }
      if (qualitySettings.audioCodec) {
        cmd.audioCodec(qualitySettings.audioCodec);
      }
      if (qualitySettings.audioBitrate) {
        cmd.audioBitrate(qualitySettings.audioBitrate);
      }

      cmd
        .format(fmt)
        .output(out)
        .on('start', (commandLine: string) => {
          console.log('[transcode] Start:', commandLine);
          // 发送开始进度
          emit('node:progress', { progress: 0, message: '开始转码...' });
        })
        .on('progress', (progress: any) => {
          console.log('[transcode] Progress:', progress);
          // FFmpeg progress 对象通常包含 percent 字段（0-100）
          // 也可能包含 time 字段，我们可以根据 time 估算进度
          let progressPercent = 0;
          if (progress.percent !== undefined) {
            progressPercent = Math.max(0, Math.min(100, parseFloat(String(progress.percent))));
          } else if (progress.time && progress.targetSize) {
            // 如果没有 percent，尝试根据时间和目标大小估算
            // 这是一个简化的估算，实际可能需要更多信息
            progressPercent = 50; // 默认值
          }

          // 构建进度消息
          let message = '转码中...';
          if (progress.time) {
            message = `转码中: ${progress.time}`;
          }

          emit('node:progress', { progress: progressPercent, message });
        })
        .on('end', () => {
          console.log('[transcode] End:', out);
          // 发送完成进度
          emit('node:progress', { progress: 100, message: '转码完成' });
          resolve();
        })
        .on('error', (e: Error) => {
          const errorMsg = `转码失败: ${e.message}\nFFmpeg stderr:\n${stderrOutput}`;
          console.error('[transcode] Error:', errorMsg);
          reject(new Error(errorMsg));
        })
        .run();
    });

    return { output: out };
  }
};
