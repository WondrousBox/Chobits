import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import ffmpeg from 'fluent-ffmpeg';

import { NodeConfig, NodeHandler, PortSchema, ValueType } from '../types';

// Parakeet 模型定义
const PARAKEET_MODELS = [
  {
    id: 'parakeet-tdt-0.6b-v2-coreml',
    name: 'parakeet-tdt-0.6b-v2-coreml',
    description: '只支持英语',
    supportLangs: 'English Only'
  },
  {
    id: 'parakeet-tdt-0.6b-v3-coreml',
    name: 'parakeet-tdt-0.6b-v3-coreml',
    description: '支持多语言',
    supportLangs: 'Multilingual'
  }
];

function fileExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

// 获取媒体文件的总时长（秒）
async function getMediaDuration(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.log('[parakeet] 无法获取媒体文件时长:', err.message);
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

// 检查音频格式是否符合 parakeet 要求 (16kHz, 16-bit, mono WAV)
async function checkAudioFormat(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.log('[parakeet] ffprobe error:', err.message);
        resolve(false);
        return;
      }
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
      const isPcmS16le = audioStream.codec_name === 'pcm_s16le';

      if (isWav && is16k && isMono && isPcmS16le) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

// 转码音频为 parakeet 要求的格式
async function transcodeAudio(filePath: string, outputDir: string): Promise<string> {
  const fileName = path.basename(filePath, path.extname(filePath));
  const targetPath = path.join(outputDir, `${fileName}_16k.wav`);

  if (fileExists(targetPath)) {
    console.log('[parakeet] 使用已存在的转码文件:', targetPath);
    return targetPath;
  }

  console.log('[parakeet] 开始转码:', filePath, '->', targetPath);
  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .toFormat('wav')
      .audioFrequency(16000)
      .audioChannels(1)
      .audioCodec('pcm_s16le')
      .on('error', (err) => {
        console.error('[parakeet] 转码失败:', err);
        reject(err);
      })
      .on('end', () => {
        console.log('[parakeet] 转码完成');
        resolve(targetPath);
      })
      .save(targetPath);
  });
}

// 运行 Parakeet CLI
async function runParakeet(args: string[], onProgress?: (progress: number, message: string) => void, totalDuration?: number | null): Promise<void> {
  const { pluginResourceManager } = await import('../../plugins');
  const { platform } = await import('node:os');
  const binaryName = platform() === 'win32' ? 'parakeet.exe' : 'parakeet';
  const cliPath = pluginResourceManager.getEnginePath('plugin:parakeet', binaryName);

  if (!fs.existsSync(cliPath)) {
    throw new Error(`Parakeet CLI not found at: ${cliPath}`);
  }

  console.log('[parakeet] CLI path:', cliPath);
  console.log('[parakeet] args:', args.join(' '));

  await new Promise<void>((resolve, reject) => {
    const child = spawn(cliPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log('[parakeet] stdout:', output);
    });

    child.stderr?.on('data', (data) => {
      const error = data.toString();
      stderr += error;
      console.log('[parakeet] stderr:', error);
    });

    child.on('exit', (code) => {
      if (code === 0) {
        console.log('[parakeet] 执行成功');
        if (onProgress) {
          onProgress(100, '转录完成');
        }
        resolve();
      } else {
        const errorMsg = stderr || stdout || `parakeet failed with exit code ${code}`;
        console.log('[parakeet] 执行失败，退出码:', code);
        reject(new Error(`parakeet failed: ${code}\n${errorMsg}`));
      }
    });

    child.on('error', (e) => {
      console.log('[parakeet] 进程错误:', e);
      reject(e);
    });
  });
}

// 根据配置计算动态输出端口
function getDynamicOutputs(config?: NodeConfig): PortSchema[] {
  const outputs: PortSchema[] = [];
  const outputFormats: string[] = Array.isArray(config?.outputFormats) ? config.outputFormats : ['txt', 'srt', 'vtt', 'json'];
  const formatMap: Record<string, { key: string; label: string; type: ValueType }> = {
    txt: { key: 'txt', label: 'TXT 文件', type: 'file' },
    srt: { key: 'srt', label: 'SRT 文件', type: 'file' },
    vtt: { key: 'vtt', label: 'VTT 文件', type: 'file' },
    json: { key: 'json', label: 'JSON 文件', type: 'file' }
  };

  for (const format of outputFormats) {
    const formatDef = formatMap[format];
    if (formatDef) {
      outputs.push({ key: formatDef.key, label: formatDef.label, type: formatDef.type });
    }
  }

  return outputs;
}

export const TranscribeParakeetNode: NodeHandler = {
  spec: {
    id: 'media/transcribe-parakeet',
    label: '音视频转录 (Parakeet)',
    category: 'Media',
    description: '使用 Parakeet CLI 对音频或视频进行离线转录',
    requires: ['plugin:parakeet', 'plugin:ffmpeg'],
    inputs: [{ key: 'media', label: '媒体文件', type: ['file', 'string'], required: true }],
    configGroups: {
      basic: { label: '基础属性', defaultExpanded: true },
      advanced: { label: '高级设置', defaultExpanded: false }
    },
    config: [
      {
        key: 'model',
        label: '模型',
        type: 'string',
        required: true,
        default: 'parakeet-v3',
        description: '选择 Parakeet 模型',
        inputType: 'select-menu',
        options: PARAKEET_MODELS.map((m) => ({
          value: m.id,
          label: `${m.name}`,
          description: `${m.description} - ${m.supportLangs}`
        }))
      },
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
          { value: 'json', label: 'JSON - JSON 格式文件' }
        ]
      },
      {
        key: 'autoDetect',
        label: '智能断句',
        type: 'boolean',
        required: false,
        default: false,
        description: '使用智能断句算法（将字级时间戳合并为段落）',
        group: 'advanced'
      }
    ],
    outputs: [
      { key: 'txt', label: 'TXT 文件', type: 'file' },
      { key: 'srt', label: 'SRT 文件', type: 'file' },
      { key: 'vtt', label: 'VTT 文件', type: 'file' },
      { key: 'json', label: 'JSON 文件', type: 'file' }
    ]
  },
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
      console.log(`[parakeet] 媒体文件总时长: ${durationStr} (${totalDuration.toFixed(2)}秒)`);
    } else {
      console.log('[parakeet] 无法获取媒体文件时长');
    }

    // 发送开始进度
    emit('node:progress', { progress: 0, message: '开始转录...' });

    // 获取模型路径
    const modelId = String(config?.model || 'parakeet-v3');
    const { pluginResourceManager } = await import('../../plugins');
    const modelDir = pluginResourceManager.getModelPath('plugin:parakeet', modelId);

    if (!fs.existsSync(modelDir)) {
      throw new Error(`模型目录不存在: ${modelDir}`);
    }

    console.log('[parakeet] 使用模型目录:', modelDir);

    // Parakeet CLI 参数
    const args: string[] = ['--model', modelDir, '--input', finalSrc, '--output-dir', outDir, '--output-filename', base, '--output-format', 'txt, srt, json'];
    // 创建进度回调函数
    const onProgress = (progress: number, message: string): void => {
      emit('node:progress', { progress, message });
    };

    console.log(args.join(' '));

    await runParakeet(args, onProgress, totalDuration);

    // 读取 JSON 输出文件
    const jsonFilePath = path.join(outDir, `${base}.json`);
    if (!fs.existsSync(jsonFilePath)) {
      throw new Error(`输出文件不存在: ${jsonFilePath}`);
    }

    const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));

    // 处理 tokenTimings
    let segments: Array<{ text: string; start: number; end: number }> = [];
    if (jsonData && Array.isArray(jsonData.tokenTimings) && jsonData.tokenTimings.length > 0) {
      segments = jsonData.tokenTimings.map((item: any) => ({
        text: item.text,
        start: item.startMs || 0,
        end: item.endMs || 0
      }));

      // 如果启用智能断句
      const autoDetect = config?.autoDetect === true;
      if (autoDetect && segments.length > 0) {
        // 简单的智能断句：根据标点符号和时间间隔
        const mergedSegments: typeof segments = [];
        let currentSegment = { ...segments[0] };

        for (let i = 1; i < segments.length; i++) {
          const seg = segments[i];
          const timeGap = seg.start - currentSegment.end;

          // 如果时间间隔小于 2 秒，则合并
          if (timeGap < 2000) {
            currentSegment.text += seg.text;
            currentSegment.end = seg.end;
          } else {
            mergedSegments.push(currentSegment);
            currentSegment = { ...seg };
          }
        }
        mergedSegments.push(currentSegment);
        segments = mergedSegments;
      }
    }

    // 生成各种格式文件
    const outputFormats = Array.isArray(config?.outputFormats) ? config.outputFormats : ['txt', 'srt', 'vtt', 'json'];

    // 生成 TXT 文件
    const txtFilePath = path.join(outDir, `${base}.txt`);
    console.log('[parakeet] txtFilePath:', txtFilePath, JSON.stringify(config));
    if (outputFormats.includes('txt')) {
      const textContent = segments.map((seg) => seg.text).join('');
      fs.writeFileSync(txtFilePath, textContent, 'utf8');
    }

    // 生成 SRT 文件
    const srtFilePath = path.join(outDir, `${base}.srt`);
    if (outputFormats.includes('srt')) {
      let srtContent = '';
      segments.forEach((seg, index) => {
        const startTime = formatSrtTime(seg.start);
        const endTime = formatSrtTime(seg.end);
        srtContent += `${index + 1}\n${startTime} --> ${endTime}\n${seg.text}\n\n`;
      });
      fs.writeFileSync(srtFilePath, srtContent, 'utf8');
    }

    // 生成 VTT 文件
    const vttFilePath = path.join(outDir, `${base}.vtt`);
    if (outputFormats.includes('vtt')) {
      let vttContent = 'WEBVTT\n\n';
      segments.forEach((seg) => {
        const startTime = formatVttTime(seg.start);
        const endTime = formatVttTime(seg.end);
        vttContent += `${startTime} --> ${endTime}\n${seg.text}\n\n`;
      });
      fs.writeFileSync(vttFilePath, vttContent, 'utf8');
    }

    // 如果不输出 JSON 格式，删除临时 JSON 文件
    if (!outputFormats.includes('json')) {
      fs.unlinkSync(jsonFilePath);
    }

    // 收集输出
    const out: Record<string, any> = {
      segments: segments.map((seg) => ({
        text: seg.text,
        timestamps: {
          from: msToTimeString(seg.start),
          to: msToTimeString(seg.end)
        }
      }))
    };

    if (outputFormats.includes('txt') && fileExists(txtFilePath)) {
      out.txt = txtFilePath;
      out.text = fs.readFileSync(txtFilePath, 'utf8');
    }
    if (outputFormats.includes('srt') && fileExists(srtFilePath)) {
      out.srt = srtFilePath;
    }
    if (outputFormats.includes('vtt') && fileExists(vttFilePath)) {
      out.vtt = vttFilePath;
    }
    if (outputFormats.includes('json') && fileExists(jsonFilePath)) {
      out.json = jsonFilePath;
    }

    return out;
  }
};

// 辅助函数：格式化时间戳
function formatSrtTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = ms % 1000;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
}

function formatVttTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = ms % 1000;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

function msToTimeString(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = ms % 1000;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}
