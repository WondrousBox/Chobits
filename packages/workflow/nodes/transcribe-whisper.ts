import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const fsp = fs.promises;

import { writeFile, writeLocalJSON } from '@aim-packages/file-utils';
import { filter, parser, tools, utils } from '@aim-packages/subtitle';
import ffmpeg from 'fluent-ffmpeg';

import { onAbort } from '../abort';
import { NodeHandler } from '../types';

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

// 这些内容在转录文本中会被替换为空字符串，避免出现在最终结果里
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
  ['了解更多,請訂閱谷歌頻道、按讚、分享、留言 decky born 會開始平台 Seagull Quiz', ''],
  ['字幕志愿者 杨栋梁', ''],
  ['Amara.org', ''],
  ['www.mooji.org', ''],
  ['Ondertitels ingediend door de Amara.org gemeenschap', ''],
  ['Ondertiteld door de Amara.org gemeenschap', ''],
  ['Ondertiteling door de Amara.org gemeenscha', ''],
  ['Untertitelung aufgrund der Amara.org-Communit', ''],
  ['Untertitel im Auftrag des ZDF für funk, 2017', ''],
  ['Untertitel von Stephanie Geiges', ''],
  ['Untertitel der Amara.org-Community', ''],
  ['Untertitel im Auftrag des ZDF, 2017', ''],
  ['Untertitel im Auftrag des ZDF, 2020', ''],
  ['Untertitel im Auftrag des ZDF, 2018', ''],
  ['Untertitel im Auftrag des ZDF, 2021', ''],
  ['Untertitelung im Auftrag des ZDF, 2021', ''],
  ['Copyright WDR 2021', ''],
  ['Copyright WDR 2020', ''],
  ['Copyright WDR 2019', ''],
  ['SWR 2021', ''],
  ['SWR 2020', ''],
  ['❤️ par SousTitreur.com', ''],
  ['Sottotitoli creati dalla comunità Amara.org', ''],
  ['Sottotitoli di Sottotitoli di Amara.org', ''],
  ['Sottotitoli e revisione al canale di Amara.org', ''],
  ['Sottotitoli e revisione a cura di Amara.org', ''],
  ['Sottotitoli e revisione a cura di QTSS', ''],
  ['Sottotitoli e revisione a cura di QTSS.', ''],
  ['Sottotitoli a cura di QTSS', ''],
  ['Subtítulos realizados por la comunidad de Amara.org', ''],
  ['Subtitulado por la comunidad de Amara.org', ''],
  ['Subtítulos por la comunidad de Amara.org', ''],
  ['Subtítulos creados por la comunidad de Amara.org', ''],
  ['Subtítulos en español de Amara.org', ''],
  ['Subtítulos hechos por la comunidad de Amara.org', ''],
  ['Subtitulos por la comunidad de Amara.or', ''],
  ['Más información www.alimmenta.com', ''],
  ['www.mooji.org', ''],
  ['Subtítulos realizados por la comunidad de Amara.or', ''],
  ['Legendas pela comunidade Amara.org', ''],
  ['Legendas pela comunidade de Amara.org', ''],
  ['Legendas pela comunidade do Amara.org', ''],
  ['Legendas pela comunidade das Amara.org', ''],
  ['Transcrição e Legendas pela comunidade de Amara.or', ''],
  ['Sottotitoli creati dalla comunità Amara.org', ''],
  ['Napisy wykonane przez społeczność Amara.org', ''],
  ['Zdjęcia i napisy stworzone przez społeczność Amara.org', ''],
  ['napisy stworzone przez społeczność Amara.org', ''],
  ['Tłumaczenie i napisy stworzone przez społeczność Amara.org', ''],
  ['Napisy stworzone przez społeczności Amara.org', ''],
  ['Tłumaczenie stworzone przez społeczność Amara.org', ''],
  ['Napisy robione przez społeczność Amara.or', ''],
  ['www.multi-moto.eu', ''],
  ['Редактор субтитров А.Синецкая Корректор А.Егоров', ''],
  ['Yorumlarınızıza abone olmayı unutmayın.', ''],
  ['Sottotitoli creati dalla comunità Amara.or', ''],
  ['MING PAO CANADA | MING PAO TORONTO', ''],
  ['拜拜!', ''],
  ['(字幕製作:貝爾)', ''],
  ['字幕製作:貝爾', ''],
  ['會有coming soon', ''],
  ['(字幕君:我愛你)', ''],
  ['Transcribed by https://otter.ai', ''],
  ['https://otter.ai', ''],
  ['(字幕:J Chong)', ''],
  ['字幕:J Chong', ''],
  ['(字幕:貝爾)', '']
];

// 关键词后处理：补充 StreamFilter，确保短关键词也能被正确替换
function postProcessKeywordReplace(text: string, keywords: string[][]): string {
  if (!text || !keywords || keywords.length === 0) return text;

  let result = text;
  // 按关键词长度从长到短排序，避免短关键词先替换导致长关键词无法匹配
  const sortedKeywords = [...keywords].sort((a, b) => (b[0]?.length || 0) - (a[0]?.length || 0));

  for (const [keyword, replaceText] of sortedKeywords) {
    if (keyword && keyword.length > 0) {
      // 使用全局替换
      result = result.split(keyword).join(replaceText ?? '');
    }
  }

  return result;
}

/** 检测文本中是否包含中日韩印等标点符号（用于决定是否进行分段/关键词后处理） */
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

/** 检查文本是否符合需要合并的模式（小数/年份/版本号等） */
function isValidMergePattern(text: string): boolean {
  if (/^\s*\d+\.\d+\s*$/.test(text)) return true;
  if (/^\s*\d{4}\s*$/.test(text)) {
    const n = parseInt(text.trim(), 10);
    if (n >= 1900 && n <= 2100) return true;
  }
  if (/^\s*v?\d+\.\d+(\.\d+)*\s*$/i.test(text)) return true;
  if (/^\s*\d+\.\d+\.\d+\.\d+\s*$/.test(text)) return true;
  if (/^\s*\d{1,2}\.\d{2}\s*$/.test(text) && parseInt(text.trim().split('.')[0], 10) <= 23) return true;
  if (/^\s*[A-Za-z]+\.\d+\s*$/.test(text)) return true;
  if (/^\s*\d+\.[A-Za-z]+\s*$/.test(text)) return true;
  if (/^\s*[A-Za-z]+\.\d+\.[A-Za-z]+\s*$/.test(text)) return true;
  if (/^\s*\d+\.\s*$/.test(text) || /^\s*\.\d+\s*$/.test(text)) return true;
  if (/^\s*\d+\s*$/.test(text) || /^\s*[A-Za-z]+\s*$/.test(text)) return true;
  return false;
}

function isPunctuationChar(text: string): boolean {
  return /^[\s]*[,.!?;:()[\]{}"'`~@#$%^&*+=|\\/<>_]+[\s]*$/.test(text);
}

/** 合并特殊 token（小数/年份/版本号等），避免被错误拆分 */
function mergeSpecialTokens(tokens: any[], text: string): any[] {
  if (!tokens?.length) return tokens ?? [];
  const hasDecimal = /\d+\.\d+/.test(text);
  const hasYear = /\b(19|20)\d{2}\b/.test(text);
  const hasVersion = /v?\d+\.\d+(\.\d+)*/i.test(text);
  const hasIP = /\b\d+\.\d+\.\d+\.\d+\b/.test(text);
  const hasTime = /\b\d{1,2}\.\d{2}\b/.test(text);
  const hasLetterNumber = /[A-Za-z]+\.\d+|\d+\.[A-Za-z]+/.test(text);
  if (!hasDecimal && !hasYear && !hasVersion && !hasIP && !hasTime && !hasLetterNumber) return tokens;

  const mergedTokens: any[] = [];
  let i = 0;

  while (i < tokens.length) {
    const currentToken = tokens[i];
    if (currentToken.text && (currentToken.text.includes('.') || /^\s*\d+\s*$/.test(currentToken.text) || /^\s*[A-Za-z]+\s*$/.test(currentToken.text))) {
      let mergedText = currentToken.text;
      const mergedOffsets = { ...(currentToken.offsets || {}) };
      const mergedTimestamps = { ...(currentToken.timestamps || {}) };
      let startIndex = i;
      let endIndex = i;

      let j = i - 1;
      while (j >= 0) {
        const prevToken = tokens[j];
        if (!prevToken?.text) break;
        const testText = prevToken.text + mergedText;
        if (isValidMergePattern(testText)) {
          mergedText = testText;
          mergedOffsets.from = prevToken.offsets?.from;
          mergedTimestamps.from = prevToken.timestamps?.from;
          startIndex = j;
          j--;
        } else break;
      }
      j = i + 1;
      while (j < tokens.length) {
        const nextToken = tokens[j];
        if (!nextToken?.text) break;
        const testText = mergedText + nextToken.text;
        if (isValidMergePattern(testText)) {
          mergedText = testText;
          mergedOffsets.to = nextToken.offsets?.to;
          mergedTimestamps.to = nextToken.timestamps?.to;
          endIndex = j;
          j++;
        } else break;
      }

      if (startIndex !== endIndex || isValidMergePattern(mergedText)) {
        let punctuationToken: any = null;
        let punctuationIndex = -1;
        if (endIndex + 1 < tokens.length) {
          const nextToken = tokens[endIndex + 1];
          if (nextToken?.text && isPunctuationChar(nextToken.text)) {
            punctuationToken = nextToken;
            punctuationIndex = endIndex + 1;
          }
        }
        const mergedToken = {
          ...currentToken,
          text: mergedText,
          offsets: mergedOffsets,
          timestamps: mergedTimestamps
        };
        if (punctuationToken) {
          mergedToken.text = mergedText + punctuationToken.text;
          mergedToken.offsets.to = punctuationToken.offsets?.to;
          mergedToken.timestamps.to = punctuationToken.timestamps?.to;
          endIndex = punctuationIndex;
        }
        mergedTokens.push(mergedToken);
        i = endIndex + 1;
      } else {
        mergedTokens.push(currentToken);
        i++;
      }
    } else {
      mergedTokens.push(currentToken);
      i++;
    }
  }
  return mergedTokens;
}

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
async function transcodeAudio(filePath: string, outputDir: string, signal?: AbortSignal): Promise<string> {
  const fileName = path.basename(filePath, path.extname(filePath));
  const targetPath = path.join(outputDir, `${fileName}_16k.wav`);

  // 如果目标文件已存在，直接返回 (假设已转码)
  if (fileExists(targetPath)) {
    console.log('[whisper] 使用已存在的转码文件:', targetPath);
    return targetPath;
  }

  console.log('[whisper] 开始转码:', filePath, '->', targetPath);
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(filePath)
      .toFormat('wav')
      .audioFrequency(16000)
      .audioChannels(1)
      .audioCodec('pcm_s16le');
    const removeAbortListener = onAbort(signal, () => cmd.kill('SIGKILL'));
    cmd
      .on('error', (err) => {
        removeAbortListener();
        console.error('[whisper] 转码失败:', err);
        reject(err);
      })
      .on('end', () => {
        removeAbortListener();
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
    const child = spawn(whisperCmd, args, { stdio: ['ignore', 'pipe', 'pipe'], signal: ctx.signal });

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

// 输出端口固定为分段 JSON + SRT 文件 + JSON 文件

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
        default: '',
        description: '选择 Whisper 模型，更大的模型通常更准确但速度更慢',
        // 使用带描述和子菜单的下拉菜单
        inputType: 'select-menu',
        options: [
          {
            value: 'tiny-series',
            label: '最快速',
            description: '精度较低，适合实时预览',
            children: [
              { value: 'ggml-tiny.bin', label: 'Tiny', description: '多语言，适合大多数场景' },
              { value: 'ggml-tiny.en.bin', label: 'Tiny English', description: '仅英语，速度快，精度较低' }
            ]
          },
          {
            value: 'base-series',
            label: '均衡',
            description: '速度与精度平衡，通用推荐',
            children: [
              { value: 'ggml-base.bin', label: 'Base', description: '多语言，综合表现平衡' },
              { value: 'ggml-base.en.bin', label: 'Base English', description: '仅英语，略快一些' },
              { value: 'ggml-small.bin', label: 'Small', description: '多语言，适合大多数正式场景' },
              { value: 'ggml-small.en.bin', label: 'Small English', description: '仅英语，精度和速度折中' }
            ]
          },
          {
            value: 'large-series',
            label: '高质量',
            description: '最高精度，适合离线批处理和高质量场景',
            children: [
              { value: 'ggml-medium.bin', label: 'Medium', description: '多语言，高精度但更耗时' },
              { value: 'ggml-medium.en.bin', label: 'Medium English', description: '仅英语，高精度' },
              { value: 'ggml-large-v1.bin', label: 'Large v1', description: '最高精度版本 v1' },
              { value: 'ggml-large-v2.bin', label: 'Large v2', description: '最高精度版本 v2，改进对某些语言的表现' },
              { value: 'ggml-large-v3.bin', label: 'Large v3', description: '最新 large 模型，综合表现最好' }
            ]
          }
        ]
      },
      {
        key: 'language',
        label: '语言',
        type: 'string',
        required: true,
        description: '选择转录语言，留空或选择"自动"将自动检测',
        default: '',
        inputType: 'select',
        searchable: true,
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
      { key: 'printProgress', label: '打印进度', type: 'boolean', required: false, default: false, group: 'more' },
      { key: 'vad', label: '语音活动检测', type: 'boolean', required: false, default: false, description: '通过VAD识别人说话部分' },
      { key: 'noTimestamps', label: '无时间戳', type: 'boolean', required: false, default: false, group: 'more' },
      { key: 'maxLen', label: '最大句长', type: 'number', required: false, default: 75, description: '分段时最大句长（字符数），0 表示不限制', group: 'advanced' },
      { key: 'dtw', label: '启用 DTW', type: 'boolean', required: false, default: true, description: '启用动态时间规整（DTW）优化', group: 'advanced' },
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
    // 默认输出（固定端口）：仅暴露 SRT；segments 作为同目录下的映射文件存储（与 SRT 同名的 .segments.json）
    outputs: [{ key: 'srt', label: 'SRT 文件', type: 'file' }]
  },
   async run({ input, config, ctx, emit }) {
    const src = String(input.media || '');
    if (!src) throw new Error('缺少媒体文件路径');
    if (!fs.existsSync(src)) throw new Error(`媒体文件不存在: ${src}`);

    const base = path.parse(src).name;

    // 使用资源项目目录系统：如果上下文中有 resourceId，使用 projects/<resourceId>/ 目录结构
    // 否则回退到传统的 <inputFileDir>/transcribe/ 目录
    let projectDirs: {
      isResource: boolean;
      resourceId?: string;
      workspaceId?: string;
      outputsDir: string;
      cacheDir: string;
      tempDir: string;
      dataDir: string;
    };

    if (ctx.getResourceProjectDirs && ctx.resourceId && ctx.workspaceId) {
      const dirs = await ctx.getResourceProjectDirs('transcribe');
      if (dirs) {
        projectDirs = dirs;
      } else {
        // getResourceProjectDirs 返回 null，使用传统目录结构
        const inputDir = path.dirname(src);
        const outDir = path.join(inputDir, 'transcribe');
        if (!fs.existsSync(outDir)) {
          await fsp.mkdir(outDir, { recursive: true });
        }
        projectDirs = {
          isResource: false,
          outputsDir: outDir,
          cacheDir: outDir,
          tempDir: outDir,
          dataDir: outDir
        };
      }
    } else {
      // 没有 resourceId 或 workspaceId，使用传统目录结构
      const inputDir = path.dirname(src);
      const outDir = path.join(inputDir, 'transcribe');
      if (!fs.existsSync(outDir)) {
        await fsp.mkdir(outDir, { recursive: true });
      }
      projectDirs = {
        isResource: false,
        outputsDir: outDir,
        cacheDir: outDir,
        tempDir: outDir,
        dataDir: outDir
      };
    }

    // 根据是否关联资源记录日志
    if (projectDirs.isResource) {
      console.log(`[whisper] 使用资源项目目录: resourceId=${projectDirs.resourceId}, temp=${projectDirs.tempDir}`);
    } else {
      console.log(`[whisper] 使用传统目录: ${projectDirs.tempDir}`);
    }

    // temp 目录用于转写产物（SRT、segments.json 等）
    const outDir = projectDirs.tempDir;
    // cache 目录用于中间文件（转码后的音频）
    const cacheDir = projectDirs.cacheDir;

    // 检查并转码音频
    let finalSrc = src;
    const isCompatible = await checkAudioFormat(src);
    if (!isCompatible) {
      emit('node:progress', { progress: 0, message: '正在转码音频...' });
      try {
        // 转码的中间文件存放在 cache 目录（可复用）
        finalSrc = await transcodeAudio(src, cacheDir, ctx.signal);
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
    if (config?.threads != null && config.threads) args.push('-t', String(config.threads));

    // 翻译模式 (--translate)
    if (config?.translate) args.push('--translate');

    // 输出格式 (-otxt, -osrt, -ovtt, -oj/-ojf, -olrc, -owts)
    // 直接使用完整 JSON 输出 -ojf
    args.push('-ojf');

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

    // DTW 参数 (-dtw)
    // 如果启用 dtw，使用映射后的文件名作为 dtw 参数值
    if (config?.dtw) {
      const modelFileName = dtwMap[modelKey];
      if (modelFileName) {
        args.push('-dtw', modelFileName);
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

    const srcSrtPath = getGeneratedPath('srt');
    const srcJsonPath = getGeneratedPath('json');

    // 移动文件到输出目录
    const srtPath = path.join(outDir, `${base}.srt`);
    const jsonPath = path.join(outDir, `${base}.json`);

    if (fileExists(srcSrtPath)) {
      fs.copyFileSync(srcSrtPath, srtPath);
      fs.unlinkSync(srcSrtPath);
    }
    if (fileExists(srcJsonPath)) {
      fs.copyFileSync(srcJsonPath, jsonPath);
      fs.unlinkSync(srcJsonPath);
    }

    // 收集输出（先完成所有异步写入，再填充 out 并返回）
    const out: Record<string, any> = {};

    await (async () => {
      if (fileExists(srtPath)) out.srt = srtPath;
      if (!fileExists(jsonPath)) return;
      try {
        let obj: any;
        try {
          const jsonBuffer = fs.readFileSync(jsonPath);
          obj = await tools.fixWhisperJsonDecode(jsonBuffer);
        } catch {
          const raw = fs.readFileSync(jsonPath, 'utf8');
          obj = JSON.parse(raw);
        }

        if (obj && typeof obj === 'object') {
          // 1. 对完整 JSON 的 transcription 做 token 级预处理（合并特殊 token、过滤控制标记、重算时间轴）
          if (obj.transcription && Array.isArray(obj.transcription)) {
            obj.transcription.forEach((item: any) => {
              const offsets = item.offsets ?? {};
              if (item.tokens && item.tokens.length) {
                item.tokens = mergeSpecialTokens(item.tokens, item.text ?? '');
                const filteredTokens = item.tokens.filter((token: any) => {
                  const t = token?.text ?? '';
                  return !(t === '[_BEG_]' || t === '[_EOT_]' || /\[_TT_\d+\]/g.test(t));
                });
                if (filteredTokens.length > 0) {
                  const durations = filteredTokens.map((tk: any) => Math.max(0, (tk?.offsets?.to ?? 0) - (tk?.offsets?.from ?? 0)));
                  let cursor = offsets.from ?? 0;
                  filteredTokens.forEach((token: any, idx: number) => {
                    const d = durations[idx] ?? 0;
                    const f = cursor;
                    const t = f + d;
                    if (token.offsets) {
                      token.offsets.from = f;
                      token.offsets.to = t;
                    }
                    if (token.timestamps) {
                      token.timestamps.from = utils.formatTime(f / 1000);
                      token.timestamps.to = utils.formatTime(t / 1000);
                    }
                    cursor = t;
                  });
                  if (cursor > (offsets.to ?? 0)) {
                    item.offsets = item.offsets ?? {};
                    item.offsets.to = cursor;
                    if (item.timestamps) item.timestamps.to = utils.formatTime(cursor / 1000);
                  }
                }
                item.tokens = filteredTokens;
              }
            });
          }

          // 2. 转为 AIM 段落
          const s = await parser.whisperJsonToAimSegments(obj);
          if (!Array.isArray(s)) return;

          const segmentsPath = path.join(outDir, `${base}.segments.json`);
          let segmentsToWrite: any[] = s;

          // 3. 标点检测 + 关键词过滤 + 按句长分段（默认开启）
          const detectedLanguage = obj?.result?.language ?? '';
          const allText = s.map((item: any) => item.text ?? '').join('');
          const punctuationResult = detectCJKHindiPunctuation(allText, detectedLanguage, 200);

          if (punctuationResult.hasPunctuation) {
            const allChildren = s.map((item: any) => item.children ?? []).flat();
            const sf = new filter.StreamFilter();
            sf.reParse(defaultKeywords);
            const sentenceLength = config?.maxLen != null && config.maxLen > 0 ? config.maxLen : 75;
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

          await writeLocalJSON(segmentsPath, segmentsToWrite);

          // 从最终生成的 segments 生成 SRT，覆盖 Whisper 原始输出的 SRT，保证与 .segments.json 一致
          const iSegments: [string, string, string, string | undefined][] = segmentsToWrite.map((seg: { st: string; et: string; text: string }) => [seg.st, seg.et, seg.text ?? '', undefined]);
          const srtContent = tools.outputSrt({ segments1: iSegments });
          await writeFile(srtPath, srtContent);
          out.srt = srtPath;
        }
      } catch (err) {
        console.warn('[whisper] segments 后处理或写入失败:', err);
      }
    })();

    return out;
  }
};
