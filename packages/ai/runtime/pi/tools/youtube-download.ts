import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

import { resolveGuardedToolExecution } from '../skills';
import type { PiSessionToolContext } from '../tool-context';
import { createJsonToolResult } from './result';

const youtubeDownloadParameters = Type.Object({
  url: Type.String({ description: 'YouTube 视频的 URL 地址' }),
  quality: Type.Optional(Type.Number({ description: '下载质量等级（1-3）：1=最佳质量，2=中等质量，3=仅音频。默认为 1' })),
  filename: Type.Optional(Type.String({ description: '自定义文件名（不含扩展名）。如果不提供，使用视频标题' })),
  folderId: Type.Optional(Type.String({ description: '预期保存的资源库文件夹 ID（当前下载器仍按现有逻辑选择目标位置）' }))
});

type YoutubeInfoLike = {
  channel?: string;
  channel_id?: string;
  duration?: number;
  title?: string;
  uploader?: string;
  uploader_id?: string;
};

async function loadYoutubeDownloader(): Promise<typeof import('../../../../../electron/main/handlers/downloader')> {
  return import('../../../../../electron/main/handlers/downloader');
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

export function createPiYoutubeDownloadTool(toolContext: PiSessionToolContext): ToolDefinition<typeof youtubeDownloadParameters> {
  return {
    name: 'youtubeDownloadTool',
    label: 'youtubeDownloadTool',
    description: '下载 YouTube 视频到本地资源库。会先解析视频信息，再启动后台下载任务，并返回频道信息供后续提示订阅。',
    parameters: youtubeDownloadParameters,
    async execute(toolCallId, input, signal) {
      const { filename, folderId, quality = 1, url } = input;

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
        const videoInfo = (await getVideoInfo(url, 30000)) as YoutubeInfoLike;

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

        return createJsonToolResult({
          success: true,
          videoInfo: {
            title: videoInfo.title || filename || '未命名视频',
            channel: channelName,
            channelId,
            duration: videoInfo.duration
          },
          taskId,
          channelInfo:
            channelName && channelId
              ? {
                  channelName,
                  channelId,
                  canSubscribe: true
                }
              : undefined,
          warning: folderId ? '当前下载器仍沿用既有目录分配逻辑，folderId 暂未单独接管下载落点。' : undefined,
          message: `已启动下载任务：${videoInfo.title || url}`
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
