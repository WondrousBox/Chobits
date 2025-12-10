import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import ffmpeg from 'fluent-ffmpeg';

import { NodeConfig, NodeHandler, PortSchema, ValueType } from '../types';

// 模型名称映射：文件名 -> 简化名称（用于 dtw 参数）
const dtwMap: Record<string, string> = {
  'ggml-tiny.bin': 'tiny',
  'ggml-tiny.en.bin': 'tiny.en',
  'ggml-base.bin': 'base',
  'ggml-base.en.bin': 'base.en',
  'ggml-small.bin': 'small',
  'ggml-small.en.bin': 'small.en',
  'ggml-medium.bin': 'medium',
  'ggml-medium.en.bin': 'medium.en',
  'ggml-large-v1.bin': 'large.v1',
  'ggml-large-v2.bin': 'large.v2',
  'ggml-large-v3.bin': 'large.v3'
};

function fileExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

// 解析时间戳字符串为秒数，格式：[HH:MM:SS.mmm --> HH:MM:SS.mmm]
function parseTimestamp(timestampStr: string): number | null {
  // 匹配格式：[HH:MM:SS.mmm --> HH:MM:SS.mmm]
  const match = timestampStr.match(/\[(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})\]/);
  if (!match) return null;

  // 提取结束时间（使用结束时间作为当前进度）
  const hours = parseInt(match[5], 10);
  const minutes = parseInt(match[6], 10);
  const seconds = parseInt(match[7], 10);
  const milliseconds = parseInt(match[8], 10);

  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

// 获取媒体文件的总时长（秒）
async function getMediaDuration(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.log('[whisper] 无法获取媒体文件时长:', err.message);
        resolve(null);
        return;
      }
      const duration = metadata.format?.duration;
      if (duration && typeof duration === 'number') {
        resolve(duration);
      } else {
        resolve(null);
      }
    });
  });
}

// 检查音频格式是否符合 whisper 要求 (16kHz, 16-bit, mono WAV)
async function checkAudioFormat(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.log('[whisper] ffprobe error:', err.message);
        resolve(false);
        return;
      }
      // 检查格式
      const format = metadata.format?.format_name;
      const streams = metadata.streams || [];
      const audioStream = streams.find((s) => s.codec_type === 'audio');

      if (!audioStream) {
        resolve(false);
        return;
      }

      const isWav = format?.includes('wav');
      const is16k = audioStream.sample_rate === 16000;
      const isMono = audioStream.channels === 1;
      // codec_name 可能是 pcm_s16le
      const isPcmS16le = audioStream.codec_name === 'pcm_s16le';

      if (isWav && is16k && isMono && isPcmS16le) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

// 转码音频为 whisper 要求的格式
async function transcodeAudio(filePath: string, outputDir: string): Promise<string> {
  const fileName = path.basename(filePath, path.extname(filePath));
  const targetPath = path.join(outputDir, `${fileName}_16k.wav`);

  // 如果目标文件已存在，直接返回 (假设已转码)
  if (fileExists(targetPath)) {
    console.log('[whisper] 使用已存在的转码文件:', targetPath);
    return targetPath;
  }

  console.log('[whisper] 开始转码:', filePath, '->', targetPath);
  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .toFormat('wav')
      .audioFrequency(16000)
      .audioChannels(1)
      .audioCodec('pcm_s16le')
      .on('error', (err) => {
        console.error('[whisper] 转码失败:', err);
        reject(err);
      })
      .on('end', () => {
        console.log('[whisper] 转码完成');
        resolve(targetPath);
      })
      .save(targetPath);
  });
}

// https://github.com/ggml-org/whisper.cpp/tree/master/examples/cli
async function runWhisper(args: string[], ctx: any, onProgress?: (progress: number, message: string) => void, totalDuration?: number | null): Promise<void> {
  // 优先使用资源管理器中的engine，否则回退到PATH中的whisper-cli
  const { pluginResourceManager } = await import('../../plugins');
  const { platform } = await import('node:os');
  const binaryName = platform() === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
  const enginePath = pluginResourceManager.getEnginePath('plugin:whisper', binaryName);
  const whisperCmd = fs.existsSync(enginePath) ? enginePath : 'whisper-cli';

  // 时间戳匹配正则：匹配 [HH:MM:SS.mmm --> HH:MM:SS.mmm] 格式
  const timestampRegex = /\[(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})\]/g;

  await new Promise<void>((resolve, reject) => {
    console.log('[whisper] exec: ', whisperCmd + ' ' + args.join(' '));
    const child = spawn(whisperCmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let lastProgressTime = 0;

    child.stdout?.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log('[whisper] stdout:', output);

      // 解析输出中的时间戳，计算进度
      if (onProgress) {
        const lines = output.split('\n');
        for (const line of lines) {
          // 重置正则表达式（因为使用了全局标志）
          timestampRegex.lastIndex = 0;
          const matches = Array.from(line.matchAll(timestampRegex));
          if (matches.length > 0) {
            // 使用最后一个匹配的时间戳（最新的进度）
            // @ts-ignore
            const lastMatch = matches[matches.length - 1][0];
            const currentTime = parseTimestamp(lastMatch);
            if (currentTime !== null && currentTime > lastProgressTime) {
              lastProgressTime = currentTime;

              // 格式化时间显示
              const hours = Math.floor(currentTime / 3600);
              const minutes = Math.floor((currentTime % 3600) / 60);
              const seconds = Math.floor(currentTime % 60);
              const timeStr = hours > 0 ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}` : `${minutes}:${seconds.toString().padStart(2, '0')}`;

              // 如果有总时长，计算百分比；否则只显示时间
              if (totalDuration && totalDuration > 0) {
                const progressPercent = Math.min(95, Math.max(0, (currentTime / totalDuration) * 100));
                onProgress(progressPercent, `转录中: ${timeStr}`);
              } else {
                // 没有总时长时，使用一个递增的进度值（基于时间戳）
                // 假设最长不超过10小时，这样可以有一个粗略的进度估算
                const estimatedMaxDuration = 10 * 3600; // 10小时
                const progressPercent = Math.min(95, Math.max(0, (currentTime / estimatedMaxDuration) * 100));
                onProgress(progressPercent, `转录中: ${timeStr}`);
              }
            }
          }
        }
      }
    });

    child.stderr?.on('data', (data) => {
      const error = data.toString();
      stderr += error;
      console.log('[whisper] stderr:', error);
    });

    child.on('exit', (code) => {
      if (code === 0) {
        console.log('[whisper] 执行成功');
        if (onProgress) {
          onProgress(100, '转录完成');
        }
        resolve();
      } else {
        const errorMsg = stderr || stdout || `whisper failed with exit code ${code}`;
        console.log('[whisper] 执行失败，退出码:', code);
        console.log('[whisper] stderr 完整输出:', stderr);
        console.log('[whisper] stdout 完整输出:', stdout);
        reject(new Error(`whisper failed: ${code}\n${errorMsg}`));
      }
    });

    child.on('error', (e) => {
      console.log('[whisper] 进程错误:', e);
      console.log('[whisper] 错误消息:', e.message);
      console.log('[whisper] 错误堆栈:', e.stack);
      console.log('[whisper] stderr 完整输出:', stderr);
      console.log('[whisper] stdout 完整输出:', stdout);
      reject(e);
    });
  });
}

// 根据配置计算动态输出端口
function getDynamicOutputs(config?: NodeConfig): PortSchema[] {
  const outputs: PortSchema[] = [
    { key: 'text', label: '全文文本', type: 'string' },
    { key: 'segments', label: '分段 JSON', type: 'object' }
  ];

  // 根据选择的输出格式添加对应的输出端口
  const outputFormats: string[] = Array.isArray(config?.outputFormats) ? config.outputFormats : ['txt', 'srt', 'vtt', 'json'];
  const formatMap: Record<string, { key: string; label: string; type: ValueType }> = {
    txt: { key: 'txt', label: 'TXT 文件', type: 'file' },
    srt: { key: 'srt', label: 'SRT 文件', type: 'file' },
    vtt: { key: 'vtt', label: 'VTT 文件', type: 'file' },
    json: { key: 'json', label: 'JSON 文件', type: 'file' },
    lrc: { key: 'lrc', label: 'LRC 文件', type: 'file' },
    words: { key: 'words', label: 'Words 文件', type: 'file' }
  };

  // 添加选择的格式对应的输出端口
  for (const format of outputFormats) {
    const formatDef = formatMap[format];
    if (formatDef) {
      outputs.push({ key: formatDef.key, label: formatDef.label, type: formatDef.type });
    }
  }

  return outputs;
}

export const TranscribeWhisperNode: NodeHandler = {
  spec: {
    id: 'media/transcribe-whisper',
    label: '音视频转录 (Whisper)',
    category: 'Media',
    description: '使用 Whisper CLI 对音频或视频进行离线转录',
    requires: ['plugin:whisper', 'plugin:ffmpeg'],
    inputs: [{ key: 'media', label: '媒体文件', type: ['file', 'string'], required: true }],
    configGroups: {
      basic: { label: '基础属性', defaultExpanded: true },
      advanced: { label: '高级设置', defaultExpanded: false },
      more: { label: '更多配置', defaultExpanded: false }
    },
    config: [
      {
        key: 'model',
        label: '模型',
        type: 'string',
        required: true,
        default: 'ggml-base.bin',
        description: '选择 Whisper 模型，更大的模型通常更准确但速度更慢',
        inputType: 'select',
        options: [
          { value: 'ggml-tiny.bin', label: 'Tiny (最快，精度较低)' },
          { value: 'ggml-tiny.en.bin', label: 'Tiny English (仅英语)' },
          { value: 'ggml-base.bin', label: 'Base (平衡)' },
          { value: 'ggml-base.en.bin', label: 'Base English (仅英语)' },
          { value: 'ggml-small.bin', label: 'Small (较好精度)' },
          { value: 'ggml-small.en.bin', label: 'Small English (仅英语)' },
          { value: 'ggml-medium.bin', label: 'Medium (高精度)' },
          { value: 'ggml-medium.en.bin', label: 'Medium English (仅英语)' },
          { value: 'ggml-large-v1.bin', label: 'Large v1 (最高精度)' },
          { value: 'ggml-large-v2.bin', label: 'Large v2 (最高精度)' },
          { value: 'ggml-large-v3.bin', label: 'Large v3 (最高精度)' }
        ]
      },
      {
        key: 'language',
        label: '语言',
        type: 'string',
        required: false,
        description: '选择转录语言，留空或选择"自动"将自动检测',
        default: 'auto',
        inputType: 'select',
        options: [
          { value: 'auto', label: '自动' },
          { value: 'en', label: '英语' },
          { value: 'zh', label: '中文' },
          { value: 'zh_s', label: '简体中文' },
          { value: 'zh_t', label: '繁体中文' },
          { value: 'de', label: '德语' },
          { value: 'es', label: '西班牙语' },
          { value: 'ru', label: '俄语' },
          { value: 'ko', label: '韩语' },
          { value: 'fr', label: '法语' },
          { value: 'ja', label: '日语' },
          { value: 'pt', label: '葡萄牙语' },
          { value: 'tr', label: '土耳其语' },
          { value: 'pl', label: '波兰语' },
          { value: 'ca', label: '加泰罗尼亚语' },
          { value: 'nl', label: '荷兰语' },
          { value: 'ar', label: '阿拉伯语' },
          { value: 'sv', label: '瑞典语' },
          { value: 'it', label: '意大利语' },
          { value: 'id', label: '印尼语' },
          { value: 'hi', label: '印地语' },
          { value: 'fi', label: '芬兰语' },
          { value: 'vi', label: '越南语' },
          { value: 'he', label: '希伯来语' },
          { value: 'uk', label: '乌克兰语' },
          { value: 'el', label: '希腊语' },
          { value: 'ms', label: '马来语' },
          { value: 'cs', label: '捷克语' },
          { value: 'ro', label: '罗马尼亚语' },
          { value: 'da', label: '丹麦语' },
          { value: 'hu', label: '匈牙利语' },
          { value: 'ta', label: '泰米尔语' },
          { value: 'no', label: '挪威语' },
          { value: 'th', label: '泰语' },
          { value: 'ur', label: '乌尔都语' },
          { value: 'hr', label: '克罗地亚语' },
          { value: 'bg', label: '保加利亚语' },
          { value: 'lt', label: '立陶宛语' },
          { value: 'la', label: '拉丁语' },
          { value: 'mi', label: '毛利语' },
          { value: 'ml', label: '马拉雅拉姆语' },
          { value: 'cy', label: '威尔士语' },
          { value: 'sk', label: '斯洛伐克语' },
          { value: 'te', label: '泰卢固语' },
          { value: 'fa', label: '波斯语' },
          { value: 'lv', label: '拉脱维亚语' },
          { value: 'bn', label: '孟加拉语' },
          { value: 'sr', label: '塞尔维亚语' },
          { value: 'az', label: '阿塞拜疆语' },
          { value: 'sl', label: '斯洛文尼亚语' },
          { value: 'kn', label: '卡纳达语' },
          { value: 'et', label: '爱沙尼亚语' },
          { value: 'mk', label: '马其顿语' },
          { value: 'br', label: '布列塔尼语' },
          { value: 'eu', label: '巴斯克语' },
          { value: 'is', label: '冰岛语' },
          { value: 'hy', label: '亚美尼亚语' },
          { value: 'ne', label: '尼泊尔语' },
          { value: 'mn', label: '蒙古语' },
          { value: 'bs', label: '波斯尼亚语' },
          { value: 'kk', label: '哈萨克语' },
          { value: 'sq', label: '阿尔巴尼亚语' },
          { value: 'sw', label: '斯瓦希里语' },
          { value: 'gl', label: '加利西亚语' },
          { value: 'mr', label: '马拉地语' },
          { value: 'pa', label: '旁遮普语' },
          { value: 'si', label: '僧伽罗语' },
          { value: 'km', label: '高棉语' },
          { value: 'sn', label: '绍纳语' },
          { value: 'yo', label: '约鲁巴语' },
          { value: 'so', label: '索马里语' },
          { value: 'af', label: '南非荷兰语' },
          { value: 'oc', label: '奥克西唐语' },
          { value: 'ka', label: '格鲁吉亚语' },
          { value: 'be', label: '白俄罗斯语' },
          { value: 'tg', label: '塔吉克语' },
          { value: 'sd', label: '信德语' },
          { value: 'gu', label: '古吉拉特语' },
          { value: 'am', label: '阿姆哈拉语' },
          { value: 'yi', label: '意第绪语' },
          { value: 'lo', label: '老挝语' },
          { value: 'uz', label: '乌兹别克语' },
          { value: 'fo', label: '法罗语' },
          { value: 'ht', label: '海地克里奥尔语' },
          { value: 'ps', label: '普什图语' },
          { value: 'tk', label: '土库曼语' },
          { value: 'nn', label: '挪威尼诺斯克语' },
          { value: 'mt', label: '马耳他语' },
          { value: 'sa', label: '梵语' },
          { value: 'lb', label: '卢森堡语' },
          { value: 'my', label: '缅甸语' },
          { value: 'bo', label: '藏语' },
          { value: 'tl', label: '他加禄语' },
          { value: 'mg', label: '马达加斯加语' },
          { value: 'as', label: '阿萨姆语' },
          { value: 'tt', label: '塔塔尔语' },
          { value: 'haw', label: '夏威夷语' },
          { value: 'ln', label: '林加拉语' },
          { value: 'ha', label: '豪萨语' },
          { value: 'ba', label: '巴什基尔语' },
          { value: 'jw', label: '爪哇语' },
          { value: 'su', label: '巽他语' },
          { value: 'yue', label: '粤语' }
        ]
      },
      { key: 'threads', label: '线程数', type: 'number', required: false, description: '使用的线程数', group: 'more' },
      { key: 'translate', label: '翻译模式', type: 'boolean', required: false, default: false, description: '是否翻译到英文', group: 'more' },
      {
        key: 'outputFormats',
        label: '输出格式',
        type: 'array',
        required: false,
        default: ['txt', 'srt', 'vtt', 'json'],
        description: '输出格式列表',
        inputType: 'select-multiple',
        options: [
          { value: 'txt', label: 'TXT - 纯文本文件' },
          { value: 'srt', label: 'SRT - 字幕文件' },
          { value: 'vtt', label: 'VTT - WebVTT 字幕文件' },
          { value: 'json', label: 'JSON - JSON 格式文件' },
          { value: 'lrc', label: 'LRC - 歌词文件' },
          { value: 'words', label: 'Words - 卡拉OK视频脚本' }
        ]
      },
      { key: 'jsonFull', label: '完整 JSON 格式', type: 'boolean', required: false, default: false, description: 'JSON 输出包含更多信息（使用 -ojf 而非 -oj）', group: 'more' },
      { key: 'printProgress', label: '打印进度', type: 'boolean', required: false, default: false, group: 'more' },
      { key: 'printColors', label: '打印颜色', type: 'boolean', required: false, default: false, group: 'more' },
      { key: 'vad', label: '语音活动检测', type: 'boolean', required: false, default: false, description: '通过VAD识别人说话部分' },
      { key: 'noTimestamps', label: '无时间戳', type: 'boolean', required: false, default: false, group: 'more' },
      { key: 'maxLen', label: '最大长度', type: 'number', required: false, default: 0, description: '最大段落长度', group: 'advanced' },
      { key: 'dtw', label: '启用 DTW', type: 'boolean', required: false, default: false, description: '启用动态时间规整（DTW）优化', group: 'more' },
      { key: 'prompt', label: '上下文提示', type: 'string', required: false, default: '', description: '提供上下文提示以改善转录质量', group: 'advanced' },
      { key: 'maxContent', label: '最大文本上下文', type: 'number', required: false, default: -1, description: '最大文本上下文token数（-1表示无限制）', group: 'advanced' },
      { key: 'splitOnWord', label: '单词边界分割', type: 'boolean', required: false, default: false, description: '在单词边界分割', group: 'advanced' },
      { key: 'entropyThold', label: '熵阈值', type: 'number', required: false, default: 2.4, description: '解码器失败的熵阈值', group: 'advanced' },
      { key: 'logprobThold', label: '对数概率阈值', type: 'number', required: false, default: -1.0, description: '解码器失败的对数概率阈值', group: 'advanced' },
      { key: 'noSpeechThold', label: '无语音阈值', type: 'number', required: false, default: 0.6, description: '无语音阈值', group: 'advanced' },
      { key: 'temperature', label: '采样温度', type: 'number', required: false, default: 0.0, description: '采样温度', group: 'advanced' },
      { key: 'temperatureInc', label: '温度增量', type: 'number', required: false, default: 0.2, description: '温度增量', group: 'advanced' },
      { key: 'useGpu', label: '使用GPU', type: 'boolean', required: false, default: true, description: '启用GPU加速（默认启用，设为 false 时使用 --no-gpu 禁用）' },
      { key: 'flashAttn', label: 'Flash Attention', type: 'boolean', required: false, default: false, description: '启用Flash Attention', group: 'advanced' },
      { key: 'sns', label: '抑制非语音标记', type: 'boolean', required: false, default: false, description: '抑制非语音标记 (suppress non-speech tokens)', group: 'advanced' }
    ],
    // 默认输出（当没有配置或配置为空时使用）
    outputs: [
      { key: 'text', label: '全文文本', type: 'string' },
      { key: 'segments', label: '分段 JSON', type: 'object' },
      { key: 'txt', label: 'TXT 文件', type: 'file' },
      { key: 'srt', label: 'SRT 文件', type: 'file' },
      { key: 'vtt', label: 'VTT 文件', type: 'file' },
      { key: 'json', label: 'JSON 文件', type: 'file' }
    ]
  },
  // 根据配置动态计算输出端口
  getOutputs: getDynamicOutputs,
  async run({ input, config, ctx, emit }) {
    const src = String(input.media || '');
    if (!src) throw new Error('缺少媒体文件路径');
    if (!fs.existsSync(src)) throw new Error(`媒体文件不存在: ${src}`);

    const base = path.parse(src).name;

    // 使用新的存储结构：在同级目录下的 transcribe 文件夹
    const { ensureTaskTypeDir } = await import('../task-results');
    const outDir = await ensureTaskTypeDir(src, 'transcribe');

    // 检查并转码音频
    let finalSrc = src;
    const isCompatible = await checkAudioFormat(src);
    if (!isCompatible) {
      emit('node:progress', { progress: 0, message: '正在转码音频...' });
      try {
        finalSrc = await transcodeAudio(src, outDir);
      } catch (err) {
        const error = err as Error;
        throw new Error(`音频转码失败: ${error.message}`);
      }
    }

    // 获取媒体文件的总时长
    const totalDuration = await getMediaDuration(finalSrc);
    if (totalDuration) {
      const hours = Math.floor(totalDuration / 3600);
      const minutes = Math.floor((totalDuration % 3600) / 60);
      const seconds = Math.floor(totalDuration % 60);
      const durationStr = hours > 0 ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}` : `${minutes}:${seconds.toString().padStart(2, '0')}`;
      console.log(`[whisper] 媒体文件总时长: ${durationStr} (${totalDuration.toFixed(2)}秒)`);
    } else {
      console.log('[whisper] 无法获取媒体文件时长，将使用相对进度');
    }

    // 发送开始进度
    emit('node:progress', { progress: 0, message: '开始转录...' });

    // whisper.cpp 参数组装
    const args: string[] = ['-f', finalSrc];

    // 模型参数 (-m)
    // 从系统配置的模型文件夹加载模型
    const modelKey = String(config?.model || 'ggml-base.bin');
    let modelPath: string | null = null;
    try {
      const { pluginResourceManager } = await import('../../plugins');
      modelPath = pluginResourceManager.getModelPath('plugin:whisper', modelKey);
      // 检查模型文件是否存在
      if (fs.existsSync(modelPath)) {
        args.push('-m', modelPath);
        console.log('[whisper] 使用转录模型:', modelPath);
      } else {
        // 如果模型文件不存在，使用模型名称（让 whisper 自己查找）
        args.push('-m', modelKey);
        console.warn('[whisper] 模型文件不存在，使用模型名称:', modelKey, '路径:', modelPath);
      }
    } catch (error) {
      // 如果无法获取模型路径，使用模型名称
      args.push('-m', modelKey);
      console.log('[whisper] 无法获取模型路径，使用模型名称:', modelKey, error);
    }

    // 语言参数 (-l)
    // 如果语言为 'auto' 或空，则不传递 -l 参数，让 whisper.cpp 自动检测
    const language = config?.language ? String(config.language) : '';
    if (language && language !== 'auto') {
      args.push('-l', language);
    }

    // 线程数 (-t)
    if (config?.threads != null) args.push('-t', String(config.threads));

    // 翻译模式 (--translate)
    if (config?.translate) args.push('--translate');

    // 输出格式 (-otxt, -osrt, -ovtt, -oj/-ojf, -olrc, -owts)
    const outputFormats = Array.isArray(config?.outputFormats) ? config.outputFormats : ['txt', 'srt', 'vtt', 'json'];
    if (outputFormats.includes('txt')) args.push('-otxt');
    if (outputFormats.includes('srt')) args.push('-osrt');
    if (outputFormats.includes('vtt')) args.push('-ovtt');
    if (outputFormats.includes('json')) {
      // 根据 jsonFull 配置选择使用 -oj 或 -ojf
      if (config?.jsonFull) {
        args.push('-ojf');
      } else {
        args.push('-oj');
      }
    }
    if (outputFormats.includes('lrc')) args.push('-olrc');
    if (outputFormats.includes('words')) args.push('-owts');

    // 输出目录（whisper.cpp 会在输入文件同目录生成输出，需要指定输出目录时需要特殊处理）
    // 注意：whisper.cpp 默认在输入文件同目录输出，我们需要在运行后移动文件
    // 这里先不设置输出目录，运行后再移动文件到指定目录

    // 其他选项
    if (config?.printProgress) args.push('--print-progress');
    if (config?.printColors) args.push('--print-colors');
    if (config?.vad) {
      args.push('--vad');
      // VAD 模型从转录模型的同级目录加载（系统配置的模型文件夹）
      const vadModelName = 'ggml-silero-v5.1.2.bin';
      let vadModelPath: string | null = null;

      try {
        const { pluginResourceManager } = await import('../../plugins');
        vadModelPath = pluginResourceManager.getModelPath('plugin:whisper', vadModelName);

        // 检查 VAD 模型文件是否存在
        if (fs.existsSync(vadModelPath)) {
          args.push('-vm', vadModelPath);
          console.log('[whisper] 使用 VAD 模型:', vadModelPath);
        } else {
          console.warn('[whisper] VAD 模型文件不存在，将使用 whisper 默认行为。路径:', vadModelPath);
        }
      } catch (error) {
        console.log('[whisper] 无法获取 VAD 模型路径:', error);
      }
    }
    if (config?.noTimestamps) args.push('--no-timestamps');
    if (config?.maxLen != null && config.maxLen !== 0) args.push('--max-len', String(config.maxLen));

    // 上下文提示 (--prompt)
    if (config?.prompt && String(config.prompt).trim()) {
      args.push('--prompt', String(config.prompt));
    }

    // 最大文本上下文 (-mc, --max-context)
    if (config?.maxContent != null && config.maxContent !== -1) {
      args.push('--max-context', String(config.maxContent));
    }

    // 单词边界分割 (-sow, --split-on-word)
    if (config?.splitOnWord) args.push('--split-on-word');

    // 熵阈值 (-et, --entropy-thold)
    if (config?.entropyThold != null && config.entropyThold !== 2.4) {
      args.push('--entropy-thold', String(config.entropyThold));
    }

    // 对数概率阈值 (-lpt, --logprob-thold)
    if (config?.logprobThold != null && config.logprobThold !== -1.0) {
      args.push('--logprob-thold', String(config.logprobThold));
    }

    // 无语音阈值 (-nth, --no-speech-thold)
    if (config?.noSpeechThold != null && config.noSpeechThold !== 0.6) {
      args.push('--no-speech-thold', String(config.noSpeechThold));
    }

    // 采样温度 (-tp, --temperature)
    if (config?.temperature != null && config.temperature !== 0.0) {
      args.push('--temperature', String(config.temperature));
    }

    // 温度增量 (-tpi, --temperature-inc)
    if (config?.temperatureInc != null && config.temperatureInc !== 0.2) {
      args.push('--temperature-inc', String(config.temperatureInc));
    }

    // GPU 使用 (--no-gpu)
    // whisper CLI 默认启用 GPU，只有在明确设置为 false 时才使用 --no-gpu 禁用
    if (config?.useGpu === false) {
      args.push('--no-gpu');
    }
    // 默认情况下不添加任何参数，因为 GPU 默认已启用

    // Flash Attention (-fa, --flash-attn)
    if (config?.flashAttn) args.push('--flash-attn');

    // SNS (-sns, --suppress-nst)
    if (config?.sns) args.push('--suppress-nst');

    // DTW 参数 (--dtw)
    // 如果启用 dtw，使用映射后的文件名作为 dtw 参数值
    if (config?.dtw) {
      const modelFileName = dtwMap[modelKey];
      if (modelFileName) {
        args.push('--dtw', modelFileName);
      }
    }

    // 创建进度回调函数
    const onProgress = (progress: number, message: string): void => {
      emit('node:progress', { progress, message });
    };

    await runWhisper(args, ctx, onProgress, totalDuration);

    // whisper.cpp 默认在输入文件同目录生成输出文件
    // 需要将输出文件移动到指定目录
    const srcDir = path.dirname(finalSrc);
    const srcBase = path.parse(finalSrc).name;

    // whisper.cpp 通常会将扩展名附加到输入文件名后 (例如 input.wav -> input.wav.txt)
    // 但为了兼容性，我们也检查替换扩展名的情况 (例如 input.wav -> input.txt)
    const getGeneratedPath = (ext: string): string => {
      const appended = finalSrc + '.' + ext;
      if (fileExists(appended)) return appended;
      const replaced = path.join(srcDir, `${srcBase}.${ext}`);
      if (fileExists(replaced)) return replaced;
      return appended; // Default to appended if neither exists
    };

    const srcTxtPath = getGeneratedPath('txt');
    const srcSrtPath = getGeneratedPath('srt');
    const srcVttPath = getGeneratedPath('vtt');
    const srcJsonPath = getGeneratedPath('json');
    const srcLrcPath = getGeneratedPath('lrc');
    const srcWordsPath = getGeneratedPath('words');

    // 移动文件到输出目录
    const txtPath = path.join(outDir, `${base}.txt`);
    const srtPath = path.join(outDir, `${base}.srt`);
    const vttPath = path.join(outDir, `${base}.vtt`);
    const jsonPath = path.join(outDir, `${base}.json`);
    const lrcPath = path.join(outDir, `${base}.lrc`);
    const wordsPath = path.join(outDir, `${base}.words`);

    if (fileExists(srcTxtPath)) {
      fs.copyFileSync(srcTxtPath, txtPath);
      fs.unlinkSync(srcTxtPath);
    }
    if (fileExists(srcSrtPath)) {
      fs.copyFileSync(srcSrtPath, srtPath);
      fs.unlinkSync(srcSrtPath);
    }
    if (fileExists(srcVttPath)) {
      fs.copyFileSync(srcVttPath, vttPath);
      fs.unlinkSync(srcVttPath);
    }
    if (fileExists(srcJsonPath)) {
      fs.copyFileSync(srcJsonPath, jsonPath);
      fs.unlinkSync(srcJsonPath);
    }
    if (fileExists(srcLrcPath)) {
      fs.copyFileSync(srcLrcPath, lrcPath);
      fs.unlinkSync(srcLrcPath);
    }
    if (fileExists(srcWordsPath)) {
      fs.copyFileSync(srcWordsPath, wordsPath);
      fs.unlinkSync(srcWordsPath);
    }

    // 收集输出
    const out: Record<string, any> = {};

    if (fileExists(txtPath)) {
      try {
        out.txt = txtPath;
        out.text = fs.readFileSync(txtPath, 'utf8');
      } catch {
        // ignore read error, keep going
      }
    }
    if (fileExists(srtPath)) out.srt = srtPath;
    if (fileExists(vttPath)) out.vtt = vttPath;
    if (fileExists(jsonPath)) {
      out.json = jsonPath;
      try {
        const obj = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        if (obj && typeof obj === 'object' && Array.isArray(obj.segments)) out.segments = obj.segments;
      } catch {
        // ignore parse error
      }
    }
    if (fileExists(lrcPath)) out.lrc = lrcPath;
    if (fileExists(wordsPath)) out.words = wordsPath;

    // 根据用户期望的输出格式过滤（如果设置了）
    const expected: string[] = Array.isArray(config?.outputFormats) ? config!.outputFormats : [];
    if (expected.length) {
      // 仅保留用户请求的文件路径字段；text/segments 不过滤（便于链路使用）
      const keepFiles = new Set(expected.map(String));
      if (!keepFiles.has('txt')) delete out.txt;
      if (!keepFiles.has('srt')) delete out.srt;
      if (!keepFiles.has('vtt')) delete out.vtt;
      if (!keepFiles.has('json')) delete out.json;
      if (!keepFiles.has('lrc')) delete out.lrc;
      if (!keepFiles.has('words')) delete out.words;
    }

    return out;
  }
};
