import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { platform } from 'node:os';
import path from 'node:path';

import ffmpeg from 'fluent-ffmpeg';

import { NodeConfig, NodeHandler, PortSchema, ValueType } from '../types';

// 转录片段接口
interface TranscriptSegment {
  timestamps: {
    from: string;
    to: string;
  };
  text: string;
}

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
        console.log('[funasr] 无法获取媒体文件时长:', err.message);
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

// 检查音频格式是否符合 FunASR 要求 (16kHz, 16-bit, mono WAV)
async function checkAudioFormat(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.log('[funasr] ffprobe error:', err.message);
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

// 转码音频为 FunASR 要求的格式
async function transcodeAudio(filePath: string, outputDir: string): Promise<string> {
  const fileName = path.basename(filePath, path.extname(filePath));
  const targetPath = path.join(outputDir, `${fileName}_16k.wav`);

  if (fileExists(targetPath)) {
    console.log('[funasr] 使用已存在的转码文件:', targetPath);
    return targetPath;
  }

  console.log('[funasr] 开始转码:', filePath, '->', targetPath);
  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .toFormat('wav')
      .audioFrequency(16000)
      .audioChannels(1)
      .audioCodec('pcm_s16le')
      .on('error', (err) => {
        console.error('[funasr] 转码失败:', err);
        reject(err);
      })
      .on('end', () => {
        console.log('[funasr] 转码完成');
        resolve(targetPath);
      })
      .save(targetPath);
  });
}

// 运行 FunASR CLI
async function runFunASR(args: string[], onProgress?: (progress: number, message: string) => void, totalDuration?: number | null): Promise<{ success: boolean }> {
  const { pluginResourceManager } = await import('../../plugins');
  const binaryName = platform() === 'win32' ? 'funasr.exe' : 'funasr';
  const cliPath = pluginResourceManager.getEnginePath('plugin:funasr', binaryName);

  if (!fs.existsSync(cliPath)) {
    throw new Error(`FunASR CLI not found at: ${cliPath}`);
  }

  console.log('[funasr] CLI path:', cliPath);
  console.log('[funasr] args:', args.join(' '));

  return new Promise<{ success: boolean }>((resolve, reject) => {
    const child = spawn(cliPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log('[funasr] stdout:', output);
    });

    child.stderr?.on('data', (data) => {
      const error = data.toString();
      stderr += error;
      console.log('[funasr] stderr:', error);
    });

    child.on('exit', (code) => {
      if (code === 0) {
        console.log('[funasr] 执行成功');
        if (onProgress) {
          onProgress(100, '转录完成');
        }

        resolve({
          success: true
        });
      } else {
        const errorMsg = stderr || stdout || `funasr failed with exit code ${code}`;
        console.log('[funasr] 执行失败，退出码:', code);
        reject(new Error(`funasr failed: ${code}\n${errorMsg}`));
      }
    });

    child.on('error', (e) => {
      console.log('[funasr] 进程错误:', e);
      reject(e);
    });
  });
}

// 根据配置计算动态输出端口
function getDynamicOutputs(config?: NodeConfig): PortSchema[] {
  const outputs: PortSchema[] = [{ key: 'segments', label: '分段 JSON', type: 'object' }];

  const outputFormats: string[] = Array.isArray(config?.outputFormats) ? config.outputFormats : ['txt', 'srt', 'json'];
  const formatMap: Record<string, { key: string; label: string; type: ValueType }> = {
    txt: { key: 'txt', label: 'TXT 文件', type: 'file' },
    srt: { key: 'srt', label: 'SRT 文件', type: 'file' },
    json: { key: 'json', label: 'JSON 文件', type: 'file' }
  };

  for (const format of outputFormats) {
    const formatDef = formatMap[format];
    if (formatDef) {
      if (formatDef.key === 'txt') {
        outputs.push({ key: 'text', label: '全文文本', type: 'string' });
      } else {
        outputs.push({ key: formatDef.key, label: formatDef.label, type: formatDef.type });
      }
    }
  }

  return outputs;
}

export const TranscribeFunASRNode: NodeHandler = {
  spec: {
    id: 'media/transcribe-funasr',
    label: '音视频转录 (FunASR)',
    category: 'Media',
    description: '使用 FunASR CLI 对音频或视频进行离线转录',
    requires: ['plugin:funasr', 'plugin:ffmpeg'],
    inputs: [{ key: 'media', label: '媒体文件', type: ['file', 'string'], required: true }],
    configGroups: {
      basic: { label: '基础属性', defaultExpanded: true },
      advanced: { label: '高级设置', defaultExpanded: false }
    },
    config: [
      {
        key: 'outputFormats',
        label: '输出格式',
        type: 'array',
        required: false,
        default: ['txt', 'srt', 'json'],
        description: '输出格式列表',
        inputType: 'select-multiple',
        options: [
          { value: 'txt', label: 'TXT - 纯文本文件' },
          { value: 'srt', label: 'SRT - 字幕文件' },
          { value: 'json', label: 'JSON - JSON 格式文件' }
        ]
      },
      {
        key: 'useSpk',
        label: '使用SPK模型',
        type: 'boolean',
        required: false,
        default: false,
        description: '启用说话人识别',
        group: 'advanced'
      }
    ],
    outputs: [
      { key: 'txt', label: 'TXT 文件', type: 'file' },
      { key: 'srt', label: 'SRT 文件', type: 'file' },
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
      console.log(`[funasr] 媒体文件总时长: ${durationStr} (${totalDuration.toFixed(2)}秒)`);
    } else {
      console.log('[funasr] 无法获取媒体文件时长');
    }

    // 发送开始进度
    emit('node:progress', { progress: 0, message: '开始转录...' });

    // 获取FFmpeg路径
    const ffmpegPath = ctx.ffmpegPath;

    // 获取模型目录
    const { pluginResourceManager } = await import('../../plugins');
    const modelsDir = pluginResourceManager.getPluginResourceDir('plugin:funasr', 'model');

    if (!fs.existsSync(modelsDir)) {
      throw new Error(`模型目录不存在: ${modelsDir}`);
    }

    console.log('[funasr] 使用模型目录:', modelsDir);

    // 查找各个模型的路径
    // const modelPaths = findModelPaths(modelsDir);
    const models = getModels({ modelsDir });
    const asrModel = models.find((m) => m.type === 'asr');
    if (!asrModel?.path) {
      throw new Error('ASR模型不存在');
    }

    if (!ffmpegPath) {
      throw new Error('FFmpeg路径不存在');
    }

    // 根据平台自动选择设备：Windows用CUDA，macOS用MPS
    const device = platform() === 'win32' ? 'cuda' : 'mps';
    console.log(`[funasr] 检测到平台: ${platform()}, 使用设备: ${device}`);

    // FunASR CLI 参数
    const args: string[] = ['--device', device, '--model', asrModel?.path, '--input', finalSrc, '--output-dir', outDir, '--ffmpeg-path', ffmpegPath, '--output-filename', base, '--sentence-timestamp'];

    console.log('[funasr] 模型列表:', models);

    // VAD模型 - 默认开启，使用 --vad-model 参数
    const vadModel = models.find((m) => m.type === 'vad');
    if (vadModel && fs.existsSync(vadModel.path)) {
      args.push('--vad-model', vadModel.path);
      console.log('[funasr] 已启用VAD模型:', vadModel.path);
    } else {
      console.log('[funasr] ⚠️ VAD模型未找到，跳过');
    }

    // PUNC模型 - 默认开启，使用 --punc-model 参数
    const puncModel = models.find((m) => m.type === 'punc');
    if (puncModel && fs.existsSync(puncModel.path)) {
      args.push('--punc-model', puncModel.path);
      console.log('[funasr] 已启用PUNC模型:', puncModel.path);
    } else {
      console.log('[funasr] ⚠️ PUNC模型未找到，跳过');
    }

    // SPK模型 - 使用 --spk-model 参数
    if (config?.useSpk) {
      const spkModel = models.find((m) => m.type === 'spk');
      if (spkModel && fs.existsSync(spkModel.path)) {
        args.push('--spk-model', spkModel.path);
      }
    }

    // 句子级时间戳
    if (config?.sentenceTimestamp) {
      args.push('--sentence-timestamp');
    }

    // 输出格式
    const outputFormats = Array.isArray(config?.outputFormats) ? config.outputFormats : ['txt', 'srt', 'json'];

    // 创建进度回调函数
    const onProgress = (progress: number, message: string): void => {
      emit('node:progress', { progress, message });
    };

    // 运行 FunASR
    const result = await runFunASR(args, onProgress, totalDuration);

    if (!result.success) {
      throw new Error('FunASR 转录失败');
    }

    // FunASR CLI 会自动生成 SRT 和 JSON 文件，从这些文件中读取数据
    const cliSrtPath = path.join(outDir, `${base}.srt`);
    const cliJsonPath = path.join(outDir, `${base}.json`);

    console.log(`[funasr] FunASR CLI 生成的文件:`);
    console.log(`   - SRT: ${cliSrtPath} (存在: ${fs.existsSync(cliSrtPath)})`);
    console.log(`   - JSON: ${cliJsonPath} (存在: ${fs.existsSync(cliJsonPath)})`);

    // 从 SRT 文件读取转录数据
    let segments: TranscriptSegment[] = [];
    if (fs.existsSync(cliSrtPath)) {
      try {
        console.log('[funasr] 从 SRT 文件读取转录数据');
        segments = parseSRTFile(cliSrtPath);
        console.log(`[funasr] ✅ 从 SRT 解析出 ${segments.length} 个片段`);
      } catch (error) {
        console.error('[funasr] ❌ 解析 SRT 文件失败:', error);
      }
    }

    // 生成各种格式文件
    const txtFilePath = path.join(outDir, `${base}.txt`);
    const srtFilePath = path.join(outDir, `${base}.srt`);
    const jsonFilePath = path.join(outDir, `${base}.json`);

    // 生成 TXT 文件 - 使用智能空格分隔
    if (outputFormats.includes('txt')) {
      let textContent = '';
      console.log(`[funasr] 开始拼接 ${segments.length} 个片段的文本内容...`);
      for (let i = 0; i < segments.length; i++) {
        const segText = segments[i].text;
        if (i === 0) {
          textContent += segText;
        } else {
          const prevText = segments[i - 1].text;
          const currText = segText;
          const prevNeedsSpace = needsSpaceSeparator(prevText);
          const currNeedsSpace = needsSpaceSeparator(currText);
          const addSpace = prevNeedsSpace || currNeedsSpace;
          textContent += addSpace ? ' ' + currText : currText;
        }
      }
      console.log(`[funasr] 最终文本内容长度: ${textContent.length}`);
      fs.writeFileSync(txtFilePath, textContent, 'utf8');
      console.log(`[funasr] ✅ 已生成 TXT 文件: ${txtFilePath}`);
    }

    // 生成 JSON 文件
    if (outputFormats.includes('json')) {
      const jsonContent = {
        transcription: segments.map((seg) => ({
          timestamps: seg.timestamps,
          text: seg.text
        }))
      };
      fs.writeFileSync(jsonFilePath, JSON.stringify(jsonContent, null, 2), 'utf8');
      console.log(`[funasr] ✅ 已生成 JSON 文件: ${jsonFilePath}`);
    }

    // 读取文本内容
    let textContent = '';
    if (outputFormats.includes('txt') && fileExists(txtFilePath)) {
      textContent = fs.readFileSync(txtFilePath, 'utf8');
    } else {
      // 如果不包含 txt 格式，使用 segments 拼接（使用空格分隔）
      console.log('[funasr] ⚠️ 不包含 txt 格式，使用 segments 拼接');
      for (let i = 0; i < segments.length; i++) {
        textContent += segments[i].text + ' ';
      }
      textContent = textContent.trim();
    }

    // 收集输出
    const out: Record<string, any> = {
      segments: segments.map((seg) => ({
        text: seg.text,
        timestamps: seg.timestamps
      }))
    };

    if (outputFormats.includes('txt') && fileExists(txtFilePath)) {
      out.txt = txtFilePath;
      out.text = textContent;
    }
    if (outputFormats.includes('srt') && fileExists(srtFilePath)) {
      out.srt = srtFilePath;
    }
    if (outputFormats.includes('json') && fileExists(jsonFilePath)) {
      out.json = jsonFilePath;
    }

    return out;
  }
};

/**
 * 获取模型列表
 * FunASR需要手动配置模型路径，这里返回用户配置的模型信息
 */
function getModels({ modelsDir }: { modelsDir?: string } = {}): { name: string; type: string; path: string }[] {
  // 如果没有提供modelsDir，使用默认路径
  const targetModelsDir = modelsDir;
  if (!targetModelsDir) {
    throw new Error('模型目录不存在');
  }
  const models: { name: string; type: string; path: string }[] = [];

  if (!fs.existsSync(targetModelsDir)) {
    console.error(`❌ 模型目录不存在: ${targetModelsDir}`);
    return models;
  }

  try {
    const entries = fs.readdirSync(targetModelsDir, { withFileTypes: true });
    for (const entry of entries) {
      // 跳过隐藏文件和系统文件
      if (entry.name.startsWith('.')) {
        console.log(`⏭️ 跳过隐藏文件/文件夹: ${entry.name}`);
        continue;
      }

      console.log(`检查条目: ${entry.name}, 是否为目录: ${entry.isDirectory()}`);

      if (entry.isDirectory()) {
        const modelPath = path.join(targetModelsDir, entry.name);

        // 根据文件夹名称判断模型类型
        let type: 'asr' | 'vad' | 'punc' | 'spk' = 'asr';
        const nameLower = entry.name.toLowerCase();
        // 只显示指定的ASR模型
        if (entry.name === 'speech_paraformer-large-vad-punc_asr_nat-zh-cn-16k-common-vocab8404-pytorch') {
          type = 'asr';
        }
        // 说话人识别模型
        else if (entry.name === 'speech_campplus_sv_zh-cn_16k-common') {
          type = 'spk';
        }
        // 标点模型
        else if (nameLower.includes('punc') && !nameLower.includes('paraformer')) {
          type = 'punc';
        }
        // VAD模型（仅当名称中有 vad 且没有 paraformer/asr 时）
        else if (nameLower.includes('vad') && !nameLower.includes('paraformer') && !nameLower.includes('_asr_')) {
          type = 'vad';
        }
        // 其他模型跳过
        else {
          console.log(`⏭️ 跳过未识别的模型: ${entry.name}`);
          continue;
        }

        models.push({
          name: entry.name,
          type,
          path: modelPath
        });
      } else {
        console.log(`⏭️ 跳过文件: ${entry.name}`);
      }
    }

    console.log(`📊 总共识别到 ${models.length} 个模型`);
    console.log(
      '模型列表:',
      models.map((m) => `${m.name} (${m.type})`)
    );
  } catch (error) {
    console.error('❌ 获取模型列表失败:', error);
  }

  console.log('==========================================');
  return models;
}

/**
 * 检测文本是否需要空格分隔
 * 中文、日文、韩文等语言不需要空格，英文等语言需要空格
 */
function needsSpaceSeparator(text: string): boolean {
  if (!text || text.trim().length === 0) {
    return false;
  }

  // 检测是否包含中文字符
  const hasChinese = /[\u4e00-\u9fff]/.test(text);
  // 检测是否包含日文字符（平假名、片假名、汉字）
  const hasJapanese = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]/.test(text);
  // 检测是否包含韩文字符
  const hasKorean = /[\uac00-\ud7a3]/.test(text);
  // 检测是否包含泰文字符
  const hasThai = /[\u0e00-\u0e7f]/.test(text);
  // 检测是否包含阿拉伯文字符
  const hasArabic = /[\u0600-\u06ff]/.test(text);
  // 检测是否包含希伯来文字符
  const hasHebrew = /[\u0590-\u05ff]/.test(text);

  // 如果包含不需要空格的语言字符，返回 false
  if (hasChinese || hasJapanese || hasKorean || hasThai || hasArabic || hasHebrew) {
    return false;
  }

  // 默认需要空格（英文、法文、西班牙文等）
  return true;
}

/**
 * 解析 SRT 文件
 * SRT 格式示例:
 * 1
 * 00:00:00,170 --> 00:00:00,750
 * 大家好，
 */
function parseSRTFile(filePath: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    // 跳过空行
    if (!lines[i].trim()) {
      i++;
      continue;
    }

    // 序号行（如 "1"）
    if (/^\d+$/.test(lines[i].trim())) {
      i++; // 跳到时间戳行

      // 检查是否有时间戳行
      if (i >= lines.length) break;

      // 时间戳行（如 "00:00:00,170 --> 00:00:00,750"）
      const timestampLine = lines[i];
      const timestampMatch = timestampLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);

      if (timestampMatch) {
        const startTime = timestampMatch[1];
        const endTime = timestampMatch[2];
        i++; // 跳到文本行

        // 收集文本内容（可能多行）
        const textLines: string[] = [];
        while (i < lines.length && lines[i].trim() !== '' && !/^\d+$/.test(lines[i].trim())) {
          textLines.push(lines[i].trim());
          i++;
        }

        const text = textLines.join('\n');

        if (text) {
          segments.push({
            timestamps: {
              from: startTime,
              to: endTime
            },
            text
          });
        }
      } else {
        i++; // 跳过无法解析的行
      }
    } else {
      i++; // 跳过不符合格式的行
    }
  }

  return segments;
}
