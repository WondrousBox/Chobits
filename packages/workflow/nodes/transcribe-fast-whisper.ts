import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import ffmpeg from 'fluent-ffmpeg';

import { NodeConfig, NodeHandler, PortSchema, ValueType } from '../types';

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
        console.log('[fast-whisper] 无法获取媒体文件时长:', err.message);
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
        console.log('[fast-whisper] ffprobe error:', err.message);
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
    console.log('[fast-whisper] 使用已存在的转码文件:', targetPath);
    return targetPath;
  }

  console.log('[fast-whisper] 开始转码:', filePath, '->', targetPath);
  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .toFormat('wav')
      .audioFrequency(16000)
      .audioChannels(1)
      .audioCodec('pcm_s16le')
      .on('error', (err) => {
        console.error('[fast-whisper] 转码失败:', err);
        reject(err);
      })
      .on('end', () => {
        console.log('[fast-whisper] 转码完成');
        resolve(targetPath);
      })
      .save(targetPath);
  });
}

// fast-whisper CLI 执行函数
async function runFastWhisper(args: string[], _ctx: any, onProgress?: (progress: number, message: string) => void, totalDuration?: number | null): Promise<void> {
  // 优先使用资源管理器中的engine，否则回退到PATH中的fast-whisper-cli
  const { pluginResourceManager } = await import('../../plugins');
  const { platform } = await import('node:os');
  const binaryName = platform() === 'win32' ? 'fast-whisper-cli.exe' : 'fast-whisper-cli';
  const enginePath = pluginResourceManager.getEnginePath('plugin:fast-whisper', binaryName);
  const whisperCmd = fs.existsSync(enginePath) ? enginePath : 'fast-whisper-cli';

  // 时间戳匹配正则：匹配 [HH:MM:SS.mmm --> HH:MM:SS.mmm] 格式
  const timestampRegex = /\[(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})\]/g;

  await new Promise<void>((resolve, reject) => {
    console.log('[fast-whisper] exec: ', whisperCmd + ' ' + args.join(' '));
    const child = spawn(whisperCmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let lastProgressTime = 0;

    child.stdout?.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log('[fast-whisper] stdout:', output);

      // 解析输出中的时间戳，计算进度
      if (onProgress) {
        const lines = output.split('\n');
        for (const line of lines) {
          // 重置正则表达式（因为使用了全局标志）
          timestampRegex.lastIndex = 0;
          const matches = Array.from(line.matchAll(timestampRegex)) as RegExpMatchArray[];
          if (matches.length > 0) {
            // 使用最后一个匹配的时间戳（最新的进度）
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
      console.log('[fast-whisper] stderr:', error);
    });

    child.on('exit', (code) => {
      if (code === 0) {
        console.log('[fast-whisper] 执行成功');
        if (onProgress) {
          onProgress(100, '转录完成');
        }
        resolve();
      } else {
        const errorMsg = stderr || stdout || `fast-whisper failed with exit code ${code}`;
        console.log('[fast-whisper] 执行失败，退出码:', code);
        console.log('[fast-whisper] stderr 完整输出:', stderr);
        console.log('[fast-whisper] stdout 完整输出:', stdout);
        reject(new Error(`fast-whisper failed: ${code}\n${errorMsg}`));
      }
    });

    child.on('error', (e) => {
      console.log('[fast-whisper] 进程错误:', e);
      console.log('[fast-whisper] 错误消息:', e.message);
      console.log('[fast-whisper] 错误堆栈:', e.stack);
      console.log('[fast-whisper] stderr 完整输出:', stderr);
      console.log('[fast-whisper] stdout 完整输出:', stdout);
      reject(e);
    });
  });
}

// 根据配置计算动态输出端口
function getDynamicOutputs(config?: NodeConfig): PortSchema[] {
  const outputs: PortSchema[] = [{ key: 'segments', label: '分段 JSON', type: 'object' }];

  // 根据选择的输出格式添加对应的输出端口
  const outputFormats: string[] = Array.isArray(config?.outputFormats) ? config.outputFormats : ['txt', 'srt', 'json'];
  const formatMap: Record<string, { key: string; label: string; type: ValueType }> = {
    txt: { key: 'txt', label: 'TXT 文件', type: 'file' },
    srt: { key: 'srt', label: 'SRT 文件', type: 'file' },
    json: { key: 'json', label: 'JSON 文件', type: 'file' }
  };

  // 添加选择的格式对应的输出端口
  for (const format of outputFormats) {
    const formatDef = formatMap[format];
    if (formatDef) {
      if (formatDef.key === 'txt') {
        outputs.push({ key: 'text', label: '全文文本', type: 'string' });
      }
      outputs.push({ key: formatDef.key, label: formatDef.label, type: formatDef.type });
    }
  }

  return outputs;
}

export const TranscribeFastWhisperNode: NodeHandler = {
  spec: {
    id: 'media/transcribe-fast-whisper',
    label: '音视频转录 (Fast Whisper)',
    category: 'Media',
    description: '使用 Fast Whisper CLI 对音频或视频进行快速转录',
    requires: ['plugin:fast-whisper', 'plugin:ffmpeg'],
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
        default: 'tiny',
        description: '选择 Fast Whisper 模型',
        inputType: 'select',
        options: [
          { value: 'faster-whisper-tiny', label: 'Tiny', description: '最快速，精度较低' },
          { value: 'faster-whisper-tiny.en', label: 'Tiny English', description: '仅英语，速度最快' },
          { value: 'faster-whisper-base', label: 'Base', description: '平衡速度和精度' },
          { value: 'faster-whisper-base.en', label: 'Base English', description: '仅英语，速度较快' },
          { value: 'faster-whisper-small', label: 'Small', description: '高精度，适合正式场景' },
          { value: 'faster-whisper-small.en', label: 'Small English', description: '仅英语，精度较高' },
          { value: 'faster-whisper-medium', label: 'Medium', description: '更高精度，速度较慢' },
          { value: 'faster-whisper-medium.en', label: 'Medium English', description: '仅英语，高精度' },
          { value: 'faster-whisper-large-v1', label: 'Large v1', description: '最高精度 v1' },
          { value: 'faster-whisper-large-v2', label: 'Large v2', description: '最高精度 v2' },
          { value: 'faster-whisper-large-v3', label: 'Large v3', description: '最新 Large 模型' }
        ]
      },
      {
        key: 'language',
        label: '语言',
        type: 'string',
        required: false,
        description: '选择转录语言，留空将自动检测',
        default: '',
        inputType: 'select',
        searchable: true,
        options: [
          { value: '', label: '自动检测' },
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
      {
        key: 'outputFormats',
        label: '输出格式',
        type: 'array',
        required: false,
        default: ['json', 'txt', 'srt'],
        description: '输出格式列表（用逗号分隔）',
        inputType: 'select-multiple',
        options: [
          { value: 'json', label: 'JSON - JSON 格式文件' },
          { value: 'txt', label: 'TXT - 纯文本文件' },
          { value: 'srt', label: 'SRT - 字幕文件' }
        ]
      },
      { key: 'outputFilename', label: '输出文件名', type: 'string', required: false, default: 'output', description: '输出文件名（不含扩展名）', group: 'basic' },
      { key: 'wordTimestamps', label: '单词时间戳', type: 'boolean', required: false, default: false, description: '是否输出单词级别的时间戳', group: 'more' },
      { key: 'modelDir', label: '模型目录', type: 'string', required: false, default: 'model', description: '模型文件所在目录（相对于可执行文件或绝对路径）', group: 'advanced' },
      { key: 'threads', label: '线程数', type: 'number', required: false, description: '使用的线程数', group: 'more' },
      { key: 'temperature', label: '采样温度', type: 'number', required: false, default: 0.0, description: '采样温度（0.0-1.0）', group: 'advanced' },
      { key: 'bestOf', label: '候选数量', type: 'number', required: false, default: 5, description: '候选数量（用于解码）', group: 'advanced' },
      { key: 'beamSize', label: 'Beam 大小', type: 'number', required: false, default: 5, description: 'Beam 搜索大小', group: 'advanced' },
      { key: 'patience', label: 'Patience', type: 'number', required: false, default: 1.0, description: 'Beam search patience 值', group: 'advanced' }
    ],
    // 默认输出
    outputs: [
      { key: 'text', label: '全文文本', type: 'string' },
      { key: 'segments', label: '分段 JSON', type: 'object' },
      { key: 'txt', label: 'TXT 文件', type: 'file' },
      { key: 'srt', label: 'SRT 文件', type: 'file' },
      { key: 'json', label: 'JSON 文件', type: 'file' }
    ]
  },
  // 根据配置动态计算输出端口
  getOutputs: getDynamicOutputs,
  async run({ input, config, ctx: _ctx, emit }) {
    const src = String(input.media || '');
    if (!src) throw new Error('缺少媒体文件路径');
    if (!fs.existsSync(src)) throw new Error(`媒体文件不存在: ${src}`);

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
      console.log(`[fast-whisper] 媒体文件总时长: ${durationStr} (${totalDuration.toFixed(2)}秒)`);
    } else {
      console.log('[fast-whisper] 无法获取媒体文件时长，将使用相对进度');
    }

    // 发送开始进度
    emit('node:progress', { progress: 0, message: '开始转录...' });

    // fast-whisper 参数组装
    const args: string[] = [];

    // 模型参数 (--model)：优先从插件模型管理获取绝对路径，否则再使用 modelDir + 模型名
    const modelName = String(config?.model || 'tiny');
    let modelPath: string = modelName;
    try {
      const { pluginResourceManager } = await import('../../plugins');
      const managedPath = pluginResourceManager.getModelPath('plugin:fast-whisper', modelName);
      if (managedPath && fs.existsSync(managedPath)) {
        modelPath = managedPath;
        console.log('[fast-whisper] 使用转录模型:', modelPath);
      } else {
        const modelDir = String(config?.modelDir || '');
        if (modelDir) {
          modelPath = path.isAbsolute(modelDir) ? path.join(modelDir, modelName) : path.join(modelDir, modelName);
        }
        console.log('[fast-whisper] 模型管理路径不存在或未配置，使用:', modelPath, managedPath ? `(管理路径: ${managedPath})` : '');
      }
    } catch (error) {
      const modelDir = String(config?.modelDir || '');
      if (modelDir) {
        modelPath = path.isAbsolute(modelDir) ? path.join(modelDir, modelName) : path.join(modelDir, modelName);
      }
      console.log('[fast-whisper] 无法获取模型管理路径，使用:', modelPath, error);
    }

    args.push('--model', modelPath);

    // 音频文件参数 (--audio)
    args.push('--audio', finalSrc);

    // 输出目录 (--output-dir)
    args.push('--output-dir', outDir);

    // 输出文件名 (--output-filename)
    const outputFilename = String(config?.outputFilename || 'output');
    args.push('--output-filename', outputFilename);

    // 输出格式 (--output-format)
    const outputFormats = Array.isArray(config?.outputFormats) ? config.outputFormats : ['json', 'txt', 'srt'];
    args.push('--output-format', outputFormats.join(','));

    // 单词时间戳 (--word-timestamps)
    if (config?.wordTimestamps) {
      args.push('--word-timestamps');
    }

    // 语言参数 (--language)
    const language = config?.language ? String(config.language) : '';
    if (language) {
      args.push('--language', language);
    }

    // 线程数 (--threads)：未设置或无数值时不传
    if (config?.threads != null && config.threads > 0) {
      args.push('--threads', String(config.threads));
    }

    // 采样温度 (--temperature)
    if (config?.temperature != null && config.temperature !== 0.0) {
      args.push('--temperature', String(config.temperature));
    }

    // 候选数量 (--best-of)
    if (config?.bestOf != null && config.bestOf !== 5) {
      args.push('--best-of', String(config.bestOf));
    }

    // Beam 大小 (--beam-size)
    if (config?.beamSize != null && config.beamSize !== 5) {
      args.push('--beam-size', String(config.beamSize));
    }

    // Patience (--patience)
    if (config?.patience != null && config.patience !== 1.0) {
      args.push('--patience', String(config.patience));
    }

    // 创建进度回调函数
    const onProgress = (progress: number, message: string): void => {
      emit('node:progress', { progress, message });
    };

    await runFastWhisper(args, _ctx, onProgress, totalDuration);

    // 收集输出文件
    const out: Record<string, any> = {};

    // fast-whisper 会在输出目录生成指定文件名的文件
    const txtPath = path.join(outDir, `${outputFilename}.txt`);
    const srtPath = path.join(outDir, `${outputFilename}.srt`);
    const jsonPath = path.join(outDir, `${outputFilename}.json`);

    if (fileExists(txtPath)) {
      try {
        out.txt = txtPath;
        out.text = fs.readFileSync(txtPath, 'utf8');
      } catch {
        // ignore read error, keep going
      }
    }
    if (fileExists(srtPath)) {
      out.srt = srtPath;
    }
    if (fileExists(jsonPath)) {
      out.json = jsonPath;
      try {
        const obj = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        if (obj && typeof obj === 'object' && Array.isArray(obj.segments)) {
          out.segments = obj.segments;
        }
      } catch {
        // ignore parse error
      }
    }

    // 根据用户期望的输出格式过滤
    const expected: string[] = Array.isArray(config?.outputFormats) ? config!.outputFormats : [];
    if (expected.length) {
      // 仅保留用户请求的文件路径字段；text/segments 不过滤（便于链路使用）
      const keepFiles = new Set(expected.map(String));
      if (!keepFiles.has('txt')) delete out.txt;
      if (!keepFiles.has('srt')) delete out.srt;
      if (!keepFiles.has('json')) delete out.json;
    }

    return out;
  }
};
