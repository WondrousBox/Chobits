import { readFile, writeFile } from '@aim-packages/file-utils';
import { type AimSegments, parser, tools } from '@aim-packages/subtitle';
import { randomUUID } from 'crypto';
import { BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';

import { ResourcesRepo } from '../common/db';
import { sendAppBusyEnd, sendAppBusyProgress, sendAppBusyStart } from '../event';
import { getAgent } from './agents';
import { ChatService } from './chat-service';
import { createModel } from './models/index';
import { SummaryService } from './services/summary-service';
import { TranslationService } from './services/translation-service';
import { getAllSecrets, getFirstApiKey } from './settings-store';

/**
 * 从资源ID加载字幕片段
 */
export async function loadSegmentsFromResource(resourceId: string): Promise<{ filePath: string; segments: Array<{ text: string; index: number }> }> {
  const resource = await ResourcesRepo.getById(resourceId);
  if (!resource || !resource.filePath) {
    throw new Error(`Resource ${resourceId} not found or has no file path`);
  }

  const lower = resource.filePath.toLowerCase();
  const isSubtitleFile = lower.endsWith('.srt') || lower.endsWith('.vtt') || lower.endsWith('.ass') || lower.endsWith('.ssa');
  if (!isSubtitleFile) {
    throw new Error(`Resource ${resourceId} is not a subtitle file`);
  }

  const fileContent = await readFile(resource.filePath, 'utf8');
  const parsedResult = await parser.parseSubtitle(fileContent);
  const segments = (parsedResult?.segments || []).map((seg, idx) => ({
    text: seg.text,
    index: idx
  }));

  if (segments.length === 0) {
    throw new Error(`No segments found in subtitle file: ${resource.filePath}`);
  }

  console.log(`[loadSegments] Loaded ${segments.length} segments from resource ${resourceId}`);
  return { filePath: resource.filePath, segments };
}

/**
 * 从资源ID加载文本内容
 */
export async function loadContentFromResource(resourceId: string): Promise<string | AimSegments[]> {
  const resource = await ResourcesRepo.getById(resourceId);
  if (!resource || !resource.filePath) {
    throw new Error(`Resource ${resourceId} not found or has no file path`);
  }

  const lower = resource.filePath.toLowerCase();
  const isSubtitleFile = lower.endsWith('.srt') || lower.endsWith('.vtt') || lower.endsWith('.ass') || lower.endsWith('.ssa');

  if (isSubtitleFile) {
    // 读取字幕文件
    const fileContent = await readFile(resource.filePath, 'utf8');
    const parsedResult = await parser.parseSubtitle(fileContent);
    const segments = parsedResult?.segments || [];
    if (segments.length === 0) {
      throw new Error(`No segments found in subtitle file: ${resource.filePath}`);
    }
    console.log(`[loadContent] Loaded ${segments.length} segments from resource ${resourceId}`);
    return segments;
  } else {
    // 读取普通文本文件
    const content = await readFile(resource.filePath, 'utf8');
    if (!content || content.length === 0) {
      throw new Error(`No content found in file: ${resource.filePath}`);
    }
    console.log(`[loadContent] Loaded content from resource ${resourceId}`);
    return content;
  }
}

export type TranslatePayload = {
  providerId: string;
  model: string;
  segments?: Array<AimSegments | { text: string; index: number }>;
  resourceId?: string;
  targetLanguage: string;
  languageNames: Record<string, string>;
  metadata?: Record<string, any>;
  options?: {
    maxConcurrency?: number;
    chunkSize?: number;
    maxRetries?: number;
    promptTemplate?: string;
    generateSummary?: boolean;
    glossary?: any;
  };
};

export type SummarizePayload = {
  providerId: string;
  model: string;
  content?: string;
  segments?: any[];
  resourceId?: string;
  targetLanguage: string;
  languageNames: Record<string, string>;
  options?: {
    maxChars?: number;
    extractKeyPoints?: boolean;
    extractTimeline?: boolean;
    keywordCount?: number;
    promptTemplate?: string;
  };
  metadata?: Record<string, any>;
};

/**
 * 设置模型实例和Agent
 */
export interface ModelSetupResult {
  modelInstance: any;
  agent: any;
}

export async function setupModelAndAgent(providerId: string, model: string, agentId: string = 'chat'): Promise<ModelSetupResult> {
  const chatService = new ChatService();

  // 获取 provider 配置
  const providerConfig = chatService.getProviderConfig(providerId);
  if (!providerConfig) {
    throw new Error(`Provider ${providerId} not found`);
  }

  // 获取 secrets
  const fields = providerConfig.fields as Array<{ key: string; required?: boolean }>;
  const keys = fields.map((f: any) => f.key);
  const secrets = await getAllSecrets(providerId, keys);
  const apiKey = getFirstApiKey(secrets.apiKey);

  if (!apiKey && fields.some((f: any) => f.key === 'apiKey' && f.required)) {
    throw new Error(`Provider ${providerId} 未配置 API Key`);
  }

  // 创建模型实例
  const modelConfig = {
    apiKey: apiKey || '',
    baseUrl: secrets.baseUrl as string,
    model: model || providerConfig.defaultModel
  };
  const modelInstance = createModel(providerId, modelConfig);

  // 获取 Agent 实例
  const agent = getAgent(agentId);
  if (!agent) {
    throw new Error(`Agent ${agentId} not found`);
  }

  // 配置 Agent 使用当前模型
  agent.model = modelInstance;

  return { modelInstance, agent };
}

/**
 * 创建通用的聊天函数
 */
export type ChatFunction = (prompt: string, onEvent: (event: any) => void, abortSignal?: AbortSignal) => Promise<void>;

export function createChatFunction(agent: any): ChatFunction {
  return async (prompt: string, onEvent: (event: any) => void, abortSignal?: AbortSignal): Promise<void> => {
    try {
      const stream = await agent.stream(prompt, {
        maxSteps: 10,
        abortSignal
      });

      for await (const chunk of stream.textStream) {
        if (abortSignal?.aborted) break;
        onEvent({ type: 'delta', data: { text: chunk } });
      }

      onEvent({ type: 'message_completed' });
    } catch (error: any) {
      onEvent({ type: 'error', data: { message: error?.message || '处理失败' } });
    }
  };
}

/**
 * 创建进度事件发射器的配置
 */
export interface EmitterConfig {
  requestId: string;
  eventType: string; // 'subtitle:translate' | 'summary' 等
  busyMessage?: string;
  progressMessage?: string;
  onChunkComplete?: (data: any) => void | Promise<void>;
  onCompleted?: (data: any) => void | Promise<void>;
}

/**
 * 创建通用的事件发射器
 */
export function createEventEmitter(config: EmitterConfig): (event: { type: string; data?: any }) => void {
  const { requestId, eventType, busyMessage = '正在处理...', progressMessage = '正在处理...', onChunkComplete, onCompleted } = config;

  let busyStarted = false;

  return (event: { type: string; data?: any }): void => {
    // 处理进度事件，发送给精灵
    if (event.type === 'progress' && event.data) {
      const { percentage, message } = event.data;
      if (percentage !== undefined) {
        sendAppBusyProgress(percentage, message || progressMessage);
      }

      // 在第一个进度事件时发送开始信号
      if (!busyStarted) {
        sendAppBusyStart(0, busyMessage);
        busyStarted = true;
      }
    }

    // 在完成时结束繁忙状态
    if (event.type === 'completed' || event.type === 'done' || event.type === 'error') {
      sendAppBusyEnd();
    }

    // 在 chunk-complete 时调用回调
    if (event.type === 'chunk-complete' && onChunkComplete) {
      Promise.resolve(onChunkComplete(event.data)).catch((err) => {
        console.error(`[${eventType}] chunk-complete 回调失败:`, err);
      });
    }

    // 在完成时调用回调
    if ((event.type === 'completed' || event.type === 'done') && onCompleted) {
      Promise.resolve(onCompleted(event.data)).catch((err) => {
        console.error(`[${eventType}] completed 回调失败:`, err);
      });
    }

    // 发送消息到渲染进程
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) {
        try {
          w.webContents.send('renderer-message', {
            type: eventType,
            data: { requestId, ...event }
          });
        } catch (error) {
          console.error(`发送${eventType}消息失败:`, error);
        }
      }
    });
  };
}

/**
 * 保存翻译结果（JSON）到正在翻译的字幕文件同目录
 * - 不再覆盖/合并原字幕文件
 * - 输出文件名: <原文件名>.translated.<lang>.<timestamp>.json（支持多次翻译历史记录）
 */
type TranslatedSubtitleJsonV1 = {
  version: 1;
  resourceId?: string;
  providerId?: string;
  model?: string;
  targetLanguage?: string;
  startedAt: number; // 翻译任务开始时间戳
  updatedAt: number; // 最后更新时间戳
  translatedSegments: Array<{ index: number; text: string }>;
};

function isSubtitleFilePath(filePath: string): boolean {
  const lower = (filePath || '').toLowerCase();
  return lower.endsWith('.srt') || lower.endsWith('.vtt') || lower.endsWith('.ass') || lower.endsWith('.ssa');
}

function safeSuffixPart(input: string | undefined): string {
  const raw = String(input || '')
    .trim()
    .toLowerCase();
  if (!raw) return '';
  return raw.replace(/[^a-z0-9_-]+/g, '').slice(0, 32);
}

function buildTranslatedJsonPath(sourceSubtitlePath: string, targetLanguage: string | undefined, startTimestamp: number): string {
  const dir = path.dirname(sourceSubtitlePath);
  const base = path.basename(sourceSubtitlePath); // keep original extension (e.g. movie.srt)
  const lang = safeSuffixPart(targetLanguage);
  const suffix = lang ? `.translated.${lang}.${startTimestamp}.json` : `.translated.${startTimestamp}.json`;
  return path.join(dir, `${base}${suffix}`);
}
// 将 AimSegments 转换为 ISegment 格式
type ISegment = [string, string, string, string | undefined];
function convertToISegment(segment: AimSegments): ISegment {
  return [segment.st, segment.et, segment.text, undefined];
}

// 检测字幕格式
type SubtitleFormat = 'srt' | 'vtt' | 'ass';
function detectSubtitleFormat(filePath: string): SubtitleFormat {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.vtt')) return 'vtt';
  if (lower.endsWith('.ass') || lower.endsWith('.ssa')) return 'ass';
  return 'srt';
}

/**
 * 保存翻译后的字幕到文件
 * @param resourceId 资源 ID
 * @param translatedSegments 翻译后的字幕片段
 */
async function saveTranslatedSubtitle(resourceId: string, translatedSegments: Array<{ index: number; text: string }>): Promise<void> {
  if (!resourceId) return;

  try {
    // 获取资源信息
    const resource = await ResourcesRepo.getById(resourceId);
    if (!resource || !resource.filePath) {
      console.warn('[translation-save] 资源不存在或没有文件路径:', resourceId);
      return;
    }

    const filePath = resource.filePath;
    const lower = filePath.toLowerCase();

    // 检查是否是字幕文件
    const isSubtitleFile = lower.endsWith('.srt') || lower.endsWith('.vtt') || lower.endsWith('.ass') || lower.endsWith('.ssa');
    if (!isSubtitleFile) {
      console.warn('[translation-save] 不是字幕文件:', filePath);
      return;
    }
    // 从文件重新读取原始字幕，确保时间戳完整
    const fileContent = await readFile(filePath, 'utf8');
    const parsedResult = await parser.parseSubtitle(fileContent);
    const originalSegments = parsedResult?.segments || [];

    if (originalSegments.length === 0) {
      console.warn('[translation-save] 无法从文件读取原始字幕:', filePath);
      return;
    }

    // 检测格式
    const format = detectSubtitleFormat(filePath);

    // 构建翻译后的完整字幕数组（segments2）
    // 使用从文件读取的原始字幕，确保时间戳完整
    const segments2: AimSegments[] = originalSegments.map((seg, index) => {
      const translated = translatedSegments.find((t) => t.index === index);
      return {
        ...seg,
        text: translated?.text || ''
      };
    });

    // 转换为 ISegment 格式
    const iSegments1 = originalSegments.filter((seg) => !seg.delete).map(convertToISegment);
    const iSegments2 = segments2.filter((seg) => !seg.delete).map(convertToISegment);

    // 根据格式选择不同的输出方法
    let content: string;
    if (format === 'vtt' && 'outputVtt' in tools && typeof tools.outputVtt === 'function') {
      content = tools.outputVtt({ segments1: iSegments1, segments2: iSegments2 });
    } else if (format === 'ass' && 'outputAss' in tools && typeof tools.outputAss === 'function') {
      content = tools.outputAss({ segments1: iSegments1, segments2: iSegments2 });
    } else {
      // 默认使用 SRT 格式输出
      content = tools.outputSrt({ segments1: iSegments1, segments2: iSegments2 });
    }

    // 确保目录存在
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // 写入文件
    await writeFile(filePath, content);

    // 更新资源的文件大小
    try {
      const buf = Buffer.from(content, 'utf8');
      await ResourcesRepo.update(resourceId, { sizeBytes: buf.byteLength });
    } catch {
      // 忽略更新失败
    }

    console.log(`[translation-save] 字幕已保存 (${format}):`, filePath);
  } catch (error) {
    console.error('[translation-save] 保存字幕失败:', error);
  }
}

async function saveTranslatedSubtitleJson(opts: {
  resourceId: string;
  sourceFilePath?: string;
  translatedSegments: Array<{ index: number; text: string }>;
  providerId?: string;
  model?: string;
  targetLanguage?: string;
  startTimestamp: number; // 翻译任务开始时间戳
}): Promise<void> {
  try {
    const sourceFilePath = opts.sourceFilePath;
    if (!sourceFilePath) {
      console.warn('[translation-save] 无法确定正在翻译的字幕文件路径:', { resourceId: opts.resourceId });
      return;
    }
    if (!isSubtitleFilePath(sourceFilePath)) {
      console.warn('[translation-save] 不是字幕文件:', sourceFilePath);
      return;
    }

    const outPath = buildTranslatedJsonPath(sourceFilePath, opts.targetLanguage, opts.startTimestamp);
    const sorted = [...(opts.translatedSegments || [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

    const payload: TranslatedSubtitleJsonV1 = {
      version: 1,
      resourceId: opts.resourceId,
      providerId: opts.providerId,
      model: opts.model,
      targetLanguage: opts.targetLanguage,
      startedAt: opts.startTimestamp,
      updatedAt: Date.now(),
      translatedSegments: sorted
    };

    // 确保目录存在
    const dir = path.dirname(outPath);
    await fs.mkdir(dir, { recursive: true });

    // 写入文件
    const content = JSON.stringify(payload, null, 2);
    await writeFile(outPath, content);

    console.log('[translation-save] 翻译 JSON 已保存:', outPath);
  } catch (error) {
    console.error('[translation-save] 保存翻译 JSON 失败:', error);
  }
}

/**
 * 执行字幕翻译任务
 * @param payload 翻译参数
 * @returns 返回 requestId 和 eventsChannel
 */
export async function executeSubtitleTranslation(payload: TranslatePayload): Promise<{ requestId: string; eventsChannel: string }> {
  const { providerId, model, segments, resourceId, targetLanguage, languageNames, metadata, options } = payload;
  const requestId = randomUUID();
  const eventsChannel = `subtitle:translate:${requestId}`;
  const taskLabel = `${providerId}/${model}`;
  const startTimestamp = Date.now(); // 记录翻译任务开始时间戳

  // 步骤1: 读取文件，加载字幕片段
  let actualSegments: Array<AimSegments | { text: string; index: number }> | undefined = segments;
  const effectiveResourceId: string | undefined = resourceId || metadata?.resourceId;
  let sourceSubtitleFilePath: string | undefined;

  if (!actualSegments && effectiveResourceId) {
    try {
      const loaded = await loadSegmentsFromResource(effectiveResourceId);
      actualSegments = loaded.segments;
      sourceSubtitleFilePath = loaded.filePath;
    } catch (error) {
      console.error('[translate] Failed to load segments from resource:', error);
      throw error;
    }
  }

  if (!actualSegments || actualSegments.length === 0) {
    throw new Error('No segments provided and unable to load segments from resourceId');
  }

  // 如果传入了 segments 但仍然有资源 ID，则提前解析一次字幕文件路径（用于保存 JSON），避免每个 chunk 都查库
  if (!sourceSubtitleFilePath && effectiveResourceId) {
    try {
      const resource = await ResourcesRepo.getById(effectiveResourceId);
      sourceSubtitleFilePath = resource?.filePath || undefined;
    } catch {
      sourceSubtitleFilePath = undefined;
    }
  }

  // 步骤2: 设置模型和Agent
  const { agent } = await setupModelAndAgent(providerId, model, 'chat');

  // 步骤3: 创建聊天函数
  const chatFn = createChatFunction(agent);

  // 步骤4: 创建事件发射器，处理翻译回调
  const accumulatedTranslations: Array<{ index: number; text: string }> = [];

  const emit = createEventEmitter({
    requestId,
    eventType: 'subtitle:translate',
    busyMessage: '开始翻译字幕...',
    progressMessage: '正在翻译...',
    onChunkComplete: async (data) => {
      // 没有资源 ID 则不需要保存翻译文件
      if (!effectiveResourceId) return;

      if (data?.segments) {
        // 累积翻译结果
        const chunkSegments = data.segments as Array<{ index: number; text: string }>;
        chunkSegments.forEach((seg) => {
          const existing = accumulatedTranslations.findIndex((t) => t.index === seg.index);
          if (existing >= 0) {
            accumulatedTranslations[existing] = seg;
          } else {
            accumulatedTranslations.push(seg);
          }
        });

        // 保存翻译结果（JSON）
        await saveTranslatedSubtitleJson({
          resourceId: effectiveResourceId,
          sourceFilePath: sourceSubtitleFilePath,
          translatedSegments: accumulatedTranslations,
          providerId,
          model,
          targetLanguage,
          startTimestamp
        });
      }
    },
    onCompleted: async () => {
      // 翻译完成时，将最终翻译结果合并保存到原字幕文件
      if (effectiveResourceId && accumulatedTranslations.length > 0) {
        await saveTranslatedSubtitle(effectiveResourceId, accumulatedTranslations);
      }
    }
  });

  // 步骤5: 异步处理翻译
  TranslationService.translateSubtitles(
    {
      requestId,
      chatFn,
      taskLabel,
      // translate service currently accepts AimSegments[]; we also allow renderer to pass a minimal {text,index} shape
      segments: actualSegments as any,
      targetLanguage,
      languageNames,
      metadata,
      options
    },
    emit
  ).catch((err: any) => {
    console.error('翻译失败:', err);
    const resourceId = metadata?.resourceId;
    if (err.message === 'Aborted') {
      emit({ type: 'done', data: { resourceId } });
    } else {
      emit({ type: 'error', data: { message: err?.message || '翻译失败', resourceId } });
    }
  });

  return { requestId, eventsChannel };
}

/**
 * 执行内容总结任务
 * @param payload 总结参数
 * @returns 返回 requestId 和 eventsChannel
 */
export async function executeSummarize(payload: SummarizePayload): Promise<{ requestId: string; eventsChannel: string }> {
  const { providerId, model, content, segments, resourceId, targetLanguage, languageNames, options, metadata = {} } = payload;
  const requestId = randomUUID();
  const eventsChannel = `summary:${requestId}`;
  const taskLabel = `${providerId}/${model}`;

  // 步骤1: 读取内容
  let actualContent: string | any[] = content as string | any[];

  if (!actualContent && resourceId) {
    try {
      actualContent = await loadContentFromResource(resourceId);
    } catch (error) {
      console.error('[summarize] Failed to load content from resource:', error);
      throw error;
    }
  }

  // 如果提供了 segments，使用 segments
  if (!actualContent && segments) {
    actualContent = segments;
  }

  if (!actualContent) {
    throw new Error('No content provided and unable to load content from resourceId');
  }

  // 步骤2: 设置模型和Agent
  const { agent } = await setupModelAndAgent(providerId, model, 'chat');

  // 步骤3: 创建聊天函数
  const chatFn = createChatFunction(agent);

  // 步骤4: 创建事件发射器
  const emit = createEventEmitter({
    requestId,
    eventType: 'summary',
    busyMessage: '开始总结内容...',
    progressMessage: '正在总结...'
  });

  // 步骤5: 异步处理总结
  SummaryService.summarize(emit, {
    requestId,
    chatFn,
    taskLabel,
    content: actualContent,
    targetLanguage,
    languageNames,
    metadata,
    options
  }).catch((err: any) => {
    console.error('总结失败:', err);
    if (err.message === 'Aborted') {
      emit({ type: 'done' });
    } else {
      emit({ type: 'error', data: { message: err?.message || '总结失败' } });
    }
  });

  return { requestId, eventsChannel };
}
