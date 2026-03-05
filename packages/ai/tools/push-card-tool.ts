/**
 * 推送资源卡片工具
 *
 * 允许 AI 在对话中推送资源卡片到聊天窗口
 * 用户点击卡片可以跳转到资源详情页
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { ChatRepo } from '../../common/db';
import { pushCardToWindows } from '../ipc-main';
import type { ChatCardType } from '../types';
import { pushCardToolContext } from './push-card-tool-context';

/**
 * 推送卡片上下文接口
 */
export interface PushCardToolContext {
  /** 当前会话 ID（可选，用于定向推送和持久化） */
  conversationId?: string;
  /** 目标窗口 ID（可选） */
  targetWindowId?: number;
}

/**
 * 推送卡片输入参数
 */
const pushCardInputSchema = z.object({
  /** 卡片类型 */
  type: z.enum(['resource', 'video', 'audio', 'image', 'document', 'link', 'file']).describe('卡片类型'),
  /** 资源 ID（用于从数据库加载资源信息） */
  resourceId: z.string().optional().describe('资源 ID，用于从数据库加载完整资源信息'),
  /** 资源数据（可选，用于临时卡片，无需从数据库加载） */
  data: z
    .object({
      id: z.string().describe('资源唯一标识'),
      title: z.string().optional().describe('资源标题'),
      description: z.string().optional().describe('资源描述'),
      thumbnailPath: z.string().optional().describe('缩略图路径'),
      filePath: z.string().optional().describe('文件路径'),
      url: z.string().optional().describe('链接地址'),
      sizeBytes: z.number().optional().describe('文件大小（字节）'),
      durationMs: z.number().optional().describe('时长（毫秒）'),
      domain: z.string().optional().describe('域名')
    })
    .optional()
    .describe('内嵌的资源数据（用于临时卡片，无需从数据库加载）'),
  /** 文本说明 */
  text: z.string().optional().describe('可选的文本说明，会显示在卡片上方')
});

/**
 * 推送卡片输出参数
 */
const pushCardOutputSchema = z.object({
  success: z.boolean().describe('是否成功'),
  error: z.string().optional().describe('错误信息（如果失败）')
});

/**
 * 创建推送卡片工具
 *
 * @param context - 工具上下文，包含 conversationId 等信息
 *
 * 使用示例：
 * ```typescript
 * // 在 Agent 中使用
 * const agent = new Agent({
 *   name: 'assistant',
 *   tools: {
 *     pushCard: createPushCardTool({ conversationId: 'xxx' })
 *   },
 * });
 *
 * // AI 调用示例：
 * // 推送数据库中的资源
 * pushCard({ type: 'video', resourceId: 'xxx-xxx', text: '这是你想要找的视频' })
 *
 * // 推送临时卡片（不在数据库中）
 * pushCard({
 *   type: 'link',
 *   data: { id: 'temp-1', title: '示例链接', url: 'https://example.com' },
 *   text: '推荐你看看这个'
 * })
 * ```
 */
export const createPushCardTool = (context?: PushCardToolContext): ReturnType<typeof createTool> =>
  createTool({
    id: 'push-card',
    description: `在聊天中推送资源卡片。当用户询问资源、想要查看某个文件、或者你需要向用户展示资源时使用。

使用场景：
- 用户问"有没有关于xxx的视频/音频/文档"时，推送相关资源卡片
- 用户想查看某个资源详情时，推送资源卡片让他们点击跳转
- 你找到了用户需要的资源，推送卡片让用户直接访问

卡片类型：
- resource: 通用资源
- video: 视频
- audio: 音频
- image: 图片
- document: 文档
- link: 链接
- file: 文件

注意：
- resourceId 用于推送数据库中已有的资源（推荐）
- data 用于推送临时内容（如搜索结果、外部链接等）
- text 参数会显示在卡片上方，用于说明`,
    inputSchema: pushCardInputSchema,
    outputSchema: pushCardOutputSchema,

    execute: async ({ context: input }) => {
      const { type, resourceId, data, text } = input;

      // 验证：resourceId 和 data 至少需要有一个
      if (!resourceId && !data) {
        return {
          success: false,
          error: '必须提供 resourceId 或 data 参数'
        };
      }

      // 使用 resourceId 或 data.id 作为卡片标识
      const cardId = resourceId || data?.id;
      if (!cardId) {
        return {
          success: false,
          error: '必须提供 resourceId 或 data.id'
        };
      }

      // 获取 conversationId：优先使用传入的 context，否则从全局上下文获取
      const globalContext = pushCardToolContext.getContext();
      const conversationId = context?.conversationId || globalContext?.conversationId;
      const targetWindowId = context?.targetWindowId || globalContext?.targetWindowId;

      try {
        // 1. 推送卡片到聊天窗口（实时显示）
        pushCardToWindows(
          {
            type: type as ChatCardType,
            resourceId,
            data,
            text,
            conversationId
          },
          targetWindowId
        );

        // 2. 持久化卡片到消息历史（如果有 conversationId）
        if (conversationId) {
          try {
            // 构造消息内容：使用卡片标记格式，这样 ChatMessageRenderer 可以解析
            const cardToken = `[card:${type}:${cardId}]`;
            const messageContent = text ? `${text}\n\n${cardToken}` : cardToken;

            // 存储到数据库
            await ChatRepo.addMessage(conversationId, {
              role: 'assistant',
              content: messageContent,
              createdAt: Date.now(),
              metadata: JSON.stringify({
                card: {
                  type,
                  resourceId,
                  data
                }
              })
            });
          } catch (dbError) {
            console.warn('[pushCardTool] 持久化卡片失败:', dbError);
            // 不影响推送成功
          }
        }

        return {
          success: true
        };
      } catch (error: any) {
        return {
          success: false,
          error: error?.message || '推送卡片失败'
        };
      }
    }
  });

/**
 * 默认推送卡片工具实例（不绑定上下文）
 *
 * 注意：此工具会从 pushCardToolContext 获取 conversationId
 * 推荐在 ChatService 中设置上下文
 */
export const pushCardTool = createPushCardTool();
