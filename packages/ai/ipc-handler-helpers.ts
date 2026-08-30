import { readFile, writeFile } from '@aim-packages/file-utils';
import { type AimSegments, parser } from '@aim-packages/subtitle';
import { randomUUID } from 'crypto';
import { BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';

import { ResourcesRepo, WorkspacesRepo } from '../common/db';
import { sendAppBusyEnd, sendAppBusyProgress, sendAppBusyStart } from '../event';
import { normalizeProviderPreset, resolveProviderPresetId } from './provider-preset';
import { PiSessionService } from './runtime/pi/session-service';
import { createPiTaskChatRuntimeFromRequest, type PiTaskChatFunction as ChatFunction } from './runtime/pi/task-chat';
import { SummaryService } from './services/summary-service';
import type { SummaryCompletedData, SummaryEvent } from './services/summary-service';
import { TranslationService } from './services/translation-service';
import type { TranslationCompletedData, TranslationEvent } from './services/translation-service';
import type { ProviderScopedRequest, SummarizeRequest, TranslateRequest } from './types';

// ==================== 项目文件夹常量 ====================

/** 项目目录名称 */
const PROJECTS_DIR_NAME = 'projects';

/** 项目文件夹后缀 */
const PROJECT_FOLDER_SUFFIX = '.resproject';

/** 翻译文件子目录名称 */
const TRANSLATIONS_SUBDIR = 'translations';

/** 项目元数据文件名 */
const PROJECT_META_FILE = 'project.json';

/**
 * 获取资源的项目目录路径
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @returns 资源项目目录路径，如果工作空间不存在则返回 null
 */
async function getResourceProjectPath(resourceId: string, workspaceId: string): Promise<string | null> {
  const ws = await WorkspacesRepo.getById(workspaceId);
  if (!ws?.rootPath) return null;
  return path.join(ws.rootPath, PROJECTS_DIR_NAME, `${resourceId}${PROJECT_FOLDER_SUFFIX}`);
}

/**
 * 获取翻译文件的存储目录路径
 * @param resourceId 字幕资源ID
 * @param workspaceId 工作空间ID
 * @returns 翻译文件目录路径
 */
async function getTranslationsDir(resourceId: string, workspaceId: string): Promise<string | null> {
  const projectPath = await getResourceProjectPath(resourceId, workspaceId);
  if (!projectPath) return null;
  return path.join(projectPath, 'data', TRANSLATIONS_SUBDIR);
}

/**
 * 项目元数据中的翻译条目
 */
interface ProjectTranslationEntry {
  id: string; // 翻译记录唯一 ID
  fileName: string; // 翻译文件名，如 "video.zh-CN.1234567890.json"
  targetLanguage?: string; // 目标语言，如 "zh-CN"
  providerId?: string; // AI 提供商 ID
  model?: string; // AI 模型名称
  translatedAt: number; // 翻译完成时间戳
  startTimestamp: number; // 翻译开始时间戳
}

/**
 * 项目元数据
 */
interface ProjectMeta {
  version: number;
  resourceId: string;
  resourceType?: string;
  createdAt: number;
  updatedAt?: number;
  parentResourceId?: string;
  segments?: Array<{ subtitleFile: string; segmentsFile: string }>;
  translations?: ProjectTranslationEntry[];
  [key: string]: unknown;
}

/**
 * 读取项目元数据
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @returns 项目元数据，如果不存在则返回 null
 */
async function readProjectMeta(resourceId: string, workspaceId: string): Promise<ProjectMeta | null> {
  try {
    const projectPath = await getResourceProjectPath(resourceId, workspaceId);
    if (!projectPath) return null;

    const metaPath = path.join(projectPath, PROJECT_META_FILE);
    const content = await fs.readFile(metaPath, 'utf-8');
    return JSON.parse(content) as ProjectMeta;
  } catch {
    return null;
  }
}

/**
 * 写入项目元数据
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @param meta 项目元数据（会与现有数据合并）
 */
async function writeProjectMeta(resourceId: string, workspaceId: string, meta: Partial<ProjectMeta>): Promise<{ success: boolean; error?: string }> {
  try {
    const projectPath = await getResourceProjectPath(resourceId, workspaceId);
    if (!projectPath) {
      return { success: false, error: 'Failed to get project path' };
    }

    // 确保项目目录和 data 目录存在
    await fs.mkdir(path.join(projectPath, 'data'), { recursive: true });

    const metaPath = path.join(projectPath, PROJECT_META_FILE);

    // 读取现有元数据（如果存在）
    let existingMeta: ProjectMeta | null = null;
    try {
      const content = await fs.readFile(metaPath, 'utf-8');
      existingMeta = JSON.parse(content) as ProjectMeta;
    } catch {
      // 忽略读取错误
    }

    // 合并元数据
    const now = Date.now();
    const newMeta: ProjectMeta = {
      version: 1,
      resourceId,
      createdAt: existingMeta?.createdAt || now,
      updatedAt: now,
      ...existingMeta,
      ...meta
    };

    // 确保 resourceId 不被覆盖
    newMeta.resourceId = resourceId;

    await fs.writeFile(metaPath, JSON.stringify(newMeta, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

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

export type TranslatePayload = TranslateRequest & {
  requestId?: string;
  taskLabel?: string;
  chatFn?: ChatFunction;
  abortSignal?: AbortSignal;
};

export type SummarizePayload = SummarizeRequest & {
  requestId?: string;
  taskLabel?: string;
  chatFn?: ChatFunction;
  abortSignal?: AbortSignal;
};

export interface TranslationTaskHandle {
  requestId: string;
  eventsChannel: string;
  completionPromise: Promise<TranslationCompletedData>;
  reused?: boolean;
}

export interface SummaryTaskHandle {
  requestId: string;
  eventsChannel: string;
  completionPromise: Promise<SummaryCompletedData>;
}

interface TaskStartOptions<TEvent> {
  onEvent?: (event: TEvent) => void;
}

type TaskMetadata = Record<string, any>;

function createEffectiveTaskMetadata(metadata?: TaskMetadata, resourceId?: string): TaskMetadata | undefined {
  const effectiveResourceId = resourceId || (typeof metadata?.resourceId === 'string' ? metadata.resourceId : undefined);
  const nextMetadata: TaskMetadata = {
    ...(metadata || {})
  };

  if (effectiveResourceId) {
    nextMetadata.resourceId = effectiveResourceId;
  }

  return Object.keys(nextMetadata).length > 0 ? nextMetadata : undefined;
}

function getMetadataResourceId(metadata?: TaskMetadata): string | undefined {
  return typeof metadata?.resourceId === 'string' ? metadata.resourceId : undefined;
}

function getMetadataWorkspaceId(metadata?: TaskMetadata): string | undefined {
  return typeof metadata?.workspaceId === 'string' ? metadata.workspaceId : undefined;
}

const RECENT_SUBTITLE_TRANSLATION_DEDUPE_TTL_MS = 30 * 1000;

type CachedSubtitleTranslationTask = TranslationTaskHandle & {
  cleanupTimer?: ReturnType<typeof setTimeout>;
  expiresAt?: number;
  key: string;
};

const subtitleTranslationTaskCache = new Map<string, CachedSubtitleTranslationTask>();

function stableStringify(value: unknown): string {
  if (value === undefined) return '';
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? '';
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
    .join(',')}}`;
}

function getSubtitleTranslationDedupeKey(params: {
  model?: string;
  options?: TranslatePayload['options'];
  providerId?: string;
  providerPresetId?: string;
  resourceId?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
}): string | undefined {
  const resourceId = params.resourceId?.trim();
  const targetLanguage = params.targetLanguage?.trim().toLowerCase();
  if (!resourceId || !targetLanguage) {
    return undefined;
  }

  return stableStringify({
    model: params.model?.trim() || '',
    options: params.options || {},
    providerId: params.providerId?.trim() || '',
    providerPresetId: params.providerPresetId?.trim() || '',
    resourceId,
    sourceLanguage: params.sourceLanguage?.trim().toLowerCase() || '',
    targetLanguage
  });
}

function getCachedSubtitleTranslationTask(key?: string): TranslationTaskHandle | undefined {
  if (!key) return undefined;

  const cached = subtitleTranslationTaskCache.get(key);
  if (!cached) return undefined;

  if (cached.expiresAt && cached.expiresAt <= Date.now()) {
    if (cached.cleanupTimer) clearTimeout(cached.cleanupTimer);
    subtitleTranslationTaskCache.delete(key);
    return undefined;
  }

  return {
    completionPromise: cached.completionPromise,
    eventsChannel: cached.eventsChannel,
    requestId: cached.requestId,
    reused: true
  };
}

function cacheSubtitleTranslationTask(key: string | undefined, handle: TranslationTaskHandle): void {
  if (!key) return;

  const existing = subtitleTranslationTaskCache.get(key);
  if (existing?.cleanupTimer) {
    clearTimeout(existing.cleanupTimer);
  }

  const cached: CachedSubtitleTranslationTask = {
    ...handle,
    key
  };
  subtitleTranslationTaskCache.set(key, cached);

  void handle.completionPromise.then(
    () => {
      const current = subtitleTranslationTaskCache.get(key);
      if (!current || current.requestId !== handle.requestId) return;

      current.expiresAt = Date.now() + RECENT_SUBTITLE_TRANSLATION_DEDUPE_TTL_MS;
      current.cleanupTimer = setTimeout(() => {
        const latest = subtitleTranslationTaskCache.get(key);
        if (latest?.requestId === handle.requestId) {
          subtitleTranslationTaskCache.delete(key);
        }
      }, RECENT_SUBTITLE_TRANSLATION_DEDUPE_TTL_MS);
      if (typeof current.cleanupTimer === 'object' && 'unref' in current.cleanupTimer) {
        current.cleanupTimer.unref?.();
      }
    },
    () => {
      clearCachedSubtitleTranslationTask(key, handle.requestId);
    }
  );
}

function clearCachedSubtitleTranslationTask(key: string | undefined, requestId: string): void {
  if (!key) return;

  const cached = subtitleTranslationTaskCache.get(key);
  if (cached?.requestId !== requestId) return;

  if (cached.cleanupTimer) clearTimeout(cached.cleanupTimer);
  subtitleTranslationTaskCache.delete(key);
}

async function createPreferredTaskChatRuntime(
  params: ProviderScopedRequest & {
    model: string;
    agentId?: string;
  }
): Promise<{ chatFn: ChatFunction; modelId: string; runtime: 'pi' }> {
  const normalizedParams = normalizeProviderPreset(params);
  const piAvailability = new PiSessionService().getAvailability({
    extras: {
      model: normalizedParams.model,
      runtime: 'pi'
    }
  });

  if (!piAvailability.available) {
    throw new Error(piAvailability.reason || 'Pi task runtime unavailable');
  }

  const runtime = await createPiTaskChatRuntimeFromRequest({
    ...normalizedParams,
    agentId: normalizedParams.agentId || 'chat',
    model: normalizedParams.model,
    providerPresetId: resolveProviderPresetId(normalizedParams)
  });

  return {
    chatFn: runtime.chatFn,
    modelId: runtime.modelId,
    runtime: 'pi'
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

/**
 * 构建翻译 JSON 文件路径（存储在项目文件夹的 data/translations/ 目录中）
 * @param resourceId 字幕资源 ID
 * @param workspaceId 工作空间 ID
 * @param sourceSubtitlePath 源字幕文件路径（用于提取基础文件名）
 * @param targetLanguage 目标语言
 * @param startTimestamp 翻译开始时间戳
 * @returns 翻译 JSON 文件路径
 */
async function buildTranslatedJsonPath(resourceId: string, workspaceId: string, sourceSubtitlePath: string, targetLanguage: string | undefined, startTimestamp: number): Promise<string | null> {
  const translationsDir = await getTranslationsDir(resourceId, workspaceId);
  if (!translationsDir) return null;

  // 使用源字幕文件名作为基础名，添加语言和时间戳后缀
  const base = path.basename(sourceSubtitlePath); // keep original extension (e.g. movie.srt)
  const lang = safeSuffixPart(targetLanguage);
  const suffix = lang ? `.${lang}.${startTimestamp}.json` : `.${startTimestamp}.json`;
  return path.join(translationsDir, `${base}${suffix}`);
}
/**
 * 更新项目元数据中的翻译条目
 * 翻译文件存储在项目文件夹的 data/translations/ 目录中，不再创建数据库资源
 * @param translationJsonPath 翻译 JSON 文件路径
 * @param sourceResourceId 源资源 ID（字幕资源）
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
    if (!sourceResource || !sourceResource.workspaceId) {
      console.warn('[translation-resource] 源资源不存在或缺少 workspaceId:', sourceResourceId);
      return;
    }

    // 从文件路径提取文件名
    const fileName = path.basename(translationJsonPath);

    // 创建翻译条目
    const translationEntry: ProjectTranslationEntry = {
      id: randomUUID(),
      fileName,
      targetLanguage,
      providerId,
      model,
      translatedAt: Date.now(),
      startTimestamp
    };

    // 读取现有元数据
    const existingMeta = await readProjectMeta(sourceResourceId, sourceResource.workspaceId);
    const existingTranslations = existingMeta?.translations || [];

    // 检查是否已存在相同 startTimestamp 的记录（同一翻译任务）
    const existingIndex = existingTranslations.findIndex((t) => t.startTimestamp === startTimestamp);
    if (existingIndex >= 0) {
      // 更新现有条目
      existingTranslations[existingIndex] = translationEntry;
    } else {
      // 添加新条目
      existingTranslations.push(translationEntry);
    }

    // 写入更新后的元数据
    const metaResult = await writeProjectMeta(sourceResourceId, sourceResource.workspaceId, {
      resourceType: 'subtitle',
      parentResourceId: sourceResource.parentResourceId || undefined,
      translations: existingTranslations
    });

    if (metaResult.success) {
      console.log('[translation-resource] 项目元数据已更新，翻译条目已添加/更新:', fileName);
    } else {
      console.warn('[translation-resource] 更新项目元数据失败:', metaResult.error);
    }
  } catch (error) {
    console.error('[translation-resource] 更新翻译元数据失败:', error);
  }
}

async function saveTranslatedSubtitleJson(opts: {
  resourceId: string;
  workspaceId: string;
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

    // 构建项目文件夹中的翻译文件路径
    const outPath = await buildTranslatedJsonPath(opts.resourceId, opts.workspaceId, sourceFilePath, opts.targetLanguage, opts.startTimestamp);
    if (!outPath) {
      console.warn('[translation-save] 无法构建翻译文件路径');
      return undefined;
    }

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

    console.log('[translation-save] 翻译 JSON 已保存到项目文件夹:', outPath);
    return outPath;
  } catch (error) {
    console.error('[translation-save] 保存翻译 JSON 失败:', error);
    return undefined;
  }
}

/**
 * 执行字幕翻译任务
 * @param payload 翻译参数
 * @returns 返回 requestId 和 eventsChannel
 */
export async function startSubtitleTranslationTask(payload: TranslatePayload, taskStartOptions?: TaskStartOptions<TranslationEvent>): Promise<TranslationTaskHandle> {
  const normalizedPayload = normalizeProviderPreset(payload);
  const {
    abortSignal,
    chatFn: injectedChatFn,
    model,
    providerId,
    requestId: incomingRequestId,
    resourceId,
    segments,
    sourceLanguage,
    targetLanguage,
    languageNames,
    metadata,
    options,
    taskLabel: incomingTaskLabel
  } = normalizedPayload;
  const requestId = incomingRequestId || randomUUID();
  const eventsChannel = `subtitle:translate:${requestId}`;
  const startTimestamp = Date.now(); // 记录翻译任务开始时间戳
  const resolvedProviderPresetId = resolveProviderPresetId(normalizedPayload);
  const effectiveMetadata = createEffectiveTaskMetadata(metadata, resourceId);
  const effectiveResourceId = getMetadataResourceId(effectiveMetadata);
  const dedupeKey = getSubtitleTranslationDedupeKey({
    model,
    options,
    providerId,
    providerPresetId: resolvedProviderPresetId,
    resourceId: effectiveResourceId,
    sourceLanguage,
    targetLanguage
  });
  const cachedTask = getCachedSubtitleTranslationTask(dedupeKey);
  if (cachedTask) {
    console.log('[translate] Reusing active subtitle translation task:', {
      requestId: cachedTask.requestId,
      resourceId: effectiveResourceId,
      targetLanguage
    });
    return cachedTask;
  }

  let resolveCompletion!: (data: TranslationCompletedData) => void;
  let rejectCompletion!: (error: Error) => void;
  const completionPromise = new Promise<TranslationCompletedData>((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });
  void completionPromise.catch(() => undefined);
  const taskHandle: TranslationTaskHandle = { requestId, eventsChannel, completionPromise };
  cacheSubtitleTranslationTask(dedupeKey, taskHandle);

  const failStartup = (error: unknown): never => {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    rejectCompletion(normalizedError);
    clearCachedSubtitleTranslationTask(dedupeKey, requestId);
    throw normalizedError;
  };

  if (abortSignal?.aborted) {
    failStartup(new Error('Aborted'));
  }

  // 步骤1: 读取文件，加载字幕片段
  let actualSegments: Array<AimSegments> | undefined = segments;
  let sourceSubtitleFilePath: string | undefined;
  let sourceWorkspaceId: string | undefined; // 保存工作空间 ID

  if (!actualSegments && effectiveResourceId) {
    try {
      const loaded = await loadSegmentsFromResource(effectiveResourceId);
      actualSegments = loaded.segments;
      sourceSubtitleFilePath = loaded.filePath;
    } catch (error) {
      console.error('[translate] Failed to load segments from resource:', error);
      failStartup(error);
    }
  }

  if (!actualSegments || actualSegments.length === 0) {
    failStartup(new Error('No segments provided and unable to load segments from resourceId'));
  }
  const resolvedSegments = actualSegments!;

  // 如果传入了 segments 但仍然有资源 ID，则提前解析一次字幕文件路径（用于保存 JSON），避免每个 chunk 都查库
  if (!sourceSubtitleFilePath && effectiveResourceId) {
    try {
      const resource = await ResourcesRepo.getById(effectiveResourceId);
      sourceSubtitleFilePath = resource?.filePath || undefined;
    } catch {
      sourceSubtitleFilePath = undefined;
    }
  }

  // 获取工作空间 ID（用于保存翻译文件到项目文件夹）
  if (effectiveResourceId) {
    try {
      const resource = await ResourcesRepo.getById(effectiveResourceId);
      sourceWorkspaceId = resource?.workspaceId || undefined;
    } catch {
      sourceWorkspaceId = undefined;
    }
  }

  // 步骤2: 创建聊天函数
  let effectiveChatFn = injectedChatFn;
  let effectiveModel = model;
  if (!effectiveChatFn) {
    try {
      const runtime = await createPreferredTaskChatRuntime({
        agentId: 'chat',
        model,
        providerId,
        providerPresetId: resolvedProviderPresetId
      });
      effectiveChatFn = runtime.chatFn;
      effectiveModel = runtime.modelId;
    } catch (error) {
      failStartup(error);
    }
  }
  const resolvedChatFn = effectiveChatFn!;
  const taskLabel = incomingTaskLabel || `${providerId}/${effectiveModel}`;

  // 步骤4: 创建事件发射器，处理翻译回调
  const accumulatedTranslations: Array<{ index: number; text: string }> = [];
  let translationJsonPath: string | undefined;

  const broadcastEvent = createEventEmitter({
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
          workspaceId: sourceWorkspaceId!,
          sourceFilePath: sourceSubtitleFilePath,
          translatedSegments: accumulatedTranslations,
          providerId,
          model: effectiveModel,
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
            model: effectiveModel,
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
          model: effectiveModel,
          startTimestamp
        });
      }
    }
  });

  // 步骤5: 异步处理翻译
  const emit = (event: TranslationEvent): void => {
    broadcastEvent(event);
    taskStartOptions?.onEvent?.(event);

    if (event.type === 'completed') {
      resolveCompletion(event.data);
      return;
    }

    if (event.type === 'error') {
      rejectCompletion(new Error(event.data?.message || 'Translation task failed'));
      return;
    }

    if (event.type === 'done') {
      rejectCompletion(new Error('Translation task finished before emitting a completed event'));
    }
  };

  try {
    TranslationService.translateSubtitles(
      {
        requestId,
        chatFn: resolvedChatFn,
        taskLabel,
        segments: resolvedSegments,
        sourceLanguage,
        targetLanguage,
        languageNames,
        providerId,
        model: effectiveModel,
        metadata: effectiveMetadata,
        options
      },
      emit,
      abortSignal
    ).catch((err: any) => {
      console.error('翻译失败:', err);
      if (err.message === 'Aborted') {
        emit({ type: 'done' });
      } else {
        emit({ type: 'error', data: { message: err?.message || '翻译失败' } });
      }
    });
  } catch (error) {
    failStartup(error);
  }

  abortSignal?.addEventListener(
    'abort',
    () => {
      clearCachedSubtitleTranslationTask(dedupeKey, requestId);
    },
    { once: true }
  );

  return taskHandle;
}

/**
 * 执行内容总结任务
 * @param payload 总结参数
 * @returns 返回 requestId 和 eventsChannel
 */
export async function startSummarizeTask(payload: SummarizePayload, taskStartOptions?: TaskStartOptions<SummaryEvent>): Promise<SummaryTaskHandle> {
  const normalizedPayload = normalizeProviderPreset(payload);
  const {
    abortSignal,
    chatFn: injectedChatFn,
    content,
    languageNames,
    metadata = {},
    model,
    options,
    providerId,
    requestId: incomingRequestId,
    resourceId,
    segments,
    targetLanguage,
    taskLabel: incomingTaskLabel
  } = normalizedPayload;
  const requestId = incomingRequestId || randomUUID();
  const eventsChannel = `summary:${requestId}`;
  const resolvedProviderPresetId = resolveProviderPresetId(normalizedPayload);
  const effectiveMetadata = createEffectiveTaskMetadata(metadata, resourceId);
  const effectiveResourceId = getMetadataResourceId(effectiveMetadata);
  let sourceWorkspaceId = getMetadataWorkspaceId(effectiveMetadata);

  if (abortSignal?.aborted) {
    throw new Error('Aborted');
  }

  // 步骤1: 读取内容
  let actualContent: string | any[] = content as string | any[];

  if (!actualContent && effectiveResourceId) {
    try {
      actualContent = await loadContentFromResource(effectiveResourceId);
      const resource = await ResourcesRepo.getById(effectiveResourceId);
      sourceWorkspaceId = resource?.workspaceId || sourceWorkspaceId;
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

  if (!sourceWorkspaceId && effectiveResourceId) {
    try {
      const resource = await ResourcesRepo.getById(effectiveResourceId);
      sourceWorkspaceId = resource?.workspaceId || sourceWorkspaceId;
    } catch {
      // Ignore workspace lookup failures; usage can still be recorded without workspace scoping.
    }
  }

  // 步骤2: 创建聊天函数
  let effectiveChatFn = injectedChatFn;
  let effectiveModel = model;
  if (!effectiveChatFn) {
    const runtime = await createPreferredTaskChatRuntime({
      agentId: 'assistant',
      model,
      providerId,
      providerPresetId: resolvedProviderPresetId
    });
    effectiveChatFn = runtime.chatFn;
    effectiveModel = runtime.modelId;
  }
  const taskLabel = incomingTaskLabel || `${providerId}/${effectiveModel}`;

  // 步骤4: 创建事件发射器
  const startTimestamp = Date.now();

  let resolveCompletion!: (data: SummaryCompletedData) => void;
  let rejectCompletion!: (error: Error) => void;
  const completionPromise = new Promise<SummaryCompletedData>((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });
  void completionPromise.catch(() => undefined);

  const broadcastEvent = createEventEmitter({
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
          model: effectiveModel,
          startTimestamp
        });
      }
    }
  });

  // 步骤5: 异步处理总结
  const emit = (event: SummaryEvent): void => {
    broadcastEvent(event);
    taskStartOptions?.onEvent?.(event);

    if (event.type === 'completed') {
      resolveCompletion(event.data);
      return;
    }

    if (event.type === 'error') {
      rejectCompletion(new Error(event.data?.message || 'Summary task failed'));
      return;
    }

    if (event.type === 'done') {
      rejectCompletion(new Error('Summary task finished before emitting a completed event'));
    }
  };

  SummaryService.summarize(
    emit,
    {
      requestId,
      chatFn: effectiveChatFn,
      providerId,
      model: effectiveModel,
      taskLabel,
      content: actualContent,
      targetLanguage,
      languageNames,
      metadata: effectiveMetadata,
      options
    },
    abortSignal
  ).catch((err: any) => {
    console.error('总结失败:', err);
    if (err.message === 'Aborted') {
      emit({ type: 'done' });
    } else {
      emit({ type: 'error', data: { message: err?.message || '总结失败' } });
    }
  });

  return { requestId, eventsChannel, completionPromise };
}

