/**
 * 批量TTS合成服务
 *
 * 功能特性：
 * 1. 大批量音频片段并发合成
 * 2. 同一配置+同一文本 = 同一音频（MD5去重缓存）
 * 3. 记录音频合成顺序
 * 4. 获取音频时长信息
 * 5. 移除音频空白并生成新音频
 * 6. 返回所有合成结果和历史记录
 */

import { utils } from '@aim-packages/subtitle';
import { createHash } from 'crypto';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs-extra';
import * as path from 'path';

import { silenceAudio } from './common';
import EdgeTTS, { type EdgeTTSOptions } from './edge';
import type { BaseTTS } from './types';

// ==================== FFmpeg配置 ====================

/**
 * 配置FFmpeg路径
 * 必须在使用服务前调用此函数设置正确的ffmpeg/ffprobe路径
 */
export function configureFfmpegPath(ffmpegPath: string, ffprobePath?: string): void {
  if (ffmpegPath && fs.existsSync(ffmpegPath)) {
    ffmpeg.setFfmpegPath(ffmpegPath);
  }
  if (ffprobePath && fs.existsSync(ffprobePath)) {
    ffmpeg.setFfprobePath(ffprobePath);
  }
}

// ==================== 类型定义 ====================

/**
 * TTS服务配置选项（扩展自EdgeTTSOptions，可支持其他TTS引擎）
 */
export interface BatchTTSConfig extends EdgeTTSOptions {
  /** TTS类型，默认 'Edge' */
  type?: 'Edge' | 'OpenAI' | 'Volc' | string;
}

/**
 * 单个TTS合成项
 */
export interface TTSItem {
  /** 唯一标识（可选，如果不提供会自动生成） */
  id?: string;
  /** 待合成的文本 */
  text: string;
  /** 排序索引（可选，用于保证顺序） */
  index?: number;
  /** 字幕片段开始时间（秒）- 用于记录该音频对应的字幕位置 */
  st?: string;
  /** 字幕片段结束时间（秒） */
  et?: string;
}

/**
 * 单个TTS合成结果
 */
export interface TTSItemResult {
  /** 唯一标识 */
  id: string;
  /** 原始文本 */
  text: string;
  /** 排序索引 */
  index: number;
  /** 合成后的音频文件路径 */
  audioPath: string;
  /** 去除空白后的音频文件路径 */
  trimmedAudioPath: string;
  /** 内容的MD5哈希值 */
  md5: string;
  /** 原始音频时长（毫秒） */
  duration: number;
  /** 去除空白后的音频时长（毫秒） */
  trimmedDuration: number;
  /** 是否使用了缓存 */
  fromCache: boolean;
  /** 合成是否成功 */
  success: boolean;
  /** 错误信息（如果失败） */
  error?: string;
}

/**
 * 批量TTS合成请求
 */
export interface BatchTTSRequest {
  /** 请求ID（必填，用于跟踪和取消任务） */
  requestId: string;
  /** 待合成的文本项列表 */
  items: TTSItem[];
  /** TTS配置选项 */
  config: BatchTTSConfig;
  /** 输出目录路径 */
  outputDir: string;
  /** 最大并发数，默认5 */
  maxConcurrency?: number;
  /** 失败后最大重试次数，默认2 */
  maxRetries?: number;
  /** 是否跳过空白移除，默认false */
  skipTrimSilence?: boolean;
  /** HTTP代理（可选） */
  httpProxy?: any;
}

/**
 * 批量TTS合成结果
 */
export interface BatchTTSResult {
  /** 请求ID */
  requestId: string;
  /** 所有合成结果（按index排序） */
  results: TTSItemResult[];
  /** 成功数量 */
  successCount: number;
  /** 失败数量 */
  failedCount: number;
  /** 缓存命中数量 */
  cacheHitCount: number;
  /** 总耗时（毫秒） */
  totalTime: number;
  /** 历史记录 */
  history: BatchTTSHistory;
}

/**
 * 单条音频的元信息（时长 + 字幕位置）
 */
export interface SegmentInfo {
  /** 字幕片段开始时间（SRT 格式字符串，如 00:00:07,100） */
  st?: string;
  /** 字幕片段结束时间（SRT 格式字符串） */
  et?: string;
  /** 原始音频时长（毫秒） */
  duration?: number;
  /** 去静音后时长（毫秒） */
  trimmedDuration?: number;
}

/**
 * 批量TTS历史记录
 */
export interface BatchTTSHistory {
  /** 请求ID */
  requestId: string;
  /** 配置MD5前缀 */
  configPrefix: string;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
  /** 音频文件信息映射（md5 -> 文件路径） */
  audioMap: Record<string, string>;
  /** 去除空白后的音频映射（md5 -> 文件路径） */
  trimmedAudioMap: Record<string, string>;
  /** 音频顺序列表（md5数组） */
  orderList: string[];
  /** 各音频的元信息（md5 -> { st, et, duration, trimmedDuration }） */
  segmentInfoMap: Record<string, SegmentInfo>;
}

/** 将 history 中的音频路径转为相对 outputDir 的路径（用于写入 JSON，便于移动目录） */
function historyPathsToRelative(history: BatchTTSHistory, outputDir: string): BatchTTSHistory {
  const audioMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(history.audioMap)) {
    audioMap[k] = path.relative(outputDir, v).split(path.sep).join('/');
  }
  const trimmedAudioMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(history.trimmedAudioMap)) {
    trimmedAudioMap[k] = path.relative(outputDir, v).split(path.sep).join('/');
  }
  return { ...history, audioMap, trimmedAudioMap };
}

/** 将 history 中的相对路径解析为绝对路径（用于内存中使用；兼容旧 JSON 中的绝对路径） */
function historyPathsToAbsolute(history: BatchTTSHistory, outputDir: string): BatchTTSHistory {
  const audioMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(history.audioMap)) {
    audioMap[k] = path.isAbsolute(v) ? v : path.join(outputDir, v);
  }
  const trimmedAudioMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(history.trimmedAudioMap)) {
    trimmedAudioMap[k] = path.isAbsolute(v) ? v : path.join(outputDir, v);
  }
  return { ...history, audioMap, trimmedAudioMap };
}

/**
 * TTS进度事件
 */
export interface BatchTTSProgressEvent {
  type: 'progress';
  data: {
    /** 当前处理的索引 */
    currentIndex: number;
    /** 总数量 */
    total: number;
    /** 进度百分比 */
    percentage: number;
    /** 进度消息 */
    message: string;
    /** 当前处理的文本（截取前30字符） */
    currentText?: string;
  };
}

/**
 * TTS完成事件
 */
export interface BatchTTSCompleteEvent {
  type: 'complete';
  data: BatchTTSResult;
}

/**
 * TTS错误事件
 */
export interface BatchTTSErrorEvent {
  type: 'error';
  data: {
    message: string;
    code?: string;
    index?: number;
  };
}

/**
 * TTS事件类型
 */
export type BatchTTSEvent = BatchTTSProgressEvent | BatchTTSCompleteEvent | BatchTTSErrorEvent | { type: 'done' };

/**
 * 事件发送函数类型
 */
export type BatchTTSEmitter = (event: BatchTTSEvent) => void;

// ==================== 内部状态管理 ====================

interface ActiveBatchTTS {
  requestId: string;
  startTime: number;
  controller: AbortController;
  config: BatchTTSConfig;
  processedCount: number;
  totalCount: number;
}

// 存储活跃的批量TTS任务
const activeBatchTTSTasks = new Map<string, ActiveBatchTTS>();

// ==================== 工具函数 ====================

/**
 * 生成配置的MD5前缀
 * 用于区分不同配置下的音频缓存
 */
function generateConfigPrefix(config: BatchTTSConfig): string {
  const configStr = JSON.stringify({
    type: config.type || 'Edge',
    voiceName: config.voiceName,
    rate: config.rate,
    pitch: config.pitch
  });
  return createHash('md5').update(configStr).digest('hex').substring(0, 8);
}

/**
 * 生成内容的MD5哈希
 * 配置前缀 + 文本内容 = 唯一标识
 */
function generateContentMd5(configPrefix: string, text: string): string {
  return createHash('md5')
    .update(configPrefix + text)
    .digest('hex');
}

/**
 * 使用ffprobe获取音频时长（毫秒）
 */
async function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.error('[BatchTTS] 获取音频时长失败:', err.message);
        reject(err);
        return;
      }
      const duration = metadata.format?.duration;
      if (duration && typeof duration === 'number') {
        resolve(Math.round(duration * 1000)); // 转换为毫秒
      } else {
        resolve(0);
      }
    });
  });
}

/**
 * 使用ffmpeg移除音频首尾空白
 * 使用silencedetect滤镜检测静音部分，然后裁剪
 */
async function trimAudioSilence(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // 首先检测静音区域
    const silenceInfo: { start: number; end: number; duration: number }[] = [];
    let audioDuration = 0;

    ffmpeg.ffprobe(inputPath, (probeErr, metadata) => {
      if (probeErr) {
        console.error('[BatchTTS] ffprobe失败:', probeErr.message);
        // 如果ffprobe失败，直接复制原文件
        fs.copyFile(inputPath, outputPath).then(resolve).catch(reject);
        return;
      }

      audioDuration = metadata.format?.duration || 0;

      if (audioDuration <= 0) {
        fs.copyFile(inputPath, outputPath).then(resolve).catch(reject);
        return;
      }

      // 使用silencedetect检测静音
      ffmpeg(inputPath)
        .audioFilters('silencedetect=noise=-50dB:d=0.1')
        .format('null')
        .output('-')
        .on('stderr', (line: string) => {
          // 解析silencedetect输出
          // [silencedetect @ xxx] silence_start: 0
          // [silencedetect @ xxx] silence_end: 0.5 | silence_duration: 0.5
          const startMatch = line.match(/silence_start:\s*([\d.]+)/);
          const endMatch = line.match(/silence_end:\s*([\d.]+)/);

          if (startMatch) {
            silenceInfo.push({
              start: parseFloat(startMatch[1]),
              end: -1,
              duration: 0
            });
          }
          if (endMatch && silenceInfo.length > 0) {
            const last = silenceInfo[silenceInfo.length - 1];
            if (last.end === -1) {
              last.end = parseFloat(endMatch[1]);
              last.duration = last.end - last.start;
            }
          }
        })
        .on('error', (err: any) => {
          console.error('[BatchTTS] silencedetect错误:', err.message);
          // 检测失败，直接复制原文件
          fs.copyFile(inputPath, outputPath).then(resolve).catch(reject);
        })
        .on('end', () => {
          // 计算需要裁剪的起止时间
          let trimStart = 0;
          let trimEnd = audioDuration;

          // 检查开头是否有静音
          if (silenceInfo.length > 0 && silenceInfo[0].start < 0.1) {
            trimStart = silenceInfo[0].end > 0 ? silenceInfo[0].end : 0;
          }

          // 检查结尾是否有静音（最后一个静音区域延伸到音频末尾）
          if (silenceInfo.length > 0) {
            const lastSilence = silenceInfo[silenceInfo.length - 1];
            // 如果最后一个静音区域的结束时间接近或超过音频总时长，说明结尾有静音
            if (lastSilence.end === -1 || Math.abs(lastSilence.end - audioDuration) < 0.1 || lastSilence.end >= audioDuration - 0.1) {
              trimEnd = lastSilence.start;
            }
          }

          // 确保裁剪范围有效
          if (trimStart >= trimEnd || trimEnd - trimStart < 0.1) {
            // 无需裁剪或裁剪后太短，直接复制
            fs.copyFile(inputPath, outputPath).then(resolve).catch(reject);
            return;
          }

          // 执行裁剪
          ffmpeg(inputPath)
            .setStartTime(trimStart)
            .setDuration(trimEnd - trimStart)
            .output(outputPath)
            .on('error', (trimErr: any) => {
              console.error('[BatchTTS] 裁剪音频失败:', trimErr.message);
              // 裁剪失败，直接复制原文件
              fs.copyFile(inputPath, outputPath).then(resolve).catch(reject);
            })
            .on('end', () => {
              resolve();
            })
            .run();
        })
        .run();
    });
  });
}

/**
 * 带重试的异步函数执行器
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries: number, delayMs: number = 500): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        console.log(`[BatchTTS] 重试 ${attempt + 1}/${maxRetries}...`);
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

/**
 * 并发控制器
 */
async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, maxConcurrency: number, abortSignal?: AbortSignal): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;
  let activeCount = 0;
  let rejected = false;

  return new Promise<T[]>((resolve, reject) => {
    const maybeStartNext = (): void => {
      if (rejected) return;

      if (abortSignal?.aborted) {
        rejected = true;
        reject(new Error('Aborted'));
        return;
      }

      if (nextIndex >= tasks.length && activeCount === 0) {
        resolve(results);
        return;
      }

      while (activeCount < maxConcurrency && nextIndex < tasks.length && !rejected) {
        const current = nextIndex++;
        activeCount++;

        tasks[current]()
          .then((res) => {
            results[current] = res;
          })
          .catch((err) => {
            if (!rejected) {
              rejected = true;
              reject(err);
            }
          })
          .finally(() => {
            activeCount--;
            maybeStartNext();
          });
      }
    };

    maybeStartNext();
  });
}

/**
 * 创建TTS实例
 */
function createTTSInstance(config: BatchTTSConfig): BaseTTS {
  const type = config.type || 'Edge';
  switch (type) {
    case 'Edge':
      return new EdgeTTS();
    // TODO: 支持其他TTS引擎
    // case 'OpenAI':
    //   return new OpenAITTS();
    // case 'Volc':
    //   return new VolcTTS();
    default:
      return new EdgeTTS();
  }
}

// ==================== 核心服务 ====================

export const BatchTTSService = {
  /**
   * 获取所有活跃的批量TTS任务
   */
  getAllActiveTasks(): ActiveBatchTTS[] {
    return Array.from(activeBatchTTSTasks.values()).map((task) => ({
      requestId: task.requestId,
      startTime: task.startTime,
      controller: task.controller,
      config: task.config,
      processedCount: task.processedCount,
      totalCount: task.totalCount
    }));
  },

  /**
   * 取消批量TTS任务
   */
  cancelTask(requestId: string): boolean {
    const task = activeBatchTTSTasks.get(requestId);
    if (task) {
      console.log(`[BatchTTS] 取消任务 - requestId: ${requestId}`);
      task.controller.abort();
      return true;
    }
    return false;
  },

  /**
   * 检查是否有活跃任务
   */
  hasActiveTasks(): boolean {
    return activeBatchTTSTasks.size > 0;
  },

  /**
   * 加载历史记录
   */
  async loadHistory(outputDir: string, configPrefix: string): Promise<BatchTTSHistory | null> {
    const historyPath = path.join(outputDir, `history-${configPrefix}.json`);
    try {
      if (await fs.pathExists(historyPath)) {
        const data = (await fs.readJson(historyPath)) as Record<string, unknown>;
        // 兼容旧格式：无 segmentInfoMap 时从 durationMap/trimmedDurationMap/segmentStartMap/segmentEndMap 合并
        if (!data.segmentInfoMap && (data.durationMap || data.segmentStartMap)) {
          const segmentInfoMap: Record<string, SegmentInfo> = {};
          const durationMap = data.durationMap as Record<string, number> | undefined;
          const trimmedDurationMap = data.trimmedDurationMap as Record<string, number> | undefined;
          const segmentStartMap = data.segmentStartMap as Record<string, number> | undefined;
          const segmentEndMap = data.segmentEndMap as Record<string, number> | undefined;
          const allMd5 = new Set([
            ...(durationMap ? Object.keys(durationMap) : []),
            ...(trimmedDurationMap ? Object.keys(trimmedDurationMap) : []),
            ...(segmentStartMap ? Object.keys(segmentStartMap) : []),
            ...(segmentEndMap ? Object.keys(segmentEndMap) : [])
          ]);
          for (const md5 of allMd5) {
            const stNum = segmentStartMap?.[md5];
            const etNum = segmentEndMap?.[md5];
            segmentInfoMap[md5] = {
              duration: durationMap?.[md5],
              trimmedDuration: trimmedDurationMap?.[md5],
              st: stNum != null ? utils.formatTime(stNum) : undefined,
              et: etNum != null ? utils.formatTime(etNum) : undefined
            };
          }
          data.segmentInfoMap = segmentInfoMap;
        }
        return historyPathsToAbsolute(data as BatchTTSHistory, outputDir);
      }
    } catch (err) {
      console.error('[BatchTTS] 加载历史记录失败:', err);
    }
    return null;
  },

  /**
   * 更新单条音频的字幕时间（st/et），并写回 history 文件
   */
  async updateSegmentTimes(outputDir: string, configPrefix: string, md5: string, st: number, et: number): Promise<void> {
    const history = await this.loadHistory(outputDir, configPrefix);
    if (!history || !history.segmentInfoMap[md5]) return;
    history.segmentInfoMap[md5] = { ...history.segmentInfoMap[md5], st: utils.formatTime(st), et: utils.formatTime(et) };
    history.updatedAt = Date.now();
    await this.saveHistory(outputDir, history);
  },

  /**
   * 保存历史记录
   */
  async saveHistory(outputDir: string, history: BatchTTSHistory): Promise<void> {
    const historyPath = path.join(outputDir, `history-${history.configPrefix}.json`);
    try {
      const base = historyPathsToRelative(history, outputDir);
      const toWrite = {
        requestId: base.requestId,
        configPrefix: base.configPrefix,
        createdAt: base.createdAt,
        updatedAt: base.updatedAt,
        audioMap: base.audioMap,
        trimmedAudioMap: base.trimmedAudioMap,
        orderList: base.orderList,
        segmentInfoMap: history.segmentInfoMap
      };
      await fs.writeJson(historyPath, toWrite, { spaces: 2 });
    } catch (err) {
      console.error('[BatchTTS] 保存历史记录失败:', err);
    }
  },

  /**
   * 批量合成音频
   */
  async synthesizeBatch(request: BatchTTSRequest, emit: BatchTTSEmitter, externalSignal?: AbortSignal): Promise<BatchTTSResult> {
    const { requestId, items, config, outputDir, maxConcurrency = 5, maxRetries = 2, skipTrimSilence = false, httpProxy } = request;

    const startTime = Date.now();
    const configPrefix = generateConfigPrefix(config);
    const tts = createTTSInstance(config);

    // 创建AbortController
    const controller = new AbortController();
    activeBatchTTSTasks.set(requestId, {
      requestId,
      startTime,
      controller,
      config,
      processedCount: 0,
      totalCount: items.length
    });

    // 处理外部中止信号
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', () => controller.abort());
      }
    }

    const signal = controller.signal;

    try {
      // 确保输出目录存在
      await fs.ensureDir(outputDir);
      await fs.ensureDir(path.join(outputDir, 'audio'));
      await fs.ensureDir(path.join(outputDir, 'trimmed'));

      // 加载历史记录
      console.log(`[BatchTTS] 加载历史记录 - outputDir: ${outputDir}, configPrefix: ${configPrefix}`);
      let history = await this.loadHistory(outputDir, configPrefix);
      console.log(`[BatchTTS] 历史记录状态 - 已存在: ${!!history}, 缓存数量: ${history ? Object.keys(history.audioMap).length : 0}`);
      if (!history) {
        history = {
          requestId,
          configPrefix,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          audioMap: {},
          trimmedAudioMap: {},
          orderList: [],
          segmentInfoMap: {}
        };
      }

      console.log(`[BatchTTS] 开始批量合成任务 - requestId: ${requestId}, items: ${items.length}, config: ${configPrefix}`);

      emit({
        type: 'progress',
        data: {
          currentIndex: 0,
          total: items.length,
          percentage: 0,
          message: '准备合成...'
        }
      });

      const results: TTSItemResult[] = [];
      let successCount = 0;
      let failedCount = 0;
      let cacheHitCount = 0;
      const orderList: string[] = [];

      // 单个项目的合成函数
      const synthesizeItem = async (item: TTSItem, index: number): Promise<TTSItemResult> => {
        if (signal.aborted) {
          throw new Error('Aborted');
        }

        const itemIndex = item.index ?? index;
        const md5 = generateContentMd5(configPrefix, item.text);
        const audioFileName = `${md5}.mp3`;
        const audioPath = path.join(outputDir, 'audio', audioFileName);
        const trimmedFileName = `${md5}_trimmed.mp3`;
        const trimmedPath = path.join(outputDir, 'trimmed', trimmedFileName);

        const result: TTSItemResult = {
          id: item.id || `item-${itemIndex}`,
          text: item.text,
          index: itemIndex,
          audioPath,
          trimmedAudioPath: trimmedPath,
          md5,
          duration: 0,
          trimmedDuration: 0,
          fromCache: false,
          success: false
        };

        try {
          console.log(`[BatchTTS] [${itemIndex}] ${md5} "${item.text.substring(0, 30)}${item.text.length > 30 ? '...' : ''}"`);

          // 检查缓存
          const cachedAudioPath = history!.audioMap[md5];
          const hasCachedAudio = cachedAudioPath && (await fs.pathExists(cachedAudioPath));
          const cachedTrimmedPath = history!.trimmedAudioMap[md5];
          const hasCachedTrimmed = cachedTrimmedPath && (await fs.pathExists(cachedTrimmedPath));

          if (hasCachedAudio) {
            // console.log(`[BatchTTS] [${itemIndex}] ${md5} 使用缓存音频 ========`);
            const info = history!.segmentInfoMap[md5];
            result.fromCache = true;
            result.audioPath = cachedAudioPath;
            result.duration = info?.duration ?? (await getAudioDuration(cachedAudioPath));

            if (hasCachedTrimmed && !skipTrimSilence) {
              result.trimmedAudioPath = cachedTrimmedPath;
              result.trimmedDuration = info?.trimmedDuration ?? (await getAudioDuration(cachedTrimmedPath));
            } else if (!skipTrimSilence) {
              // 需要重新裁剪
              await trimAudioSilence(cachedAudioPath, trimmedPath);
              result.trimmedAudioPath = trimmedPath;
              result.trimmedDuration = await getAudioDuration(trimmedPath);
              history!.trimmedAudioMap[md5] = trimmedPath;
              if (!history!.segmentInfoMap[md5]) history!.segmentInfoMap[md5] = {};
              history!.segmentInfoMap[md5].trimmedDuration = result.trimmedDuration;
            } else {
              result.trimmedAudioPath = cachedAudioPath;
              result.trimmedDuration = result.duration;
            }

            result.success = true;
            cacheHitCount++;
          } else {
            // console.log(`[BatchTTS] [${itemIndex}] ${md5} 开始合成新音频 (重试次数: ${maxRetries})`);
            // 需要合成
            const emptyAudio = Buffer.from(silenceAudio, 'base64');

            // 空文本直接返回静音音频
            if (!item.text || !item.text.trim()) {
              console.log(`[BatchTTS] [${itemIndex}] ${md5} 空文本，使用静音音频`);
              await fs.writeFile(audioPath, emptyAudio);
              result.audioPath = audioPath;
              result.duration = 0;
              result.trimmedAudioPath = audioPath;
              result.trimmedDuration = 0;
              result.success = true;
            } else {
              // 带重试的TTS合成
              // console.log(`[BatchTTS] [${itemIndex}] ${md5} 调用TTS引擎 - voice: ${config.voiceName}, rate: ${config.rate}`);
              const audioBuffer = await withRetry(
                async () => {
                  const synthesizeResult = await tts.textToSpeech({
                    ...config,
                    text: item.text,
                    fetchOptions: httpProxy ? { agent: httpProxy } : undefined
                  } as EdgeTTSOptions);

                  if (typeof synthesizeResult === 'string') {
                    throw new Error(synthesizeResult);
                  }

                  if (!Buffer.isBuffer(synthesizeResult) || synthesizeResult.length === 0) {
                    console.warn(`[BatchTTS] ${md5} 空音频，使用静音替代: "${item.text.substring(0, 20)}..."`);
                    return emptyAudio;
                  }

                  return synthesizeResult;
                },
                maxRetries,
                500
              );

              // 保存音频文件
              await fs.writeFile(audioPath, audioBuffer);
              // console.log(`[BatchTTS] [${itemIndex}] ${md5} 音频已保存 - size: ${audioBuffer.length} bytes`);
              result.audioPath = audioPath;
              result.duration = await getAudioDuration(audioPath);

              // 更新历史记录
              history!.audioMap[md5] = audioPath;
              if (!history!.segmentInfoMap[md5]) history!.segmentInfoMap[md5] = {};
              history!.segmentInfoMap[md5].duration = result.duration;

              // 移除空白
              if (!skipTrimSilence) {
                await trimAudioSilence(audioPath, trimmedPath);
                result.trimmedAudioPath = trimmedPath;
                result.trimmedDuration = await getAudioDuration(trimmedPath);
                history!.trimmedAudioMap[md5] = trimmedPath;
                history!.segmentInfoMap[md5].trimmedDuration = result.trimmedDuration;
              } else {
                result.trimmedAudioPath = audioPath;
                result.trimmedDuration = result.duration;
              }

              result.success = true;
            }
          }

          // 合成成功时写入该条元信息（st/et 存 SRT 格式字符串，duration/trimmedDuration 存毫秒）
          // item.st/et 可能为 SRT 字符串，需先解析为秒；et 由 st + 实际音频时长(trimmedDuration) 计算
          if (result.success) {
            if (!history!.segmentInfoMap[md5]) history!.segmentInfoMap[md5] = {};
            const seg = history!.segmentInfoMap[md5];
            const stSeconds = utils.convertToSeconds(item.st);
            seg.st = utils.formatTime(stSeconds);
            seg.et = utils.formatTime(stSeconds + result.trimmedDuration / 1000);
            seg.duration = result.duration;
            seg.trimmedDuration = result.trimmedDuration;
          }

          successCount++;
          // console.log(`[BatchTTS] [${itemIndex}] ${md5} 处理完成 ${result.duration}ms ✅️`);
        } catch (err) {
          result.success = false;
          result.error = err instanceof Error ? err.message : String(err);
          failedCount++;
          console.error(`[BatchTTS] [${itemIndex}] ${md5} 处理失败: ${result.error}`);
        }

        // 更新进度
        const task = activeBatchTTSTasks.get(requestId);
        if (task) {
          task.processedCount++;
        }

        const processedCount = task?.processedCount || index + 1;
        const percentage = Math.round((processedCount / items.length) * 100);

        emit({
          type: 'progress',
          data: {
            currentIndex: processedCount,
            total: items.length,
            percentage,
            message: `正在合成 ${processedCount}/${items.length}...`,
            currentText: item.text.substring(0, 30) + (item.text.length > 30 ? '...' : '')
          }
        });

        return result;
      };

      // 创建合成任务
      const tasks = items.map((item, index) => () => synthesizeItem(item, index));

      // 并发执行
      console.log(`[BatchTTS] 开始并发执行 - 并发数: ${maxConcurrency}`);
      const taskResults = await runWithConcurrency(tasks, maxConcurrency, signal);
      console.log(`[BatchTTS] 并发执行完成`);

      // 按index排序结果
      results.push(...taskResults);
      results.sort((a, b) => a.index - b.index);

      // 生成顺序列表
      for (const r of results) {
        if (r.success) {
          orderList.push(r.md5);
        }
      }

      // 更新历史记录
      history.updatedAt = Date.now();
      history.orderList = orderList;
      console.log(`[BatchTTS] 保存历史记录 - 新增音频: ${successCount - cacheHitCount}, 总音频数: ${Object.keys(history.audioMap).length}`);
      await this.saveHistory(outputDir, history);

      const totalTime = Date.now() - startTime;

      const batchResult: BatchTTSResult = {
        requestId,
        results,
        successCount,
        failedCount,
        cacheHitCount,
        totalTime,
        history
      };

      console.log(`[BatchTTS] 任务完成 - 总耗时: ${totalTime}ms, 成功: ${successCount}, 失败: ${failedCount}, 缓存命中: ${cacheHitCount}`);

      emit({
        type: 'complete',
        data: batchResult
      });

      emit({ type: 'done' });

      return batchResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[BatchTTS] 任务异常: ${errorMessage}`);
      if (errorMessage !== 'Aborted') {
        emit({
          type: 'error',
          data: { message: errorMessage }
        });
      }
      throw error;
    } finally {
      console.log(`[BatchTTS] 任务结束 - requestId: ${requestId}`);
      activeBatchTTSTasks.delete(requestId);
    }
  },

  /**
   * 简化的单文本合成
   */
  async synthesizeSingle(text: string, config: BatchTTSConfig, outputDir: string, httpProxy?: any): Promise<TTSItemResult> {
    const requestId = `single-${Date.now()}`;
    const result = await this.synthesizeBatch(
      {
        requestId,
        items: [{ text, index: 0 }],
        config,
        outputDir,
        maxConcurrency: 1,
        httpProxy
      },
      () => { } // 不需要进度回调
    );

    return result.results[0];
  }
};

export default BatchTTSService;
