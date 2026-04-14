import { readFile, writeFile } from '@aim-packages/file-utils';
import { type AimSegments, parser } from '@aim-packages/subtitle';
import { randomUUID } from 'crypto';
import { BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';

import { ResourcesRepo, WorkspacesRepo } from '../common/db';
import { sendAppBusyEnd, sendAppBusyProgress, sendAppBusyStart } from '../event';
import { emitAiUsageObservedEvent } from './analytics/events';
import type { RecordAiUsageEventInput } from './analytics/types';
import { normalizeProviderPreset, resolveProviderPresetId } from './provider-preset';
import { PiSessionService } from './runtime/pi/session-service';
import { createPiTaskChatRuntimeFromRequest, type PiTaskChatFunction as ChatFunction } from './runtime/pi/task-chat';
import { MindmapService } from './services/mindmap-service';
import { SummaryService } from './services/summary-service';
import { TranslationService } from './services/translation-service';
import type { MindmapRequest, ProviderScopedRequest, SummarizeRequest, TokenUsage, TranslateRequest } from './types';

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
 * 加载资源的关联翻译数据（每种语言只返回最新的一个）
 * 从项目文件夹的 data/translations/ 目录读取
 * @param resourceId 资源 ID
 * @returns 翻译资源列表（JSON 格式），每种语言只包含最新的翻译
 */
export async function loadTranslatedSubtitles(
  resourceId: string
): Promise<Array<{ id: string; language?: string; title?: string; filePath?: string; segments?: Array<{ index: number; text: string }> }>> {
  try {
    // 获取资源信息
    const resource = await ResourcesRepo.getById(resourceId);
    if (!resource || !resource.workspaceId) {
      return [];
    }

    // 读取项目元数据
    const meta = await readProjectMeta(resourceId, resource.workspaceId);
    if (!meta?.translations || meta.translations.length === 0) {
      return [];
    }

    // 按语言分组，每组只保留最新的（根据 translatedAt）
    const latestByLanguage = new Map<string, ProjectTranslationEntry>();
    for (const t of meta.translations) {
      const lang = t.targetLanguage || 'unknown';
      const existing = latestByLanguage.get(lang);
      if (!existing || t.translatedAt > existing.translatedAt) {
        latestByLanguage.set(lang, t);
      }
    }

    // 读取每个最新翻译的 JSON 文件内容
    const translationsDir = await getTranslationsDir(resourceId, resource.workspaceId);
    if (!translationsDir) {
      return [];
    }

    const results = await Promise.all(
      Array.from(latestByLanguage.values()).map(async (t) => {
        let segments: Array<{ index: number; text: string }> | undefined;
        const filePath = path.join(translationsDir, t.fileName);

        try {
          const content = await readFile(filePath, 'utf8');
          const json = JSON.parse(content) as TranslatedSubtitleJsonV1;
          segments = json.translatedSegments;
        } catch (error) {
          console.error('[loadTranslatedSubtitles] 读取翻译文件失败:', filePath, error);
        }

        return {
          id: t.id,
          language: t.targetLanguage,
          title: `${resource.title || '字幕'} - ${t.targetLanguage || '翻译'}`,
          filePath,
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
 * 从项目文件夹的 data/translations/ 目录读取
 * @param resourceId 资源 ID
 * @returns 所有翻译资源列表（包括同语言的多个版本）
 */
export async function loadAllTranslationHistory(
  resourceId: string
): Promise<Array<{ id: string; language?: string; title?: string; filePath?: string; segments?: Array<{ index: number; text: string }>; createdAt?: number; updatedAt?: number }>> {
  try {
    // 获取资源信息
    const resource = await ResourcesRepo.getById(resourceId);
    if (!resource || !resource.workspaceId) {
      return [];
    }

    // 读取项目元数据
    const meta = await readProjectMeta(resourceId, resource.workspaceId);
    if (!meta?.translations || meta.translations.length === 0) {
      return [];
    }

    // 按 translatedAt 倒序排序（最新的在前）
    const sortedTranslations = [...meta.translations].sort((a, b) => b.translatedAt - a.translatedAt);

    // 获取翻译目录路径
    const translationsDir = await getTranslationsDir(resourceId, resource.workspaceId);
    if (!translationsDir) {
      return [];
    }

    // 读取每个翻译的 JSON 文件内容
    const results = await Promise.all(
      sortedTranslations.map(async (t) => {
        let segments: Array<{ index: number; text: string }> | undefined;
        const filePath = path.join(translationsDir, t.fileName);

        try {
          const content = await readFile(filePath, 'utf8');
          const json = JSON.parse(content) as TranslatedSubtitleJsonV1;
          segments = json.translatedSegments;
        } catch (error) {
          console.error('[loadAllTranslationHistory] 读取翻译文件失败:', filePath, error);
        }

        return {
          id: t.id,
          language: t.targetLanguage,
          title: `${resource.title || '字幕'} - ${t.targetLanguage || '翻译'}`,
          filePath,
          segments,
          createdAt: t.startTimestamp,
          updatedAt: t.translatedAt
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
 * 清理数据库中的翻译类型资源
 * 翻译文件已迁移到项目文件夹存储，此函数用于清理旧的数据库记录
 * @param subtitleResourceId 可选，指定字幕资源 ID 则只清理该资源的翻译记录
 * @returns 删除的记录数量
 */
export async function cleanupTranslationResources(subtitleResourceId?: string): Promise<{ success: boolean; deletedCount?: number; error?: string }> {
  try {
    let deletedCount = 0;

    if (subtitleResourceId) {
      // 清理指定字幕资源的翻译记录
      const children = await ResourcesRepo.listChildren(subtitleResourceId);
      const translations = children.filter((child) => child.type === 'translation');

      for (const t of translations) {
        await ResourcesRepo.deleteByIds([t.id]);
        deletedCount++;
      }
    } else {
      // 清理所有翻译类型的资源
      // 注意：ResourcesRepo 可能没有直接按类型查询的方法，需要通过其他方式
      // 这里使用 listChildren 配合 parentResourceId 的方式可能不够全面
      // 暂时只支持指定 resourceId 的清理
      console.warn('[cleanupTranslationResources] 未指定 subtitleResourceId，暂不支持全量清理');
      return { success: false, error: '需要指定 subtitleResourceId' };
    }

    console.log(`[cleanupTranslationResources] 已清理 ${deletedCount} 条翻译资源记录`);
    return { success: true, deletedCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[cleanupTranslationResources] 清理失败:', message);
    return { success: false, error: message };
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

export type MindmapPayload = MindmapRequest & {
  requestId?: string;
  taskLabel?: string;
  chatFn?: ChatFunction;
  abortSignal?: AbortSignal;
};

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

function toAnalyticsUsage(usage?: TokenUsage): RecordAiUsageEventInput['usage'] | undefined {
  if (!usage) {
    return undefined;
  }

  return {
    billableInputTokens: usage.billableInputTokens,
    billableOutputTokens: usage.billableOutputTokens,
    billableTotalTokens: usage.billableTotalTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    estimatedCost: usage.cost,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
    totalTokens: usage.totalTokens
  };
}

async function recordTaskUsageEventSafely(input: RecordAiUsageEventInput, context: string): Promise<void> {
  await emitAiUsageObservedEvent(input, { producer: context });
}

type TaskUsageEventPayload = {
  attemptIndex?: number;
  completedAt?: number;
  metadata?: Record<string, unknown>;
  operationKey?: string;
  rawUsage?: unknown;
  startedAt?: number;
  status: 'completed' | 'failed' | 'cancelled';
  usage?: TokenUsage;
};

function createTaskUsageRecorder(params: {
  context: string;
  metadata?: Record<string, unknown>;
  model: string;
  providerId: string;
  providerPresetId?: string;
  requestId: string;
  resourceId?: string;
  sourceId: string;
  sourceLabel: string;
  sourceType: RecordAiUsageEventInput['sourceType'];
  usageCategory: RecordAiUsageEventInput['usageCategory'];
  usageFeature: RecordAiUsageEventInput['usageFeature'];
  usageStage: RecordAiUsageEventInput['usageStage'];
  workspaceId?: string;
}): (event: TaskUsageEventPayload) => void {
  return (event) => {
    void recordTaskUsageEventSafely(
      {
        workspaceId: params.workspaceId,
        traceId: params.requestId,
        requestId: params.requestId,
        operationKey: event.operationKey || 'generate',
        attemptIndex: event.attemptIndex,
        resourceId: params.resourceId,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        sourceLabel: params.sourceLabel,
        usageCategory: params.usageCategory,
        usageFeature: params.usageFeature,
        usageStage: params.usageStage,
        providerId: params.providerId,
        providerPresetId: params.providerPresetId,
        model: params.model,
        status: event.status,
        usage: toAnalyticsUsage(event.usage),
        rawUsage: event.rawUsage,
        meteringSource: 'provider_reported',
        startedAt: event.startedAt,
        completedAt: event.completedAt || Date.now(),
        metadata: {
          ...(params.metadata || {}),
          ...(event.metadata || {})
        }
      },
      params.context
    );
  };
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
 * 更新翻译 JSON 中指定片段（时间或文本）：用户拖拽时间轴或编辑文本后写回文件
 * @param subtitleResourceId 字幕资源 ID（用于定位项目文件夹）
 * @param translationEntryId 翻译条目 ID（项目元数据中的 ID）
 * @param patch 只更新传入的字段，支持 st / et / text 的任意组合
 */
export async function updateTranslationSegment(opts: {
  subtitleResourceId: string;
  translationEntryId: string;
  segmentIndex: number;
  patch: { st?: string; et?: string; text?: string };
}): Promise<{ success: boolean; message?: string }> {
  try {
    // 获取字幕资源信息
    const resource = await ResourcesRepo.getById(opts.subtitleResourceId);
    if (!resource || !resource.workspaceId) {
      return { success: false, message: '字幕资源不存在或缺少工作空间' };
    }

    // 读取项目元数据
    const meta = await readProjectMeta(opts.subtitleResourceId, resource.workspaceId);
    if (!meta?.translations) {
      return { success: false, message: '未找到翻译元数据' };
    }

    // 查找翻译条目
    const translationEntry = meta.translations.find((t) => t.id === opts.translationEntryId);
    if (!translationEntry) {
      return { success: false, message: '未找到翻译条目' };
    }

    // 构建文件路径
    const translationsDir = await getTranslationsDir(opts.subtitleResourceId, resource.workspaceId);
    if (!translationsDir) {
      return { success: false, message: '无法获取翻译目录' };
    }
    const filePath = path.join(translationsDir, translationEntry.fileName);

    const content = await readFile(filePath, 'utf8');
    const payload = JSON.parse(content) as {
      version?: number;
      resourceId?: string;
      providerId?: string;
      model?: string;
      targetLanguage?: string;
      startedAt?: number;
      updatedAt?: number;
      translatedSegments: Array<{ index: number; text: string; st?: string; et?: string; [key: string]: unknown }>;
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
 * @param subtitleResourceId 字幕资源 ID（用于定位项目文件夹）
 * @param translationEntryId 翻译条目 ID（项目元数据中的 ID）
 */
export async function insertTranslationSegment(opts: {
  subtitleResourceId: string;
  translationEntryId: string;
  insertIndex: number;
  segment: { st: string; et: string; text: string };
}): Promise<{ success: boolean; message?: string }> {
  try {
    // 获取字幕资源信息
    const resource = await ResourcesRepo.getById(opts.subtitleResourceId);
    if (!resource || !resource.workspaceId) {
      return { success: false, message: '字幕资源不存在或缺少工作空间' };
    }

    // 读取项目元数据
    const meta = await readProjectMeta(opts.subtitleResourceId, resource.workspaceId);
    if (!meta?.translations) {
      return { success: false, message: '未找到翻译元数据' };
    }

    // 查找翻译条目
    const translationEntry = meta.translations.find((t) => t.id === opts.translationEntryId);
    if (!translationEntry) {
      return { success: false, message: '未找到翻译条目' };
    }

    // 构建文件路径
    const translationsDir = await getTranslationsDir(opts.subtitleResourceId, resource.workspaceId);
    if (!translationsDir) {
      return { success: false, message: '无法获取翻译目录' };
    }
    const filePath = path.join(translationsDir, translationEntry.fileName);

    const content = await readFile(filePath, 'utf8');
    const payload = JSON.parse(content) as {
      version?: number;
      resourceId?: string;
      translatedSegments: Array<{ index: number; text: string; st?: string; et?: string; [key: string]: unknown }>;
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
 * 从翻译 JSON 中删除指定片段（用于快捷键或按钮删除选中块）
 * @param subtitleResourceId 字幕资源 ID（用于定位项目文件夹）
 * @param translationEntryId 翻译条目 ID（项目元数据中的 ID）
 */
export async function deleteTranslationSegment(opts: { subtitleResourceId: string; translationEntryId: string; segmentIndex: number }): Promise<{ success: boolean; message?: string }> {
  try {
    // 获取字幕资源信息
    const resource = await ResourcesRepo.getById(opts.subtitleResourceId);
    if (!resource || !resource.workspaceId) {
      return { success: false, message: '字幕资源不存在或缺少工作空间' };
    }

    // 读取项目元数据
    const meta = await readProjectMeta(opts.subtitleResourceId, resource.workspaceId);
    if (!meta?.translations) {
      return { success: false, message: '未找到翻译元数据' };
    }

    // 查找翻译条目
    const translationEntry = meta.translations.find((t) => t.id === opts.translationEntryId);
    if (!translationEntry) {
      return { success: false, message: '未找到翻译条目' };
    }

    // 构建文件路径
    const translationsDir = await getTranslationsDir(opts.subtitleResourceId, resource.workspaceId);
    if (!translationsDir) {
      return { success: false, message: '无法获取翻译目录' };
    }
    const filePath = path.join(translationsDir, translationEntry.fileName);

    const content = await readFile(filePath, 'utf8');
    const payload = JSON.parse(content) as {
      translatedSegments: Array<{ index: number; text: string; st?: string; et?: string; [key: string]: unknown }>;
      updatedAt?: number;
    };
    if (!Array.isArray(payload.translatedSegments)) {
      return { success: false, message: 'translatedSegments 格式无效' };
    }

    const idx = payload.translatedSegments.findIndex((s) => s.index === opts.segmentIndex);
    if (idx < 0) {
      return { success: false, message: `未找到 index=${opts.segmentIndex} 的片段` };
    }
    payload.translatedSegments.splice(idx, 1);
    for (const seg of payload.translatedSegments) {
      if (seg.index > opts.segmentIndex) (seg as { index: number }).index -= 1;
    }
    payload.updatedAt = Date.now();

    await writeFile(filePath, JSON.stringify(payload, null, 2));
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[deleteTranslationSegment] 失败:', message);
    return { success: false, message };
  }
}

/**
 * 执行字幕翻译任务
 * @param payload 翻译参数
 * @returns 返回 requestId 和 eventsChannel
 */
export async function executeSubtitleTranslation(payload: TranslatePayload): Promise<{ requestId: string; eventsChannel: string }> {
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

  // 步骤1: 读取文件，加载字幕片段
  let actualSegments: Array<AimSegments> | undefined = segments;
  const effectiveResourceId = getMetadataResourceId(effectiveMetadata);
  let sourceSubtitleFilePath: string | undefined;
  let sourceWorkspaceId: string | undefined; // 保存工作空间 ID

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
    const runtime = await createPreferredTaskChatRuntime({
      agentId: 'chat',
      model,
      providerId,
      providerPresetId: resolvedProviderPresetId
    });
    effectiveChatFn = runtime.chatFn;
    effectiveModel = runtime.modelId;
  }
  const taskLabel = incomingTaskLabel || `${providerId}/${effectiveModel}`;
  const translationUsageRecorder = createTaskUsageRecorder({
    context: 'executeSubtitleTranslation',
    metadata: {
      resourceId: effectiveResourceId || null,
      runtime: injectedChatFn ? 'custom_chat_fn' : 'pi',
      sourceLanguage: sourceLanguage || null,
      targetLanguage,
      totalSegments: actualSegments.length
    },
    model: effectiveModel,
    providerId,
    providerPresetId: resolvedProviderPresetId,
    requestId,
    resourceId: effectiveResourceId,
    sourceId: effectiveResourceId || requestId,
    sourceLabel: '字幕翻译',
    sourceType: 'translation',
    usageCategory: 'content_processing',
    usageFeature: 'translation',
    usageStage: 'generate',
    workspaceId: sourceWorkspaceId || getMetadataWorkspaceId(effectiveMetadata)
  });

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
  TranslationService.translateSubtitles(
    {
      requestId,
      chatFn: effectiveChatFn,
      taskLabel,
      segments: actualSegments,
      sourceLanguage,
      targetLanguage,
      languageNames,
      providerId,
      model: effectiveModel,
      metadata: effectiveMetadata,
      onUsageEvent: translationUsageRecorder,
      options
    },
    emit,
    abortSignal
  ).catch((err: any) => {
    console.error('翻译失败:', err);
    const errorResourceId = getMetadataResourceId(effectiveMetadata);
    if (err.message === 'Aborted') {
      emit({ type: 'done', data: { resourceId: errorResourceId } });
    } else {
      emit({ type: 'error', data: { message: err?.message || '翻译失败', resourceId: errorResourceId } });
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
  const summaryUsageRecorder = createTaskUsageRecorder({
    context: 'executeSummarize',
    metadata: {
      contentType: Array.isArray(actualContent) ? 'segments' : 'text',
      resourceId: effectiveResourceId || null,
      runtime: injectedChatFn ? 'custom_chat_fn' : 'pi',
      targetLanguage
    },
    model: effectiveModel,
    providerId,
    providerPresetId: resolvedProviderPresetId,
    requestId,
    resourceId: effectiveResourceId,
    sourceId: effectiveResourceId || requestId,
    sourceLabel: '内容总结',
    sourceType: 'summary',
    usageCategory: 'content_processing',
    usageFeature: 'summary',
    usageStage: 'generate',
    workspaceId: sourceWorkspaceId
  });

  // 步骤4: 创建事件发射器
  const startTimestamp = Date.now();

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
          model: effectiveModel,
          startTimestamp
        });
      }
    }
  });

  // 步骤5: 异步处理总结
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
      onUsageEvent: summaryUsageRecorder,
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

  return { requestId, eventsChannel };
}

/**
 * 执行脑图生成任务
 * @param payload 脑图生成参数
 * @returns 返回 requestId 和 eventsChannel
 */
export async function executeMindmap(payload: MindmapPayload): Promise<{ requestId: string; eventsChannel: string }> {
  const normalizedPayload = normalizeProviderPreset(payload);
  const {
    abortSignal,
    chatFn: injectedChatFn,
    providerId,
    model,
    content,
    segments,
    resourceId,
    targetLanguage,
    languageNames,
    options,
    metadata = {},
    requestId: incomingRequestId,
    taskLabel: incomingTaskLabel
  } = normalizedPayload;
  const requestId = incomingRequestId || randomUUID();
  const eventsChannel = `mindmap:${requestId}`;
  const startTimestamp = Date.now(); // 记录开始时间戳
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
      const loaded = await loadSegmentsFromResource(effectiveResourceId);
      actualContent = loaded.segments;
      const resource = await ResourcesRepo.getById(effectiveResourceId);
      sourceWorkspaceId = resource?.workspaceId || sourceWorkspaceId;
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
  const mindmapUsageRecorder = createTaskUsageRecorder({
    context: 'executeMindmap',
    metadata: {
      contentType: Array.isArray(actualContent) ? 'segments' : 'text',
      resourceId: effectiveResourceId || null,
      runtime: injectedChatFn ? 'custom_chat_fn' : 'pi',
      targetLanguage
    },
    model: effectiveModel,
    providerId,
    providerPresetId: resolvedProviderPresetId,
    requestId,
    resourceId: effectiveResourceId,
    sourceId: effectiveResourceId || requestId,
    sourceLabel: '思维导图',
    sourceType: 'mindmap',
    usageCategory: 'content_processing',
    usageFeature: 'mindmap',
    usageStage: 'generate',
    workspaceId: sourceWorkspaceId
  });

  // 步骤3: 创建事件发射器
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
          model: effectiveModel,
          startTimestamp
        });
      }
    }
  });

  // 步骤4: 异步处理脑图生成
  MindmapService.generateMindmap(
    emit as any,
    {
      requestId,
      chatFn: effectiveChatFn as any,
      providerId,
      model: effectiveModel,
      taskLabel,
      content: actualContent,
      targetLanguage,
      languageNames,
      metadata: effectiveMetadata,
      onUsageEvent: mindmapUsageRecorder,
      options
    },
    abortSignal
  ).catch((err: any) => {
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

// ==================== 笔记相关 ====================

/**
 * 根据 parentResourceId 查找已存在的笔记子资源
 * 现在笔记资源使用独立类型：type === 'note'
 */
async function findExistingNoteResource(parentResourceId: string): Promise<{ id: string; filePath: string | null; createdAt: number | null } | null> {
  const children = await ResourcesRepo.listChildren(parentResourceId);
  const note = children.find((child) => child.type === 'note');
  if (!note) return null;
  return { id: note.id, filePath: note.filePath ?? null, createdAt: note.createdAt ?? null };
}

/**
 * 保存或更新笔记内容
 * @param opts 笔记数据
 * @returns 操作结果
 */
export async function saveResourceNote(opts: { resourceId: string; content: string }): Promise<{ success: boolean; noteId?: string; message?: string }> {
  const { resourceId, content } = opts;

  try {
    // 获取源资源信息
    const sourceResource = await ResourcesRepo.getById(resourceId);
    if (!sourceResource) {
      return { success: false, message: '源资源不存在' };
    }

    // 查找现有的笔记资源（listChildren 不包含 metadata，需用 getById 逐条判断）
    const existingNote = await findExistingNoteResource(resourceId);

    let noteFilePath: string;

    if (existingNote?.filePath) {
      // 使用现有文件路径
      noteFilePath = existingNote.filePath;
    } else {
      // 创建新文件路径
      const sourceFilePath = sourceResource.filePath || `resource_${resourceId}`;
      const dir = path.dirname(sourceFilePath);
      const baseName = path.basename(sourceFilePath, path.extname(sourceFilePath));
      noteFilePath = path.join(dir, `${baseName}.note.json`);
    }

    // 准备笔记数据（更新时保留原 createdAt）
    const notePayload = {
      version: 1,
      resourceId,
      content,
      title: `note_${resourceId}_${Date.now()}`,
      updatedAt: Date.now(),
      createdAt: existingNote?.createdAt ?? Date.now()
    };

    // 确保目录存在
    const dir = path.dirname(noteFilePath);
    await fs.mkdir(dir, { recursive: true });

    // 写入 JSON 文件
    const fileContent = JSON.stringify(notePayload, null, 2);
    await writeFile(noteFilePath, fileContent);

    // 获取文件大小
    const jsonStat = await fs.stat(noteFilePath);
    const noteTitle = notePayload.title || (sourceResource.title ? `${sourceResource.title} - 笔记` : '笔记');

    const resourceData = {
      type: 'note' as const,
      parentResourceId: resourceId,
      workspaceId: sourceResource.workspaceId,
      folderId: sourceResource.folderId,
      title: noteTitle,
      description: `笔记自: ${sourceResource.title || sourceResource.description || '原资源'}`,
      filePath: noteFilePath,
      mimeType: 'application/json',
      sizeBytes: jsonStat.size,
      status: 'ready' as const,
      metadata: JSON.stringify({
        noteType: 'note',
        noteSource: resourceId,
        updatedAt: Date.now()
      })
    };

    if (existingNote?.id) {
      // 更新现有资源
      await ResourcesRepo.update(existingNote.id, resourceData as any);
      return { success: true, noteId: existingNote.id };
    } else {
      // 创建新资源
      const newResource = await ResourcesRepo.upsert(resourceData as any);
      return { success: true, noteId: newResource?.id };
    }
  } catch (error) {
    console.error('[save-note] 保存笔记失败:', error);
    return { success: false, message: error instanceof Error ? error.message : '保存笔记失败' };
  }
}

/**
 * 加载资源的笔记内容
 * @param resourceId 资源 ID
 * @returns 笔记数据
 */
export async function loadResourceNote(resourceId: string): Promise<{ id: string; content: string; title?: string; filePath?: string; createdAt?: number; updatedAt?: number } | null> {
  try {
    const existingNote = await findExistingNoteResource(resourceId);
    if (!existingNote?.filePath) return null;

    const content = await readFile(existingNote.filePath, 'utf8');
    const noteData = JSON.parse(content) as { content?: string; title?: string; createdAt?: number; updatedAt?: number };

    return {
      id: existingNote.id,
      filePath: existingNote.filePath,
      content: noteData.content ?? '',
      title: noteData.title,
      createdAt: noteData.createdAt ?? existingNote.createdAt ?? undefined,
      updatedAt: noteData.updatedAt
    };
  } catch (error) {
    console.error('[load-note] 加载笔记失败:', error);
    return null;
  }
}
