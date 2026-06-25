import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { resolveGuardedToolExecution } from '../skills';
import type { PiSessionToolContext } from '../tool-context';
import { waitForLongTaskOrBackground } from './long-task-control';
import { createJsonToolResult } from './result';

const youtubeDownloadParameters = Type.Object({
  url: Type.String({ description: 'YouTube 视频的 URL 地址' }),
  quality: Type.Optional(Type.Number({ description: '下载质量等级（1-3）：1=最佳质量，2=中等质量，3=仅音频。默认为 1' })),
  filename: Type.Optional(Type.String({ description: '自定义文件名（不含扩展名）。如果不提供，使用视频标题' })),
  folderId: Type.Optional(Type.String({ description: '预期保存的资源库文件夹 ID（当前下载器仍按现有逻辑选择目标位置）' })),
  waitForCompletion: Type.Optional(
    Type.Boolean({
      description: 'True waits for download completion with live progress. False starts the task and immediately continues in background mode.'
    })
  )
});

type YoutubeInfoLike = {
  channel?: string;
  channel_id?: string;
  duration?: number;
  title?: string;
  uploader?: string;
  uploader_id?: string;
};

interface DownloadProgressLike {
  percent?: number;
  totalSize?: string;
  downloadSpeed?: string;
  eta?: string;
  statusText?: string;
}

interface DownloadCompletionLike {
  files?: string[];
  thumbnails?: string[];
  resource?: any;
  resourceId?: string;
}

interface DownloadTaskLike {
  id: string;
  status: 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';
  progress?: DownloadProgressLike;
  error?: string;
  result?: DownloadCompletionLike;
}

interface DownloadManagerLike {
  addTask(options: Record<string, any>): Promise<string>;
  getTask(taskId: string): DownloadTaskLike | undefined;
  on(event: string, listener: (task: DownloadTaskLike) => void): this;
  off(event: string, listener: (task: DownloadTaskLike) => void): this;
}

interface DownloaderModule {
  downloadManager: DownloadManagerLike;
  getVideoInfo: (url: string, timeoutMs?: number) => Promise<YoutubeInfoLike>;
}

interface DownloadCompletionResult {
  files: string[];
  resource?: any;
  resourceId?: string;
  taskId: string;
  thumbnails: string[];
}

async function loadYoutubeDownloader(): Promise<DownloaderModule> {
  return import('../../../../../electron/main/handlers/downloader') as Promise<DownloaderModule>;
}

function isYouTubeUrl(url: string): boolean {
  return url.includes('youtube.com') || url.includes('youtu.be');
}

function resolveChannelName(videoInfo: YoutubeInfoLike): string | undefined {
  const channel = typeof videoInfo.channel === 'string' && videoInfo.channel.trim() ? videoInfo.channel.trim() : undefined;
  if (channel) return channel;

  const uploader = typeof videoInfo.uploader === 'string' && videoInfo.uploader.trim() ? videoInfo.uploader.trim() : undefined;
  return uploader;
}

function resolveChannelId(videoInfo: YoutubeInfoLike): string | undefined {
  const channelId = typeof videoInfo.channel_id === 'string' && videoInfo.channel_id.trim() ? videoInfo.channel_id.trim() : undefined;
  if (channelId) return channelId;

  const uploaderId = typeof videoInfo.uploader_id === 'string' && videoInfo.uploader_id.trim() ? videoInfo.uploader_id.trim() : undefined;
  return uploaderId;
}

function clampProgress(value?: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function formatDownloadProgress(task: DownloadTaskLike): { message?: string; progress: number } {
  const progress = clampProgress(task.progress?.percent);
  const parts: string[] = [];

  if (task.status === 'queued') {
    parts.push('排队中');
  } else if (task.status === 'completed') {
    parts.push('下载完成');
  } else if (task.status === 'failed') {
    parts.push('下载失败');
  } else if (task.status === 'cancelled') {
    parts.push('下载已取消');
  } else {
    parts.push(task.progress?.statusText || '下载中');
  }

  if (task.progress?.totalSize) {
    parts.push(task.progress.totalSize);
  }
  if (task.progress?.downloadSpeed) {
    parts.push(task.progress.downloadSpeed);
  }
  if (task.progress?.eta) {
    parts.push(`剩余 ${task.progress.eta}`);
  }

  return {
    progress,
    ...(parts.length > 0 ? { message: parts.join(' · ') } : {})
  };
}

function toCompletionResult(taskId: string, task: DownloadTaskLike): DownloadCompletionResult {
  return {
    taskId,
    files: task.result?.files || [],
    thumbnails: task.result?.thumbnails || [],
    ...(task.result?.resourceId ? { resourceId: task.result.resourceId } : {}),
    ...(task.result?.resource ? { resource: task.result.resource } : {})
  };
}

function waitForDownloadTask(options: {
  downloadManager: DownloadManagerLike;
  taskId: string;
  toolCallId: string;
  toolContext: PiSessionToolContext;
}): Promise<DownloadCompletionResult> {
  const { downloadManager, taskId, toolCallId, toolContext } = options;

  return new Promise<DownloadCompletionResult>((resolve, reject) => {
    let lastProgress = 0;

    const reportTaskProgress = (task: DownloadTaskLike): void => {
      const { message, progress } = formatDownloadProgress(task);
      lastProgress = Math.max(lastProgress, progress);
      toolContext.reportProgress?.(toolCallId, lastProgress, message);
    };

    const cleanup = (): void => {
      downloadManager.off('taskStarted', handleStarted);
      downloadManager.off('taskProgress', handleProgress);
      downloadManager.off('taskCompleted', handleCompleted);
      downloadManager.off('taskFailed', handleFailed);
      downloadManager.off('taskCancelled', handleCancelled);
    };

    const handleStarted = (task: DownloadTaskLike): void => {
      if (task.id !== taskId) return;
      reportTaskProgress(task);
    };

    const handleProgress = (task: DownloadTaskLike): void => {
      if (task.id !== taskId) return;
      reportTaskProgress(task);
    };

    const handleCompleted = (task: DownloadTaskLike): void => {
      if (task.id !== taskId) return;
      cleanup();
      toolContext.reportProgress?.(toolCallId, 100, '下载完成');
      resolve(toCompletionResult(taskId, task));
    };

    const handleFailed = (task: DownloadTaskLike): void => {
      if (task.id !== taskId) return;
      cleanup();
      reject(new Error(task.error || 'YouTube 下载失败'));
    };

    const handleCancelled = (task: DownloadTaskLike): void => {
      if (task.id !== taskId) return;
      cleanup();
      reject(new Error(task.error || 'YouTube 下载已取消'));
    };

    downloadManager.on('taskStarted', handleStarted);
    downloadManager.on('taskProgress', handleProgress);
    downloadManager.on('taskCompleted', handleCompleted);
    downloadManager.on('taskFailed', handleFailed);
    downloadManager.on('taskCancelled', handleCancelled);

    const currentTask = downloadManager.getTask(taskId);
    if (!currentTask) {
      cleanup();
      reject(new Error(`Download task "${taskId}" was not found.`));
      return;
    }

    if (currentTask.status === 'completed') {
      cleanup();
      resolve(toCompletionResult(taskId, currentTask));
      return;
    }

    if (currentTask.status === 'failed') {
      cleanup();
      reject(new Error(currentTask.error || 'YouTube 下载失败'));
      return;
    }

    if (currentTask.status === 'cancelled') {
      cleanup();
      reject(new Error(currentTask.error || 'YouTube 下载已取消'));
      return;
    }

    reportTaskProgress(currentTask);
  });
}

export function createPiYoutubeDownloadTool(toolContext: PiSessionToolContext): ToolDefinition<typeof youtubeDownloadParameters> {
  return {
    name: 'youtubeDownloadTool',
    label: 'youtubeDownloadTool',
    description: '下载 YouTube 视频到本地资源库。默认会等待下载完成并展示实时进度，也支持直接转为后台执行。',
    parameters: youtubeDownloadParameters,
    async execute(toolCallId, input, signal) {
      const { filename, folderId, quality = 1, url, waitForCompletion } = input;
      const shouldWait = waitForCompletion !== false;

      if (signal?.aborted) {
        throw new Error('Operation aborted');
      }

      if (!url || !isYouTubeUrl(url)) {
        return createJsonToolResult({
          success: false,
          message: '无效的 YouTube 链接',
          error: '请提供有效的 YouTube 视频链接（youtube.com 或 youtu.be）'
        });
      }

      try {
        const guardResolution = await resolveGuardedToolExecution(toolContext, toolCallId, 'youtube-download');
        if (guardResolution?.kind === 'blocked' || guardResolution?.kind === 'cancel') {
          return createJsonToolResult(guardResolution.details);
        }

        const { downloadManager, getVideoInfo } = await loadYoutubeDownloader();
        const videoInfo = await getVideoInfo(url, 30000);

        if (signal?.aborted) {
          throw new Error('Operation aborted');
        }

        const taskId = await downloadManager.addTask({
          url,
          quality,
          filename: filename || videoInfo.title,
          videoInfo,
          folderId
        } as any);

        const channelName = resolveChannelName(videoInfo);
        const channelId = resolveChannelId(videoInfo);
        const baseResult: Record<string, any> = {
          success: true,
          taskId,
          videoInfo: {
            title: videoInfo.title || filename || '未命名视频',
            channel: channelName,
            channelId,
            duration: videoInfo.duration
          }
        };

        if (channelName && channelId) {
          baseResult.channelInfo = {
            channelName,
            channelId,
            canSubscribe: true
          };
        }

        if (guardResolution?.warning) {
          baseResult.warning = guardResolution.warning;
        } else if (folderId) {
          baseResult.warning = '当前下载器仍沿用既有目录分配逻辑，folderId 暂未单独接管下载落点。';
        }

        if (!shouldWait) {
          return createJsonToolResult({
            ...baseResult,
            executionMode: 'background',
            status: 'running',
            message: `已启动下载任务：${videoInfo.title || url}`
          });
        }

        const taskPromise = waitForDownloadTask({
          downloadManager,
          taskId,
          toolCallId,
          toolContext
        });

        const waitOutcome = await waitForLongTaskOrBackground({
          toolCallId,
          toolContext,
          taskLabel: `视频下载：${videoInfo.title || 'YouTube 视频'}`,
          taskPromise,
          prompt: `视频下载“${videoInfo.title || url}”正在执行中。AI 会继续等待结果，并在完成后继续后续处理。`,
          description: '如果你不想继续等待，可以把下载切到后台执行，稍后再到资源库或下载管理器查看结果。'
        });

        if (waitOutcome.mode === 'background') {
          void taskPromise.catch((error) => {
            console.warn('[youtubeDownloadTool] Background download task failed:', error);
          });

          return createJsonToolResult({
            ...baseResult,
            backgrounded: true,
            executionMode: 'background',
            status: 'running',
            message: `下载任务已切到后台继续执行：${videoInfo.title || url}`
          });
        }

        return createJsonToolResult({
          ...baseResult,
          executionMode: 'completed',
          status: 'completed',
          message: `视频下载完成：${videoInfo.title || url}`,
          files: waitOutcome.result.files,
          thumbnails: waitOutcome.result.thumbnails,
          ...(waitOutcome.result.resourceId
            ? {
                next: {
                  resourceId: waitOutcome.result.resourceId,
                  resourceRole: 'video'
                }
              }
            : {}),
          ...(waitOutcome.result.resourceId ? { resourceId: waitOutcome.result.resourceId } : {}),
          ...(waitOutcome.result.resource ? { createdResource: waitOutcome.result.resource } : {}),
          ...(waitOutcome.result.resource ? { resource: waitOutcome.result.resource } : {})
        });
      } catch (error: any) {
        return createJsonToolResult({
          success: false,
          message: '下载工具执行失败',
          error: error?.message || '启动 YouTube 下载失败'
        });
      }
    }
  };
}
