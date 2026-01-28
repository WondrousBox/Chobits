/**
 * TTS IPC 主进程处理器
 *
 * 负责处理批量TTS合成的IPC调用
 */

import { createHash } from 'crypto';
import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';
import * as path from 'path';

import { ResourcesRepo, WorkspacesRepo } from '../../electron/main/db/repositories';
import { type BatchTTSConfig, type BatchTTSEvent, type BatchTTSResult, BatchTTSService, type TTSItem } from './batch-tts-service';

/**
 * 生成配置的MD5前缀（与 batch-tts-service.ts 一致）
 */
function generateConfigPrefix(config: { type?: string; voiceName: string; rate?: number; pitch?: number }): string {
  const configStr = JSON.stringify({
    type: config.type || 'Edge',
    voiceName: config.voiceName,
    rate: config.rate,
    pitch: config.pitch
  });
  return createHash('md5').update(configStr).digest('hex').substring(0, 8);
}

// TTS 事件通道
const TTS_EVENT_CHANNEL = 'tts:event';

/** 轨道标识：main 为主轨道，其他为语言代码如 zh-CN、en */
export type TTSTrackId = 'main' | string;

// 获取TTS输出目录（按轨道分目录：main/ 或 <languageCode>/）
async function getTTSOutputDir(resourceId: string, trackId: TTSTrackId = 'main'): Promise<string> {
  try {
    // 从数据库获取资源信息
    const resource = await ResourcesRepo.getById(resourceId);

    if (!resource) {
      console.warn(`[TTS] 资源不存在: ${resourceId}, 使用默认缓存目录`);
      const userDataPath = app.getPath('userData');
      return path.join(userDataPath, 'tts-cache', resourceId, trackId);
    }

    // 获取工作空间信息
    const workspaceId = resource.workspaceId;
    let workspace;
    if (workspaceId) {
      workspace = await WorkspacesRepo.getById(workspaceId);
    } else {
      workspace = await WorkspacesRepo.getDefault();
    }

    if (!workspace || !workspace.rootPath) {
      console.warn(`[TTS] 工作空间根路径不存在,使用默认缓存目录`);
      const userDataPath = app.getPath('userData');
      return path.join(userDataPath, 'tts-cache', resourceId, trackId);
    }

    // 构建TTS目录: <workspaceRoot>/resources/tts/<resourceId>/<trackId>
    let baseTtsDir: string;
    if (resource.folderId) {
      baseTtsDir = path.join(workspace.rootPath, 'resources', 'folders', resource.folderId, 'tts', resourceId);
    } else {
      baseTtsDir = path.join(workspace.rootPath, 'resources', 'tts', resourceId);
    }
    const ttsDir = path.join(baseTtsDir, trackId);

    console.log(`[TTS] TTS输出目录: ${ttsDir}`);
    return ttsDir;
  } catch (error) {
    console.error('[TTS] 获取TTS输出目录失败:', error);
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'tts-cache', resourceId, trackId);
  }
}

/**
 * 批量TTS合成请求参数
 */
export interface BatchTTSSynthesizeParams {
  /** 资源ID（用于确定输出目录和缓存） */
  resourceId: string;
  /** 轨道标识：main 为主轨道，其他为语言代码如 zh-CN、en */
  trackId?: TTSTrackId;
  /** 语言代码（翻译轨道时可选，用于显示；存储路径已由 trackId 决定） */
  languageCode?: string;
  /** 请求ID（可选，如果不提供会自动生成） */
  requestId?: string;
  /** 要合成的字幕项 */
  items: Array<{
    /** 文本内容 */
    text: string;
    /** 字幕索引 */
    index: number;
    /** 唯一标识（可选） */
    id?: string;
  }>;
  /** TTS配置 */
  config: BatchTTSConfig;
  /** 最大并发数 */
  maxConcurrency?: number;
  /** 是否跳过空白移除 */
  skipTrimSilence?: boolean;
}

/**
 * 批量TTS合成返回结果（立即返回，不等待合成完成）
 */
export interface BatchTTSSynthesizeResponse {
  /** 请求ID，用于跟踪任务和接收事件 */
  requestId: string;
  /** 事件通道名称 */
  eventsChannel: string;
}

/**
 * 初始化TTS IPC处理器
 */
export function initTTSHandlers(): void {
  /**
   * 批量TTS合成
   * 立即返回 requestId 和 eventsChannel，不等待合成完成
   * 合成进度和结果通过事件通道推送给渲染进程
   */
  ipcMain.handle('tts:synthesizeBatch', async (_event: IpcMainInvokeEvent, params: BatchTTSSynthesizeParams): Promise<BatchTTSSynthesizeResponse> => {
    const { resourceId, trackId = 'main', requestId, items, config, maxConcurrency = 5, skipTrimSilence = false } = params;

    const actualRequestId = requestId || `tts-${resourceId}-${trackId}-${Date.now()}`;
    const eventsChannel = TTS_EVENT_CHANNEL;
    const outputDir = await getTTSOutputDir(resourceId, trackId);

    console.log(`
=========[TTS] 开始批量合成=========================================================
requestId: ${actualRequestId}, trackId: ${trackId}, 共 ${items.length} 项
resourceId: ${resourceId}
输出目录: ${outputDir}
配置: ${JSON.stringify(config, null, 2)}
最大并发数: ${maxConcurrency}
跳过空白移除: ${skipTrimSilence}
==================================================================================
      `);

    // 事件发送函数
    const emit = (event: BatchTTSEvent): void => {
      // 发送消息到渲染进程
      BrowserWindow.getAllWindows().forEach((w) => {
        if (!w.isDestroyed()) {
          try {
            w.webContents.send(eventsChannel, {
              requestId: actualRequestId,
              resourceId,
              ...event
            });
          } catch (error) {
            console.error(`发送TTS消息失败:`, error);
          }
        }
      });
    };

    // 异步执行合成，不等待完成
    BatchTTSService.synthesizeBatch(
      {
        requestId: actualRequestId,
        items: items as TTSItem[],
        config,
        outputDir,
        maxConcurrency,
        skipTrimSilence
      },
      emit
    ).catch((error) => {
      console.error('[TTS] 批量合成失败:', error);
      if (error.message === 'Aborted') {
        emit({ type: 'done' });
      } else {
        emit({
          type: 'error',
          data: { message: error?.message || '批量合成失败' }
        });
      }
    });

    // 立即返回 requestId 和 eventsChannel
    return { requestId: actualRequestId, eventsChannel };
  });

  /**
   * 取消TTS合成任务
   */
  ipcMain.handle('tts:cancelTask', async (_event: IpcMainInvokeEvent, requestId: string): Promise<boolean> => {
    console.log(`[TTS] 取消任务: ${requestId}`);
    return BatchTTSService.cancelTask(requestId);
  });

  /**
   * 获取所有活跃的TTS任务
   */
  ipcMain.handle('tts:getActiveTasks', async (): Promise<any[]> => {
    return BatchTTSService.getAllActiveTasks();
  });

  /**
   * 检查是否有活跃任务
   */
  ipcMain.handle('tts:hasActiveTasks', async (): Promise<boolean> => {
    return BatchTTSService.hasActiveTasks();
  });

  /**
   * 加载资源的TTS历史记录
   * 支持参数：resourceId, trackId（可选，默认 main）, configPrefix 或 config
   */
  ipcMain.handle('tts:loadHistory', async (_event: IpcMainInvokeEvent, params: { resourceId: string; trackId?: TTSTrackId; configPrefix?: string; config?: BatchTTSConfig }): Promise<any> => {
    const { resourceId, trackId = 'main', configPrefix, config } = params;
    const outputDir = await getTTSOutputDir(resourceId, trackId);

    // 如果提供了 config，计算 configPrefix
    const actualConfigPrefix = configPrefix || (config ? generateConfigPrefix(config) : undefined);

    if (!actualConfigPrefix) {
      throw new Error('必须提供 configPrefix 或 config 参数');
    }

    return BatchTTSService.loadHistory(outputDir, actualConfigPrefix);
  });

  console.log('[TTS] IPC处理器已初始化');
}

export default initTTSHandlers;
