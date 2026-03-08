import { createTool } from '@mastra/core';
import { z } from 'zod';

/**
 * YouTube 视频下载工具
 *
 * 功能：
 * 1. 解析 YouTube 视频链接
 * 2. 获取视频信息（标题、作者、时长等）
 * 3. 启动下载任务
 * 4. 将下载的视频自动添加到资源库
 *
 * 使用场景：
 * - 用户提供 YouTube 链接并要求下载
 * - 用户说"下载这个视频"、"保存这个 YouTube 视频"等
 * - 用户分享 YouTube 链接并询问相关信息
 *
 * 注意：此工具同时支持主进程和渲染进程环境
 */

// 主进程服务（延迟加载，避免循环依赖）
let mainProcessServices: any = null;

/**
 * 获取主进程服务
 */
async function getMainProcessServices(): Promise<any> {
  if (!mainProcessServices) {
    // 动态导入主进程服务
    try {
      mainProcessServices = await import('../../../electron/main/handlers/downloader');
    } catch (error) {
      console.error('[youtube-download-tool] Failed to load main process services:', error);
      mainProcessServices = null;
    }
  }
  return mainProcessServices;
}

/**
 * 获取视频信息的适配器
 */
async function getVideoInfoAdapter(url: string, timeout: number = 30000): Promise<any> {
  // 主进程：直接调用服务
  const services = await getMainProcessServices();
  if (!services) {
    return { success: false, error: '主进程服务未加载' };
  }
  try {
    const videoInfo = await services.getVideoInfo(url, timeout);
    return { success: true, data: videoInfo };
  } catch (error: any) {
    return { success: false, error: error?.message || String(error) };
  }
}

/**
 * 下载视频的适配器
 */
async function downloadVideoAdapter(options: any): Promise<any> {
  // 主进程：直接调用服务
  const services = await getMainProcessServices();
  if (!services) {
    return { success: false, error: '主进程服务未加载' };
  }
  try {
    const taskId = await services.downloadManager.addTask(options);
    return { success: true, data: { taskId } };
  } catch (error: any) {
    return { success: false, error: error?.message || String(error) };
  }
}

// 输入参数 schema
const youtubeDownloadInputSchema = z.object({
  url: z.string().describe('YouTube 视频的 URL 地址'),
  quality: z.number().optional().describe('下载质量等级（1-3）：1=最佳质量，2=中等质量，3=仅音频。默认为 1'),
  filename: z.string().optional().describe('自定义文件名（不含扩展名）。如果不提供，使用视频标题'),
  folderId: z.string().optional().describe('保存到指定的文件夹 ID。如果不提供，保存到默认位置')
});

// 输出结果 schema（精简版，减少 token 消耗）
const youtubeDownloadOutputSchema = z.object({
  success: z.boolean().describe('下载任务是否成功启动'),
  videoInfo: z
    .object({
      title: z.string().describe('视频标题'),
      channel: z.string().optional().describe('频道名称'),
      channelId: z.string().optional().describe('频道 ID'),
      duration: z.number().optional().describe('视频时长（秒）')
    })
    .optional()
    .describe('视频信息（精简版）'),
  taskId: z.string().optional().describe('下载任务 ID'),
  channelInfo: z
    .object({
      channelName: z.string().describe('频道名称'),
      channelId: z.string().describe('频道 ID'),
      canSubscribe: z.boolean().describe('是否可以订阅此频道')
    })
    .optional()
    .describe('频道信息（用于友情提示订阅）'),
  message: z.string().describe('返回消息'),
  error: z.string().optional().describe('错误信息')
});

type YoutubeDownloadInput = z.infer<typeof youtubeDownloadInputSchema>;
type YoutubeDownloadOutput = z.infer<typeof youtubeDownloadOutputSchema>;

/**
 * 创建 YouTube 下载工具
 */
export const createYoutubeDownloadTool = (): ReturnType<typeof createTool> =>
  createTool({
    id: 'youtube-download',
    description: `下载 YouTube 视频到本地资源库。

**使用场景**：
- 用户提供 YouTube 链接并要求下载
- 用户说"下载这个视频"、"保存 YouTube 视频"、"把这个视频下载下来"
- 用户分享 YouTube 链接（youtube.com 或 youtu.be）

**功能特性**：
- 自动获取视频信息（标题、作者、时长等）
- 支持质量选择（最佳质量、中等质量、仅音频）
- 下载完成后自动添加到资源库
- 支持自定义文件名和保存位置
- 返回频道信息，可以友情提示用户订阅

**重要提示**：
下载任务是异步的，启动后会在后台执行。用户可以通过下载管理器查看进度。
下载完成后，视频会自动出现在资源库中。

**友情提示逻辑**：
如果这是用户第一次下载某个频道的视频，工具会返回频道信息。
你应该友情提示用户："如果你喜欢这个频道，我可以帮你订阅它，这样就能自动获取最新视频了。"`,

    inputSchema: youtubeDownloadInputSchema,
    outputSchema: youtubeDownloadOutputSchema,

    execute: async ({ context }): Promise<YoutubeDownloadOutput> => {
      const { url, quality = 1, filename, folderId } = context as YoutubeDownloadInput;

      try {
        // 1. 验证 URL
        if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
          return {
            success: false,
            message: '无效的 YouTube 链接',
            error: '请提供有效的 YouTube 视频链接（youtube.com 或 youtu.be）'
          };
        }

        // 2. 获取视频信息
        const infoResult = await getVideoInfoAdapter(url, 30000);

        if (!infoResult.success) {
          return {
            success: false,
            message: '获取视频信息失败',
            error: infoResult.error || '无法获取视频信息，请检查链接是否正确'
          };
        }

        const videoInfo = infoResult.data;

        // 3. 启动下载任务
        const downloadOptions = {
          url,
          quality,
          filename: filename || videoInfo.title,
          folderId,
          videoInfo // 传递视频信息以便自动添加到资源库
        };

        const downloadResult = await downloadVideoAdapter(downloadOptions);

        if (!downloadResult.success) {
          return {
            success: false,
            videoInfo: {
              title: videoInfo.title,
              channel: videoInfo.channel,
              channelId: videoInfo.channel_id,
              duration: videoInfo.duration
            },
            message: '启动下载失败',
            error: downloadResult.error || '下载任务创建失败'
          };
        }

        // 4. 构建返回结果，包含频道信息
        const result: YoutubeDownloadOutput = {
          success: true,
          videoInfo: {
            title: videoInfo.title,
            channel: videoInfo.channel,
            channelId: videoInfo.channel_id,
            duration: videoInfo.duration
          },
          taskId: downloadResult.data?.taskId,
          message: `已启动下载任务：${videoInfo.title}`
        };

        // 5. 如果有频道信息，添加订阅提示
        if (videoInfo.channel_id && videoInfo.channel) {
          result.channelInfo = {
            channelName: videoInfo.channel,
            channelId: videoInfo.channel_id,
            canSubscribe: true
          };
        }

        return result;
      } catch (error: any) {
        console.error('[youtube-download-tool] Error:', error);
        return {
          success: false,
          message: '下载工具执行失败',
          error: error?.message || String(error)
        };
      }
    }
  });

export const youtubeDownloadTool = createYoutubeDownloadTool();
