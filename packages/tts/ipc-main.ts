/**
 * TTS IPC 主进程处理器
 *
 * 负责处理批量TTS合成的IPC调用
 */

import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';
import * as path from 'path';

import { ResourcesRepo, WorkspacesRepo } from '../../electron/main/db/repositories';
import { type BatchTTSConfig, type BatchTTSEvent, type BatchTTSResult, BatchTTSService, type TTSItem } from './batch-tts-service';

// TTS 事件通道
const TTS_EVENT_CHANNEL = 'tts:event';

// 获取TTS输出目录
async function getTTSOutputDir(resourceId: string): Promise<string> {
  try {
    // 从数据库获取资源信息
    const resource = await ResourcesRepo.getById(resourceId);

    if (!resource) {
      console.warn(`[TTS] 资源不存在: ${resourceId}, 使用默认缓存目录`);
      const userDataPath = app.getPath('userData');
      return path.join(userDataPath, 'tts-cache', resourceId);
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
      return path.join(userDataPath, 'tts-cache', resourceId);
    }

    // 构建TTS目录: <workspaceRoot>/resources/tts/<resourceId>
    let ttsDir: string;
    if (resource.folderId) {
      ttsDir = path.join(workspace.rootPath, 'resources', 'folders', resource.folderId, 'tts', resourceId);
    } else {
      ttsDir = path.join(workspace.rootPath, 'resources', 'tts', resourceId);
    }

    console.log(`[TTS] TTS输出目录: ${ttsDir}`);
    return ttsDir;
  } catch (error) {
    console.error('[TTS] 获取TTS输出目录失败:', error);
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'tts-cache', resourceId);
  }
}

/**
 * 批量TTS合成请求参数
 */
export interface BatchTTSSynthesizeParams {
  /** 资源ID（用于确定输出目录和缓存） */
  resourceId: string;
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
 * 初始化TTS IPC处理器
 */
export function initTTSHandlers(win: BrowserWindow): void {
  /**
   * 批量TTS合成
   */
  ipcMain.handle('tts:synthesizeBatch', async (_event: IpcMainInvokeEvent, params: BatchTTSSynthesizeParams): Promise<BatchTTSResult> => {
    const { resourceId, requestId, items, config, maxConcurrency = 5, skipTrimSilence = false } = params;

    const actualRequestId = requestId || `tts-${resourceId}-${Date.now()}`;
    const outputDir = await getTTSOutputDir(resourceId);

    console.log(`[TTS] 开始批量合成，requestId: ${actualRequestId}, 共 ${items.length} 项`);

    // 事件发送函数
    const emit = (event: BatchTTSEvent): void => {
      win.webContents.send(TTS_EVENT_CHANNEL, {
        requestId: actualRequestId,
        resourceId,
        ...event
      });
    };

    try {
      const result = await BatchTTSService.synthesizeBatch(
        {
          requestId: actualRequestId,
          items: items as TTSItem[],
          config,
          outputDir,
          maxConcurrency,
          skipTrimSilence
        },
        emit
      );

      return result;
    } catch (error) {
      console.error('[TTS] 批量合成失败:', error);
      throw error;
    }
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
   */
  ipcMain.handle('tts:loadHistory', async (_event: IpcMainInvokeEvent, params: { resourceId: string; configPrefix: string }): Promise<any> => {
    const { resourceId, configPrefix } = params;
    const outputDir = await getTTSOutputDir(resourceId);
    return BatchTTSService.loadHistory(outputDir, configPrefix);
  });

  console.log('[TTS] IPC处理器已初始化');
}

export default initTTSHandlers;
