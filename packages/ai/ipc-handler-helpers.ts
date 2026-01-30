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
import { MindmapService } from './services/mindmap-service';
import { SummaryService } from './services/summary-service';
import { TranslationService } from './services/translation-service';
import { getAllSecrets, getFirstApiKey } from './settings-store';

/**
 * 从资源ID加载字幕片段
 */
export async function loadSegmentsFromResource(resourceId: string): Promise<{ filePath: string; segments: AimSegments[] }> {
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
  const segments = parsedResult?.segments || [];

  if (segments.length === 0) {
    throw new Error(`No segments found in subtitle file: ${resource.filePath}`);
  }

  console.log(`[loadSegments] Loaded ${segments.length} segments from resource ${resourceId}`);
  return { filePath: resource.filePath, segments };
}

/**
 * 加载资源的关联翻译数据（每种语言只返回最新的一个）
 * @param resourceId 资源 ID
 * @returns 翻译资源列表（JSON 格式），每种语言只包含最新的翻译
 */
export async function loadTranslatedSubtitles(
  resourceId: string
): Promise<Array<{ id: string; language?: string; title?: string; filePath?: string; segments?: Array<{ index: number; text: string }> }>> {
  try {
    const children = await ResourcesRepo.listChildren(resourceId);
    // 排除已移到回收站的翻译资源（deletedAt 不为空表示已删除）
    const translations = children.filter((child) => child.type === 'translation' && (child as { deletedAt?: number | null }).deletedAt == null);

    // 按语言分组，每组只保留最新的（根据 updatedAt）
    const latestByLanguage = new Map<string, any>();

    for (const t of translations) {
      const lang = t.language || 'unknown';
      const existing = latestByLanguage.get(lang);

      if (!existing || (t.updatedAt || 0) > (existing.updatedAt || 0)) {
        latestByLanguage.set(lang, t);
      }
    }

    // 读取每个最新翻译的 JSON 文件内容
    const results = await Promise.all(
      Array.from(latestByLanguage.values()).map(async (t) => {
        let segments: Array<{ index: number; text: string }> | undefined;
        if (t.filePath) {
          try {
            const content = await readFile(t.filePath, 'utf8');
            const json = JSON.parse(content) as TranslatedSubtitleJsonV1;
            segments = json.translatedSegments;
          } catch (error) {
            console.error('[loadTranslatedSubtitles] 读取翻译文件失败:', t.filePath, error);
          }
        }

        return {
          id: t.id,
          language: t.language,
          title: t.title,
          filePath: t.filePath,
          segments
        };
      })
    );

    return results;
  } catch (error) {
    console.error('[loadTranslatedSubtitles] 加载翻译数据失败:', error);
    return [];
  }
}

/**
 * 创建或更新总结资源（只保留一个总结文件）
 * @param sourceResourceId 源资源 ID
 * @param summaryData 总结数据
 * @param targetLanguage 目标语言
 * @param providerId AI 提供商 ID
 * @param model AI 模型名称
 * @param startTimestamp 总结开始时间戳
 */
async function createOrUpdateSummaryResource(opts: {
  sourceResourceId: string;
  summaryData: any;
  targetLanguage?: string;
  providerId?: string;
  model?: string;
  startTimestamp: number;
}): Promise<void> {
  const { sourceResourceId, summaryData, targetLanguage, providerId, model, startTimestamp } = opts;

  try {
    // 获取源资源信息
    const sourceResource = await ResourcesRepo.getById(sourceResourceId);
    if (!sourceResource) {
      console.warn('[summary-resource] 源资源不存在:', sourceResourceId);
      return;
    }

    // 查找是否已存在总结资源
    const existingChildren = await ResourcesRepo.listChildren(sourceResourceId);
    const existingSummary = existingChildren.find((child) => child.type === 'summary');

    // 构建总结 JSON 文件路径
    let summaryFilePath: string;

    if (existingSummary && existingSummary.filePath) {
      // 使用现有文件路径
      summaryFilePath = existingSummary.filePath;
    } else {
      // 创建新文件路径
      const sourceFilePath = sourceResource.filePath || `resource_${sourceResourceId}`;
      const dir = path.dirname(sourceFilePath);
      const baseName = path.basename(sourceFilePath);
      summaryFilePath = path.join(dir, `${baseName}.summary.json`);
    }

    // 准备总结数据
    const summaryPayload = {
      version: 1,
      resourceId: sourceResourceId,
      providerId,
      model,
      targetLanguage,
      startedAt: startTimestamp,
      updatedAt: Date.now(),
      ...summaryData
    };

    // 确保目录存在
    const dir = path.dirname(summaryFilePath);
    await fs.mkdir(dir, { recursive: true });

    // 写入 JSON 文件
    const content = JSON.stringify(summaryPayload, null, 2);
    await writeFile(summaryFilePath, content);
    console.log('[summary-resource] 总结 JSON 已保存:', summaryFilePath);

    // 获取文件大小
    const jsonStat = await fs.stat(summaryFilePath);
    const summaryTitle = sourceResource.title ? `${sourceResource.title} - 总结` : '总结数据';

    const resourceData = {
      type: 'summary' as const,
      parentResourceId: sourceResourceId,
      workspaceId: sourceResource.workspaceId,
      folderId: sourceResource.folderId,
      title: summaryTitle,
      description: `总结自: ${sourceResource.title || sourceResource.description || '原资源'}`,
      filePath: summaryFilePath,
      language: targetLanguage,
      mimeType: 'application/json',
      sizeBytes: jsonStat.size,
      status: 'ready' as const,
      metadata: JSON.stringify({
        summarySource: sourceResourceId,
        providerId,
        model,
        targetLanguage,
        summarizedAt: Date.now(),
        startTimestamp
      })
    };

    if (existingSummary) {
      // 更新现有资源
      await ResourcesRepo.update(existingSummary.id, resourceData as any);
      console.log(`[summary-resource] 总结资源已更新:`, existingSummary.id);
    } else {
      // 创建新资源
      const newResource = await ResourcesRepo.upsert(resourceData as any);
      console.log(`[summary-resource] 总结资源已创建:`, newResource?.id);
    }
  } catch (error) {
    console.error('[summary-resource] 创建/更新总结资源失败:', error);
  }
}

/**
 * 加载资源的总结数据
 * @param resourceId 资源 ID
 * @returns 总结数据
 */
export async function loadResourceSummary(resourceId: string): Promise<any | null> {
  try {
    const children = await ResourcesRepo.listChildren(resourceId);
    const summaryResource = children.find((child) => child.type === 'summary');

    if (!summaryResource || !summaryResource.filePath) {
      return null;
    }

    // 读取 JSON 文件内容
    const content = await readFile(summaryResource.filePath, 'utf8');
    const summaryData = JSON.parse(content);

    return {
      id: summaryResource.id,
      filePath: summaryResource.filePath,
      ...summaryData
    };
  } catch (error) {
    console.error('[loadResourceSummary] 加载总结数据失败:', error);
    return null;
  }
}

/**
 * 创建或更新脑图资源
 * @param opts 脑图资源选项
 */
async function createOrUpdateMindmapResource(opts: {
  sourceResourceId: string;
  markdown: string;
  targetLanguage?: string;
  providerId?: string;
  model?: string;
  startTimestamp: number;
}): Promise<void> {
  const { sourceResourceId, markdown, targetLanguage, providerId, model, startTimestamp } = opts;

  try {
    // 获取源资源信息
    const sourceResource = await ResourcesRepo.getById(sourceResourceId);
    if (!sourceResource) {
      console.error('[mindmap-resource] 源资源不存在:', sourceResourceId);
      return;
    }

    // 查找现有的脑图资源（只保留一个脑图资源）
    const children = await ResourcesRepo.listChildren(sourceResourceId);
    const existingMindmap = children.find((child) => child.type === 'mindmap');

    let mindmapFilePath: string;

    if (existingMindmap && existingMindmap.filePath) {
      // 使用现有文件路径
      mindmapFilePath = existingMindmap.filePath;
    } else {
      // 创建新文件路径
      const sourceFilePath = sourceResource.filePath || `resource_${sourceResourceId}`;
      const dir = path.dirname(sourceFilePath);
      const baseName = path.basename(sourceFilePath);
      mindmapFilePath = path.join(dir, `${baseName}.mindmap.json`);
    }

    // 准备脑图数据
    const mindmapPayload = {
      version: 1,
      resourceId: sourceResourceId,
      providerId,
      model,
      targetLanguage,
      startedAt: startTimestamp,
      updatedAt: Date.now(),
      markdown
    };

    // 确保目录存在
    const dir = path.dirname(mindmapFilePath);
    await fs.mkdir(dir, { recursive: true });

    // 写入 JSON 文件
    const content = JSON.stringify(mindmapPayload, null, 2);
    await writeFile(mindmapFilePath, content);
    console.log('[mindmap-resource] 脑图 JSON 已保存:', mindmapFilePath);

    // 获取文件大小
    const jsonStat = await fs.stat(mindmapFilePath);
    const mindmapTitle = sourceResource.title ? `${sourceResource.title} - 脑图` : '脑图数据';

    const resourceData = {
      type: 'mindmap' as const,
      parentResourceId: sourceResourceId,
      workspaceId: sourceResource.workspaceId,
      folderId: sourceResource.folderId,
      title: mindmapTitle,
      description: `脑图自: ${sourceResource.title || sourceResource.description || '原资源'}`,
      filePath: mindmapFilePath,
      language: targetLanguage,
      mimeType: 'application/json',
      sizeBytes: jsonStat.size,
      status: 'ready' as const,
      metadata: JSON.stringify({
        mindmapSource: sourceResourceId,
        providerId,
        model,
        targetLanguage,
        generatedAt: Date.now(),
        startTimestamp
      })
    };

    if (existingMindmap) {
      // 更新现有资源
      await ResourcesRepo.update(existingMindmap.id, resourceData as any);
      console.log(`[mindmap-resource] 脑图资源已更新:`, existingMindmap.id);
    } else {
      // 创建新资源
      const newResource = await ResourcesRepo.upsert(resourceData as any);
      console.log(`[mindmap-resource] 脑图资源已创建:`, newResource?.id);
    }
  } catch (error) {
    console.error('[mindmap-resource] 创建/更新脑图资源失败:', error);
  }
}

/**
 * 加载资源的脑图数据
 * @param resourceId 资源 ID
 * @returns 脑图数据
 */
export async function loadResourceMindmap(resourceId: string): Promise<any | null> {
  try {
    const children = await ResourcesRepo.listChildren(resourceId);
    const mindmapResource = children.find((child) => child.type === 'mindmap');

    if (!mindmapResource || !mindmapResource.filePath) {
      return null;
    }

    // 读取 JSON 文件内容
    const content = await readFile(mindmapResource.filePath, 'utf8');
    const mindmapData = JSON.parse(content);

    return {
      id: mindmapResource.id,
      filePath: mindmapResource.filePath,
      ...mindmapData
    };
  } catch (error) {
    console.error('[loadResourceMindmap] 加载脑图失败:', error);
    return null;
  }
}

/**
 * 加载资源的所有翻译历史记录（不做筛选）
 * @param resourceId 资源 ID
 * @returns 所有翻译资源列表（包括同语言的多个版本）
 */
export async function loadAllTranslationHistory(
  resourceId: string
): Promise<Array<{ id: string; language?: string; title?: string; filePath?: string; segments?: Array<{ index: number; text: string }>; createdAt?: number; updatedAt?: number }>> {
  try {
    const children = await ResourcesRepo.listChildren(resourceId);
    const translations = children.filter((child) => child.type === 'translation');

    // 按 updatedAt 倒序排序（最新的在前）
    translations.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    // 读取每个翻译的 JSON 文件内容
    const results = await Promise.all(
      translations.map(async (t) => {
        let segments: Array<{ index: number; text: string }> | undefined;
        if (t.filePath) {
          try {
            const content = await readFile(t.filePath, 'utf8');
            const json = JSON.parse(content) as TranslatedSubtitleJsonV1;
            segments = json.translatedSegments;
          } catch (error) {
            console.error('[loadAllTranslationHistory] 读取翻译文件失败:', t.filePath, error);
          }
        }

        return {
          id: t.id,
          language: t.language,
          title: t.title,
          filePath: t.filePath,
          segments,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt
        };
      })
    );

    return results;
  } catch (error) {
    console.error('[loadAllTranslationHistory] 加载翻译历史失败:', error);
    return [];
  }
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
  segments?: Array<AimSegments>;
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
 * - 用于增量保存翻译进度
 * - 输出文件名: <原文件名>.translated.<lang>.<timestamp>.json（支持多次翻译历史记录）
 * - 翻译完成后会创建新的资源记录和字幕文件
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
/**
 * 创建或更新翻译资源（仅 JSON 格式）
 * 保留所有翻译历史记录，查看时只展示每种语言最新的一个
 * @param translationJsonPath 翻译 JSON 文件路径
 * @param sourceResourceId 源资源 ID
 * @param targetLanguage 目标语言
 * @param providerId AI 提供商 ID
 * @param model AI 模型名称
 * @param startTimestamp 翻译开始时间戳
 */
async function createOrUpdateTranslationResource(opts: {
  translationJsonPath: string;
  sourceResourceId: string;
  targetLanguage?: string;
  providerId?: string;
  model?: string;
  startTimestamp: number;
}): Promise<void> {
  const { translationJsonPath, sourceResourceId, targetLanguage, providerId, model, startTimestamp } = opts;

  try {
    // 获取源资源信息
    const sourceResource = await ResourcesRepo.getById(sourceResourceId);
    if (!sourceResource) {
      console.warn('[translation-resource] 源资源不存在:', sourceResourceId);
      return;
    }

    // 读取 JSON 文件获取文件大小
    const jsonStat = await fs.stat(translationJsonPath);
    const translatedTitle = sourceResource.title ? `${sourceResource.title} - ${targetLanguage || '翻译'}` : `翻译数据 - ${targetLanguage || ''}`;

    // 获取所有子资源
    const existingChildren = await ResourcesRepo.listChildren(sourceResourceId);

    // 查找当前 JSON 文件对应的资源
    const existingTranslation = existingChildren.find((child) => child.type === 'translation' && child.filePath === translationJsonPath);

    const resourceData = {
      type: 'translation',
      parentResourceId: sourceResourceId, // 关联源资源
      workspaceId: sourceResource.workspaceId,
      folderId: sourceResource.folderId,
      title: translatedTitle,
      description: `翻译自: ${sourceResource.title || sourceResource.description || '原字幕'}`,
      filePath: translationJsonPath,
      language: targetLanguage,
      mimeType: 'application/json',
      sizeBytes: jsonStat.size,
      status: 'ready',
      metadata: JSON.stringify({
        translationSource: sourceResourceId,
        providerId,
        model,
        targetLanguage,
        translatedAt: Date.now(),
        startTimestamp
      })
    };

    if (existingTranslation) {
      // 更新现有资源
      await ResourcesRepo.update(existingTranslation.id, resourceData as any);
      console.log(`[translation-resource] 翻译资源已更新:`, existingTranslation.id);
    } else {
      // 创建新资源（保留历史记录，不删除旧的）
      const newResource = await ResourcesRepo.upsert(resourceData as any);
      console.log(`[translation-resource] 翻译资源已创建:`, newResource?.id);
    }
  } catch (error) {
    console.error('[translation-resource] 创建/更新翻译资源失败:', error);
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
}): Promise<string | undefined> {
  try {
    const sourceFilePath = opts.sourceFilePath;
    if (!sourceFilePath) {
      console.warn('[translation-save] 无法确定正在翻译的字幕文件路径:', { resourceId: opts.resourceId });
      return undefined;
    }
    if (!isSubtitleFilePath(sourceFilePath)) {
      console.warn('[translation-save] 不是字幕文件:', sourceFilePath);
      return undefined;
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
    return outPath;
  } catch (error) {
    console.error('[translation-save] 保存翻译 JSON 失败:', error);
    return undefined;
  }
}

/**
 * 更新翻译 JSON 中指定片段（时间或文本）：用户拖拽时间轴或编辑文本后写回文件
 * @param patch 只更新传入的字段，支持 st / et / text 的任意组合
 */
export async function updateTranslationSegment(opts: {
  translationResourceId: string;
  segmentIndex: number;
  patch: { st?: string; et?: string; text?: string };
}): Promise<{ success: boolean; message?: string }> {
  try {
    const resource = await ResourcesRepo.getById(opts.translationResourceId);
    if (!resource || !resource.filePath) {
      return { success: false, message: '翻译资源不存在或没有文件路径' };
    }
    const filePath = resource.filePath;
    if (!filePath.toLowerCase().endsWith('.json')) {
      return { success: false, message: '不是翻译 JSON 文件' };
    }

    const content = await readFile(filePath, 'utf8');
    const payload = JSON.parse(content) as {
      version?: number;
      resourceId?: string;
      providerId?: string;
      model?: string;
      targetLanguage?: string;
      startedAt?: number;
      updatedAt?: number;
      translatedSegments: Array<{ index: number; text: string; st?: string; et?: string;[key: string]: unknown }>;
    };
    if (!Array.isArray(payload.translatedSegments)) {
      return { success: false, message: 'translatedSegments 格式无效' };
    }

    const segment = payload.translatedSegments.find((s) => s.index === opts.segmentIndex);
    if (!segment) {
      return { success: false, message: `未找到 index=${opts.segmentIndex} 的片段` };
    }
    if (opts.patch.st !== undefined) segment.st = opts.patch.st;
    if (opts.patch.et !== undefined) segment.et = opts.patch.et;
    if (opts.patch.text !== undefined) segment.text = opts.patch.text;
    payload.updatedAt = Date.now();

    await writeFile(filePath, JSON.stringify(payload, null, 2));
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[updateTranslationSegment] 失败:', message);
    return { success: false, message };
  }
}

/**
 * 在翻译 JSON 中插入一个新片段（用于在翻译轨道空白处新增字幕块）
 */
export async function insertTranslationSegment(opts: {
  translationResourceId: string;
  insertIndex: number;
  segment: { st: string; et: string; text: string };
}): Promise<{ success: boolean; message?: string }> {
  try {
    const resource = await ResourcesRepo.getById(opts.translationResourceId);
    if (!resource || !resource.filePath) {
      return { success: false, message: '翻译资源不存在或没有文件路径' };
    }
    const filePath = resource.filePath;
    if (!filePath.toLowerCase().endsWith('.json')) {
      return { success: false, message: '不是翻译 JSON 文件' };
    }

    const content = await readFile(filePath, 'utf8');
    const payload = JSON.parse(content) as {
      version?: number;
      resourceId?: string;
      translatedSegments: Array<{ index: number; text: string; st?: string; et?: string;[key: string]: unknown }>;
      updatedAt?: number;
    };
    if (!Array.isArray(payload.translatedSegments)) {
      return { success: false, message: 'translatedSegments 格式无效' };
    }

    const insertIndex = Math.max(0, Math.min(opts.insertIndex, payload.translatedSegments.length));
    for (const seg of payload.translatedSegments) {
      if (seg.index >= insertIndex) (seg as { index: number }).index += 1;
    }
    payload.translatedSegments.splice(insertIndex, 0, {
      index: insertIndex,
      text: opts.segment.text,
      st: opts.segment.st,
      et: opts.segment.et
    });
    payload.updatedAt = Date.now();

    await writeFile(filePath, JSON.stringify(payload, null, 2));
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[insertTranslationSegment] 失败:', message);
    return { success: false, message };
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
  let actualSegments: Array<AimSegments> | undefined = segments;
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
  let translationJsonPath: string | undefined;

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

        // 保存翻译结果（JSON）并获取文件路径
        const jsonPath = await saveTranslatedSubtitleJson({
          resourceId: effectiveResourceId,
          sourceFilePath: sourceSubtitleFilePath,
          translatedSegments: accumulatedTranslations,
          providerId,
          model,
          targetLanguage,
          startTimestamp
        });

        // 记录 JSON 文件路径，用于创建资源
        if (jsonPath) {
          translationJsonPath = jsonPath;

          // 每次保存 JSON 后，创建或更新资源记录
          await createOrUpdateTranslationResource({
            translationJsonPath: jsonPath,
            sourceResourceId: effectiveResourceId,
            targetLanguage,
            providerId,
            model,
            startTimestamp
          });
        }
      }
    },
    onCompleted: async () => {
      console.log('翻译完成，翻译资源已保存：', effectiveResourceId, accumulatedTranslations.length);

      // 翻译完成时，确保资源记录已创建（通常在 onChunkComplete 中已经创建了）
      if (effectiveResourceId && translationJsonPath) {
        await createOrUpdateTranslationResource({
          translationJsonPath,
          sourceResourceId: effectiveResourceId,
          targetLanguage,
          providerId,
          model,
          startTimestamp
        });
      }
    }
  });

  // 步骤5: 异步处理翻译
  TranslationService.translateSubtitles(
    {
      requestId,
      chatFn,
      taskLabel,
      segments: actualSegments,
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
  const startTimestamp = Date.now();
  const effectiveResourceId = resourceId || metadata?.resourceId;

  const emit = createEventEmitter({
    requestId,
    eventType: 'summary',
    busyMessage: '开始总结内容...',
    progressMessage: '正在总结...',
    onCompleted: async (data) => {
      console.log('总结完成，保存总结资源：', effectiveResourceId);

      // 总结完成时，创建或更新总结资源
      if (effectiveResourceId && data) {
        await createOrUpdateSummaryResource({
          sourceResourceId: effectiveResourceId,
          summaryData: data,
          targetLanguage,
          providerId,
          model,
          startTimestamp
        });
      }
    }
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

/**
 * 执行脑图生成任务
 * @param payload 脑图生成参数
 * @returns 返回 requestId 和 eventsChannel
 */
export async function executeMindmap(payload: {
  providerId: string;
  model: string;
  content?: string;
  segments?: any[];
  resourceId?: string;
  targetLanguage: string;
  languageNames?: Record<string, string>;
  options?: any;
  metadata?: any;
}): Promise<{ requestId: string; eventsChannel: string }> {
  const { providerId, model, content, segments, resourceId, targetLanguage, languageNames, options, metadata = {} } = payload;
  const requestId = randomUUID();
  const eventsChannel = `mindmap:${requestId}`;
  const taskLabel = `${providerId}/${model}`;
  const startTimestamp = Date.now(); // 记录开始时间戳

  // 步骤1: 读取内容
  let actualContent: string | any[] = content as string | any[];
  const effectiveResourceId: string | undefined = resourceId || metadata?.resourceId;

  if (!actualContent && resourceId) {
    try {
      const loaded = await loadSegmentsFromResource(resourceId);
      actualContent = loaded.segments;
    } catch (error) {
      console.error('[mindmap] Failed to load content from resource:', error);
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
    eventType: 'mindmap',
    busyMessage: '开始生成脑图...',
    progressMessage: '正在生成脑图...',
    onCompleted: async (data) => {
      console.log('脑图生成完成，保存脑图资源：', effectiveResourceId);

      // 脑图完成时，创建或更新脑图资源
      if (effectiveResourceId && data && data.markdown) {
        await createOrUpdateMindmapResource({
          sourceResourceId: effectiveResourceId,
          markdown: data.markdown,
          targetLanguage,
          providerId,
          model,
          startTimestamp
        });
      }
    }
  });

  // 步骤5: 异步处理脑图生成
  MindmapService.generateMindmap(emit as any, {
    requestId,
    chatFn: chatFn as any,
    taskLabel,
    content: actualContent,
    targetLanguage,
    languageNames,
    metadata,
    options
  }).catch((err: any) => {
    console.error('生成脑图失败:', err);
    if (err.message === 'Aborted') {
      emit({ type: 'done' });
    } else {
      emit({ type: 'error', data: { message: err?.message || '生成脑图失败' } });
    }
  });

  return { requestId, eventsChannel };
}

/**
 * 取消脑图生成任务
 * @param requestId 请求 ID
 * @returns 是否成功取消
 */
export function cancelMindmap(requestId: string): boolean {
  return MindmapService.cancelMindmap(requestId);
}
