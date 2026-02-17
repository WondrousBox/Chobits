import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { writeFile, writeLocalJSON } from '@aim-packages/file-utils';
import { filter, parser, tools } from '@aim-packages/subtitle';
import ffmpeg from 'fluent-ffmpeg';

import { NodeHandler } from '../types';

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

// 关键词过滤列表
const defaultKeywords: string[][] = [
  ['请不吝点赞 订阅 转发 打赏支持明镜与点点栏目', ''],
  ['請不吝點贊訂閱轉發打賞支持明鏡與點點欄目', ''],
  ['明镜需要您的支持 欢迎订阅明镜', ''],
  ['中文字幕由 Amara.org 社群提供', ''],
  ['由 Amara.org 社群提供的字幕', ''],
  ['中文字幕由Amara.org社区提供', ''],
  ['小編字幕由Amara.org社區提供', ''],
  ['字幕制作/时间轴:秋月', ''],
  ['明镜与点点栏目', ''],
  ['优优独播剧场——YoYo Television Series Exclusive', ''],
  ['中文字幕志愿者申请', ''],
  ['字幕志愿者 杨栋梁', ''],
  ['Amara.org', ''],
  ['www.mooji.org', ''],
  ['Transcribed by https://otter.ai', ''],
  ['https://otter.ai', '']
];

// 关键词后处理
function postProcessKeywordReplace(text: string, keywords: string[][]): string {
  if (!text || !keywords || keywords.length === 0) return text;
  let result = text;
  const sortedKeywords = [...keywords].sort((a, b) => (b[0]?.length || 0) - (a[0]?.length || 0));
  for (const [keyword, replaceText] of sortedKeywords) {
    if (keyword && keyword.length > 0) {
      result = result.split(keyword).join(replaceText ?? '');
    }
  }
  return result;
}

// 检测标点符号
function detectCJKHindiPunctuation(text: string, language?: string, maxSegmentLength?: number): { hasPunctuation: boolean; matches: string[]; languageName: string } {
  const chinesePunctuation = ['。', '、', '，', '！', '？', '；', '…'];
  const japanesePunctuation = ['。', '、', '，', '！', '？', '；', '…', '‥'];
  const koreanPunctuation = ['。', '，', '！', '？', '；', '…'];
  const hindiPunctuation = ['।', '॥', '，', '？', '！', '；', '…'];
  const englishPunctuation = ['.', ',', '!', '?', ';', ':', '...'];

  let targetPunctuation: string[] = [];
  let languageName = '';

  switch (language) {
    case 'zh':
    case 'zh_s':
    case 'zh_t':
      targetPunctuation = chinesePunctuation;
      languageName = '中文';
      break;
    case 'ja':
      targetPunctuation = japanesePunctuation;
      languageName = '日文';
      break;
    case 'ko':
      targetPunctuation = koreanPunctuation;
      languageName = '韩文';
      break;
    case 'hi':
      targetPunctuation = hindiPunctuation;
      languageName = '印地语';
      break;
    case 'yue':
      targetPunctuation = chinesePunctuation;
      languageName = '粤语';
      break;
    default:
      targetPunctuation = englishPunctuation;
      languageName = language ? `未知(${language})` : '英文';
      break;
  }

  const matches: string[] = [];
  for (const char of text) {
    if (targetPunctuation.includes(char) && !matches.includes(char)) matches.push(char);
  }

  if (maxSegmentLength != null && maxSegmentLength > 0) {
    let currentSegmentLength = 0;
    for (const char of text) {
      if (targetPunctuation.includes(char)) currentSegmentLength = 0;
      else {
        currentSegmentLength++;
        if (currentSegmentLength > maxSegmentLength) {
          return { hasPunctuation: false, matches: [], languageName };
        }
      }
    }
  }

  return { hasPunctuation: matches.length > 0, matches, languageName };
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
async function runParakeet(args: string[], onProgress?: (progress: number, message: string) => void): Promise<void> {
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

export const TranscribeParakeetNode: NodeHandler = {
  spec: {
    id: 'media/transcribe-parakeet',
    label: '音视频转录 (Parakeet)',
    category: 'Media',
    description: '使用 Parakeet CLI 对音频或视频进行离线转录',
    requires: ['plugin:parakeet', 'plugin:ffmpeg'],
    inputs: [{ key: 'media', label: '媒体文件', type: ['file', 'string'], required: true }],
    configGroups: {
      basic: { label: '基础属性', defaultExpanded: true }
    },
    config: [
      {
        key: 'model',
        label: '模型',
        type: 'string',
        required: true,
        default: '',
        description: '选择 Parakeet 模型进行转录',
        inputType: 'select-menu',
        options: PARAKEET_MODELS.map((m) => ({
          value: m.id,
          label: m.name,
          description: `${m.description} (${m.supportLangs})`
        }))
      }
    ],
    outputs: [{ key: 'srt', label: 'SRT 文件', type: 'file' }]
  },
  async run({ input, config, emit }) {
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
    const modelId = config?.model;
    if (!modelId) {
      throw new Error('请选择转录模型');
    }
    const { pluginResourceManager } = await import('../../plugins');
    const modelDir = pluginResourceManager.getModelPath('plugin:parakeet', modelId);

    if (!fs.existsSync(modelDir)) {
      throw new Error(`模型目录不存在: ${modelDir}`);
    }

    console.log('[parakeet] 使用模型目录:', modelDir);

    // Parakeet CLI 参数
    const args: string[] = ['--model', modelDir, '--input', finalSrc, '--output-dir', outDir, '--output-filename', base, '--output-format', 'json'];
    // 创建进度回调函数
    const onProgress = (progress: number, message: string): void => {
      emit('node:progress', { progress, message });
    };

    console.log(args.join(' '));

    await runParakeet(args, onProgress);

    // 读取 JSON 输出文件
    const jsonFilePath = path.join(outDir, `${base}.json`);
    if (!fs.existsSync(jsonFilePath)) {
      throw new Error(`输出文件不存在: ${jsonFilePath}`);
    }

    const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));

    // 收集输出
    const out: Record<string, any> = {};

    await (async () => {
      try {
        // 1. 解析 Parakeet JSON 为 AIM 段落
        const s = await parser.parakeetToAimSegments(jsonData);
        if (!Array.isArray(s) || s.length === 0) {
          console.warn('[parakeet] 解析结果为空');
          return;
        }

        const segmentsPath = path.join(outDir, `${base}.segments.json`);
        let segmentsToWrite: any[] = s;

        // 2. 标点检测 + 关键词过滤 + 按句长分段（默认开启）
        const allText = s.map((item: any) => item.text ?? '').join('');
        const punctuationResult = detectCJKHindiPunctuation(allText, undefined, 200);

        if (punctuationResult.hasPunctuation) {
          const allChildren = s.map((item: any) => item.children ?? []).flat();
          const sf = new filter.StreamFilter();
          sf.reParse(defaultKeywords);
          const sentenceLength = 75;
          const allParsedSegments: any[] = [];

          const segmentParser = parser.createSegmentStreamParser({
            onParse: (event: any) => {
              if (event?.type === 'event' && event?.event === 'message' && event?.data) {
                event.data.forEach((segment: any) => {
                  let processedText = sf.feedAll(segment.text ?? '').trim();
                  processedText = postProcessKeywordReplace(processedText, defaultKeywords);
                  segment.text = processedText;
                });
                allParsedSegments.push(...event.data.filter((seg: any) => !!seg.text));
              }
            },
            onEnd: () => {
              //
            },
            sentenceLength
          });
          segmentParser.feed(allChildren.length > 0 ? allChildren : []);
          segmentParser.end();
          segmentsToWrite = allParsedSegments.length > 0 ? allParsedSegments : s;
        }

        // 3. 保存 segments.json
        await writeLocalJSON(segmentsPath, segmentsToWrite);

        // 4. 从 segments 生成 SRT 文件
        const srtFilePath = path.join(outDir, `${base}.srt`);
        const iSegments: [string, string, string, string | undefined][] = segmentsToWrite.map((seg: { st: string; et: string; text: string }) => [seg.st, seg.et, seg.text ?? '', undefined]);
        const srtContent = tools.outputSrt({ segments1: iSegments });
        await writeFile(srtFilePath, srtContent);

        out.srt = srtFilePath;
      } catch (err) {
        console.warn('[parakeet] segments 处理或写入失败:', err);
      }
    })();

    // 删除临时 JSON 文件（内部使用，不对外暴露）
    fs.unlinkSync(jsonFilePath);

    return out;
  }
};
